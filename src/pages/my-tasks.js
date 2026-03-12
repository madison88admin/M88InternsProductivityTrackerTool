/**
 * My Tasks Page (Intern view)
 * View assigned tasks and request status updates.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate } from '../lib/utils.js';

export async function renderMyTasksPage() {
  const profile = getProfile();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, created_by_profile:profiles!tasks_created_by_fkey(full_name)')
    .eq('assigned_to', profile.id)
    .order('created_at', { ascending: false });

  const statusGroups = {
    not_started: (tasks || []).filter(t => t.status === 'not_started'),
    in_progress: (tasks || []).filter(t => t.status === 'in_progress'),
    completed: (tasks || []).filter(t => t.status === 'completed'),
  };

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">My Tasks</h1>
      <p class="page-subtitle">View and manage your assigned tasks</p>
    </div>

    <!-- Status Tabs -->
    <div class="filter-tabs mb-6">
      <button class="filter-tab active task-tab" data-status="all">
        All (${tasks?.length || 0})
      </button>
      <button class="filter-tab task-tab" data-status="not_started">
        Not Started (${statusGroups.not_started.length})
      </button>
      <button class="filter-tab task-tab" data-status="in_progress">
        In Progress (${statusGroups.in_progress.length})
      </button>
      <button class="filter-tab task-tab" data-status="completed">
        Completed (${statusGroups.completed.length})
      </button>
    </div>

    <!-- Task List -->
    <div id="task-list" class="space-y-4">
      ${(tasks || []).map(task => renderTaskCard(task)).join('')}
      ${(!tasks || tasks.length === 0) ? `
        <div class="card text-center py-12">
          <div class="text-neutral-300 mb-3">${icons.tasks}</div>
          <p class="text-neutral-500">No tasks assigned yet</p>
          <p class="text-sm text-neutral-400 mt-1">Your supervisor will assign tasks to you</p>
        </div>
      ` : ''}
    </div>
  `, (el) => {
    // Status filter tabs
    el.querySelectorAll('.task-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.task-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        const status = tab.dataset.status;
        el.querySelectorAll('.task-card').forEach(card => {
          if (status === 'all' || card.dataset.status === status) {
            card.style.display = '';
          } else {
            card.style.display = 'none';
          }
        });
      });
    });

    // Status change buttons
    el.querySelectorAll('.task-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const taskId = btn.dataset.taskId;
        const newStatus = btn.dataset.newStatus;

        btn.disabled = true;
        try {
          if (newStatus === 'in_progress') {
            // Starting a task: apply immediately, just notify supervisor
            const { error } = await supabase
              .from('tasks')
              .update({ status: 'in_progress' })
              .eq('id', taskId);

            if (error) throw error;

            // Notify supervisor that task is now in progress
            const { data: taskData } = await supabase
              .from('tasks')
              .select('title')
              .eq('id', taskId)
              .single();

            const taskStartNotif = {
              type: 'system',
              title: 'Task In Progress',
              message: `${profile.full_name} has started working on "${taskData?.title || 'a task'}".`,
              entity_type: 'task',
              entity_id: taskId,
            };

            if (profile.supervisor_id) {
              await supabase.from('notifications').insert({ user_id: profile.supervisor_id, ...taskStartNotif });
            }

            // Also notify all active admins
            const { data: admins } = await supabase
              .from('profiles')
              .select('id')
              .eq('role', 'admin')
              .eq('is_active', true);

            if (admins && admins.length > 0) {
              const adminNotifs = admins
                .filter(a => a.id !== profile.supervisor_id)
                .map(a => ({ user_id: a.id, ...taskStartNotif }));
              if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);
            }

            await logAudit('task.started', 'task', taskId, { status: 'in_progress' });
            showToast('Task started!', 'success');
          } else {
            // Completing a task: still requires supervisor approval
            const { error } = await supabase
              .from('tasks')
              .update({ pending_status: newStatus })
              .eq('id', taskId);

            if (error) throw error;

            // Create approval entry
            await supabase.from('approvals').insert({
              type: 'task_status',
              entity_id: taskId,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
              comments: `Requesting status change to: ${newStatus.replace('_', ' ')}`,
            });

            // Notify supervisor
            const taskCompleteNotif = {
              type: 'pending_approval',
              title: 'Task Status Change Request',
              message: `${profile.full_name} is requesting to change task status to "${newStatus.replace('_', ' ')}"`,
              entity_type: 'task',
              entity_id: taskId,
            };

            if (profile.supervisor_id) {
              await supabase.from('notifications').insert({ user_id: profile.supervisor_id, ...taskCompleteNotif });
            }

            // Also notify all active admins
            const { data: admins } = await supabase
              .from('profiles')
              .select('id')
              .eq('role', 'admin')
              .eq('is_active', true);

            if (admins && admins.length > 0) {
              const adminNotifs = admins
                .filter(a => a.id !== profile.supervisor_id)
                .map(a => ({ user_id: a.id, ...taskCompleteNotif }));
              if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);
            }

            await logAudit('task.status_change_requested', 'task', taskId, { requested_status: newStatus });
            showToast('Completion request sent to supervisor', 'success');
          }
          renderMyTasksPage();
        } catch (err) {
          showToast(err.message || 'Failed to update task status', 'error');
          btn.disabled = false;
        }
      });
    });
  }, '/my-tasks');
}

function renderTaskCard(task) {
  const statusColors = {
    not_started: 'neutral',
    in_progress: 'warning',
    completed: 'success',
  };
  const color = statusColors[task.status] || 'neutral';

  const nextStatuses = {
    not_started: ['in_progress'],
    in_progress: ['completed'],
    completed: [],
  };

  return `
    <div class="card task-card" data-status="${task.status}" data-id="${task.id}">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <h4 class="font-semibold text-neutral-900">${task.title}</h4>
            <span class="badge bg-${color}-50 text-${color}-600">${task.status.replace('_', ' ')}</span>
            ${task.pending_status ? `<span class="badge-pending">Pending: ${task.pending_status.replace('_', ' ')}</span>` : ''}
          </div>
          ${task.description ? `<p class="text-sm text-neutral-600 mb-2">${task.description}</p>` : ''}
          <div class="flex items-center gap-4 text-xs text-neutral-400">
            <span>Assigned by: ${task.created_by_profile?.full_name || 'Unknown'}</span>
            ${task.estimated_hours ? `<span>Est: ${task.estimated_hours}h</span>` : ''}
            ${task.due_date ? `<span>Due: ${formatDate(task.due_date)}</span>` : ''}
            <span>Created: ${formatDate(task.created_at)}</span>
          </div>
        </div>
        <div class="flex gap-2 ml-4">
          ${nextStatuses[task.status]?.map(ns => `
            <button class="btn-sm btn-primary task-status-btn" data-task-id="${task.id}" data-new-status="${ns}"
              ${task.pending_status ? 'disabled' : ''}>
              ${ns === 'in_progress' ? 'Start' : 'Complete'}
            </button>
          `).join('') || ''}
        </div>
      </div>
    </div>
  `;
}
