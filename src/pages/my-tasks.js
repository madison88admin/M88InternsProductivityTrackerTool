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
import { createModal } from '../lib/component.js';

export async function renderMyTasksPage() {
  const profile = getProfile();

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, created_by_profile:profiles!tasks_created_by_fkey(full_name)')
    .eq('assigned_to', profile.id)
    .order('created_at', { ascending: false });

  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'intern_task_submission')
    .maybeSingle();
  const taskSubmissionEnabled = settingRow?.value?.enabled === true;

  const allTasks = tasks || [];
  const pendingReviewTasks = allTasks.filter(t => t.is_self_submitted && t.submission_status === 'pending');

  const statusGroups = {
    not_started: allTasks.filter(t => t.status === 'not_started' && t.submission_status !== 'pending'),
    in_progress: allTasks.filter(t => t.status === 'in_progress'),
    completed: allTasks.filter(t => t.status === 'completed'),
  };

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">My Tasks</h1>
        <p class="page-subtitle">View and manage your assigned tasks</p>
        ${taskSubmissionEnabled && profile.supervisor_id ? `
          <button id="submit-task-btn" class="btn-primary mt-3">
            ${icons.tasks}
            <span class="ml-2">Submit Task</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Status Tabs -->
    <div class="filter-tabs mb-6">
      <button class="filter-tab active task-tab" data-status="all">
        All (${allTasks.length})
      </button>
      ${pendingReviewTasks.length > 0 ? `
        <button class="filter-tab task-tab" data-status="pending_review">
          Pending Review (${pendingReviewTasks.length})
        </button>
      ` : ''}
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
      ${allTasks.map(task => renderTaskCard(task)).join('')}
      ${allTasks.length === 0 ? `
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
          if (status === 'all') {
            card.style.display = '';
          } else if (status === 'pending_review') {
            card.style.display = card.dataset.submissionStatus === 'pending' ? '' : 'none';
          } else {
            card.style.display = (card.dataset.status === status && card.dataset.submissionStatus !== 'pending') ? '' : 'none';
          }
        });
      });
    });

    // Submit Task button
    el.querySelector('#submit-task-btn')?.addEventListener('click', () => {
      createModal('Submit Task', `
        <form id="submit-task-form" class="space-y-4">
          <div>
            <label class="form-label">Task Title <span class="text-danger-500">*</span></label>
            <input type="text" id="submit-task-title" class="form-input" placeholder="What did you work on?" required />
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea id="submit-task-description" class="form-input" rows="3" placeholder="Provide additional details about this task..."></textarea>
          </div>
          <p class="text-xs text-neutral-400">Your supervisor will review and may edit this task before approving it.</p>
          <div class="flex justify-end gap-3">
            <button type="button" id="submit-task-cancel" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Submit for Review</button>
          </div>
        </form>
      `, (modalEl, close) => {
        modalEl.querySelector('#submit-task-cancel').addEventListener('click', close);

        modalEl.querySelector('#submit-task-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = modalEl.querySelector('#submit-task-title').value.trim();
          const description = modalEl.querySelector('#submit-task-description').value.trim();

          if (!title) {
            showToast('Please enter a task title', 'error');
            return;
          }

          const submitBtn = modalEl.querySelector('button[type="submit"]');
          submitBtn.disabled = true;

          try {
            const { data: newTask, error: taskError } = await supabase
              .from('tasks')
              .insert({
                title,
                description: description || null,
                status: 'not_started',
                is_self_submitted: true,
                submission_status: 'pending',
                assigned_to: profile.id,
                created_by: profile.id,
              })
              .select()
              .single();

            if (taskError) throw taskError;

            await supabase.from('approvals').insert({
              type: 'task_submission',
              entity_id: newTask.id,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
            });

            if (profile.supervisor_id) {
              await supabase.from('notifications').insert({
                user_id: profile.supervisor_id,
                type: 'pending_approval',
                title: 'Task Submission for Review',
                message: `${profile.full_name} submitted a task for your review: "${title}"`,
                entity_type: 'task',
                entity_id: newTask.id,
              });
            }

            await logAudit('task.self_submitted', 'task', newTask.id, { title });
            showToast('Task submitted for review', 'success');
            close();
            renderMyTasksPage();
          } catch (err) {
            showToast(err.message || 'Failed to submit task', 'error');
            submitBtn.disabled = false;
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

  const isPendingReview = task.is_self_submitted && task.submission_status === 'pending';
  const isRejectedSubmission = task.is_self_submitted && task.submission_status === 'rejected';

  const nextStatuses = {
    not_started: ['in_progress'],
    in_progress: ['completed'],
    completed: [],
  };

  const showActions = !isPendingReview && !isRejectedSubmission;

  return `
    <div class="card task-card" data-status="${task.status}" data-id="${task.id}" data-submission-status="${task.submission_status || ''}">
      <div class="flex items-start justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2 flex-wrap">
            <h4 class="font-semibold text-neutral-900">${task.title}</h4>
            ${!isPendingReview && !isRejectedSubmission ? `
              <span class="badge bg-${color}-50 text-${color}-600">${task.status.replace('_', ' ')}</span>
            ` : ''}
            ${task.pending_status ? `<span class="badge-pending">Pending: ${task.pending_status.replace('_', ' ')}</span>` : ''}
            ${isPendingReview ? `<span class="badge bg-warning-50 text-warning-600">Pending Review</span>` : ''}
            ${isRejectedSubmission ? `<span class="badge bg-danger-50 text-danger-600">Submission Rejected</span>` : ''}
            ${task.is_self_submitted && task.submission_status === 'approved' ? `<span class="badge bg-neutral-100 text-neutral-500 text-xs">Self-submitted</span>` : ''}
          </div>
          ${task.description ? `<p class="text-sm text-neutral-600 mb-2">${task.description}</p>` : ''}
          <div class="flex items-center gap-4 text-xs text-neutral-400 flex-wrap">
            ${!task.is_self_submitted ? `<span>Assigned by: ${task.created_by_profile?.full_name || 'Unknown'}</span>` : `<span>Submitted by you</span>`}
            ${task.estimated_hours ? `<span>Est: ${task.estimated_hours}h</span>` : ''}
            ${task.due_date ? `<span>Due: ${formatDate(task.due_date)}</span>` : ''}
            <span>Created: ${formatDate(task.created_at)}</span>
          </div>
          ${isPendingReview ? `
            <p class="text-xs text-warning-600 mt-2">Awaiting supervisor review before this task becomes active.</p>
          ` : ''}
        </div>
        ${showActions ? `
          <div class="flex gap-2 ml-4">
            ${nextStatuses[task.status]?.map(ns => `
              <button class="btn-sm btn-primary task-status-btn" data-task-id="${task.id}" data-new-status="${ns}"
                ${task.pending_status ? 'disabled' : ''}>
                ${ns === 'in_progress' ? 'Start' : 'Complete'}
              </button>
            `).join('') || ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
