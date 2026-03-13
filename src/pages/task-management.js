/**
 * Task Management Page (Supervisor view)
 * Create, assign, and manage tasks for interns.
 */
import { getProfile, getUserRole } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, renderAvatar } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderTaskManagementPage() {
  const profile = getProfile();
  const role = getUserRole();
  const isAdmin = role === 'admin';
  // Admin with a department can create/manage tasks for their department's interns
  const isDeptAdmin = isAdmin && !!profile.department_id;
  const canManageTasks = !isAdmin || isDeptAdmin;

  // Fetch assignable interns based on role
  let internsQuery = supabase.from('profiles').select('id, full_name, avatar_url').eq('role', 'intern').eq('is_active', true);
  if (isDeptAdmin) {
    internsQuery = internsQuery.eq('department_id', profile.department_id);
  } else if (!isAdmin) {
    // supervisor: own interns only
    internsQuery = internsQuery.eq('supervisor_id', profile.id);
  }
  const { data: interns } = canManageTasks ? await internsQuery : { data: [] };

  // Fetch tasks — supervisors see only their own; admins see all
  let tasksQuery = supabase
    .from('tasks')
    .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name), creator_profile:profiles!tasks_created_by_fkey(full_name)')
    .eq('is_archived', false)
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    tasksQuery = tasksQuery.eq('created_by', profile.id);
  }

  const { data: tasks } = await tasksQuery;

  renderLayout(`
    <div class="flex items-center justify-between page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Task Management</h1>
        <p class="page-subtitle">${canManageTasks ? 'Create and manage intern tasks' : 'View and track intern tasks'}</p>
      </div>
      <div class="flex gap-2">
        <button id="view-archive-btn" class="btn-secondary">
          ${icons.archive}
          <span class="ml-2">View Archive</span>
        </button>
        ${canManageTasks ? `
        <button id="create-task-btn" class="btn-primary" ${(!interns || interns.length === 0) ? 'disabled title="No interns available in your department"' : ''}>
          ${icons.plus}
          <span class="ml-2">Create Task</span>
        </button>` : ''}
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-2 mb-6">
      <select id="filter-status" class="form-input w-auto">
        <option value="">All Statuses</option>
        <option value="not_started">Not Started</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
      </select>
      <select id="filter-intern" class="form-input w-auto">
        <option value="">All Interns</option>
        ${(interns || []).map(i => `<option value="${i.id}">${i.full_name}</option>`).join('')}
      </select>
    </div>

    <!-- Task Table -->
    <div class="card">
      <div class="overflow-x-auto">
        <table class="data-table" id="tasks-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Assigned To</th>
              <th>Status</th>
              <th>Est. Hours</th>
              <th>Due Date</th>
              <th>Created</th>
              ${canManageTasks ? '<th>Actions</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${(tasks || []).map(task => `
              <tr data-status="${task.status}" data-intern="${task.assigned_to}">
                <td>
                  <div>
                    <p class="font-medium">${task.title}</p>
                    ${task.description ? `<p class="text-xs text-neutral-400 truncate max-w-xs">${task.description}</p>` : ''}
                  </div>
                </td>
                <td>${task.assigned_profile?.full_name || '—'}</td>
                <td>
                  <span class="badge bg-${task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'warning' : 'neutral'}-50 text-${task.status === 'completed' ? 'success' : task.status === 'in_progress' ? 'warning' : 'neutral'}-600">
                    ${task.status.replace('_', ' ')}
                  </span>
                  ${task.pending_status ? `<span class="badge-pending ml-1">→ ${task.pending_status.replace('_', ' ')}</span>` : ''}
                </td>
                <td>${task.estimated_hours || '—'}</td>
                <td>${task.due_date ? formatDate(task.due_date) : '—'}</td>
                <td>${formatDate(task.created_at)}</td>
                ${canManageTasks ? `
                <td>
                  ${task.created_by === profile.id ? `
                  <div class="flex gap-1">
                    <button class="btn-sm btn-secondary edit-task-btn" data-task-id="${task.id}" title="Edit">
                      ${icons.edit}
                    </button>
                    <button
                      class="btn-sm btn-warning archive-task-btn"
                      data-task-id="${task.id}"
                      title="${task.status === 'completed' ? 'Archive task' : 'Only completed tasks can be archived'}"
                      ${task.status !== 'completed' ? 'disabled' : ''}>
                      ${icons.archive}
                    </button>
                  </div>` : '<span class="text-xs text-neutral-400">—</span>'}
                </td>` : ''}
              </tr>
            `).join('')}
            ${(!tasks || tasks.length === 0) ? `<tr><td colspan="${canManageTasks ? 7 : 6}" class="text-center text-neutral-400 py-8">No tasks found</td></tr>` : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    if (canManageTasks) {
      el.querySelector('#create-task-btn')?.addEventListener('click', () => {
        openCreateTaskModal(interns, profile);
      });

      // Edit task buttons (only rendered for tasks created by this user)
      el.querySelectorAll('.edit-task-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const task = tasks.find(t => t.id === btn.dataset.taskId);
          if (task) openEditTaskModal(task, interns, profile);
        });
      });

      // Archive task buttons
      el.querySelectorAll('.archive-task-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const task = tasks.find(t => t.id === btn.dataset.taskId);
          if (task) confirmArchiveTask(task);
        });
      });
    }

    el.querySelector('#view-archive-btn').addEventListener('click', () => {
      openArchivedTasksModal(profile, isAdmin, canManageTasks);
    });

    // Filters
    const filterStatus = el.querySelector('#filter-status');
    const filterIntern = el.querySelector('#filter-intern');

    const applyFilters = () => {
      const status = filterStatus.value;
      const intern = filterIntern.value;
      el.querySelectorAll('#tasks-table tbody tr').forEach(row => {
        const matchStatus = !status || row.dataset.status === status;
        const matchIntern = !intern || row.dataset.intern === intern;
        row.style.display = (matchStatus && matchIntern) ? '' : 'none';
      });
    };

    filterStatus.addEventListener('change', applyFilters);
    filterIntern.addEventListener('change', applyFilters);
  }, '/task-management');
}

function internPickerHtml(interns, selectedId = '') {
  const selected = selectedId ? interns.find(i => i.id === selectedId) : null;
  return `
    <div class="relative" id="intern-picker">
      <button type="button" id="intern-picker-btn"
        class="form-input items-center w-full text-left"
        style="display:flex; justify-content:space-between; align-items:center;">
        <span class="flex items-center gap-2 min-w-0">
          <span id="intern-picker-avatar" class="shrink-0">
            ${selected ? renderAvatar(selected, 'w-6 h-6', 'text-xs') : ''}
          </span>
          <span id="intern-picker-name" class="truncate ${selected ? 'text-neutral-900' : 'text-neutral-400'}">
            ${selected ? selected.full_name : 'Select an intern...'}
          </span>
        </span>
        <span class="shrink-0 text-neutral-400 pointer-events-none">${icons.chevronDown}</span>
      </button>
      <div id="intern-picker-list"
        class="hidden absolute z-50 w-full bg-white border border-neutral-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
        ${(interns || []).map(i => `
          <div class="intern-option flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 cursor-pointer ${i.id === selectedId ? 'bg-primary-50' : ''}"
            data-value="${i.id}">
            ${renderAvatar(i, 'w-7 h-7', 'text-xs')}
            <span class="text-sm">${i.full_name}</span>
          </div>
        `).join('')}
      </div>
      <input type="hidden" id="task-intern" value="${selectedId}" />
    </div>
  `;
}

function initInternPicker(el, interns) {
  const list = el.querySelector('#intern-picker-list');
  const hidden = el.querySelector('#task-intern');
  const avatarSlot = el.querySelector('#intern-picker-avatar');
  const nameSlot = el.querySelector('#intern-picker-name');

  el.querySelector('#intern-picker-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    list.classList.toggle('hidden');
  });

  el.querySelectorAll('.intern-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const intern = interns.find(i => i.id === opt.dataset.value);
      if (!intern) return;
      hidden.value = intern.id;
      avatarSlot.innerHTML = renderAvatar(intern, 'w-6 h-6', 'text-xs');
      nameSlot.textContent = intern.full_name;
      nameSlot.className = 'truncate text-neutral-900';
      el.querySelectorAll('.intern-option').forEach(o => o.classList.remove('bg-primary-50'));
      opt.classList.add('bg-primary-50');
      list.classList.add('hidden');
    });
  });

  const closeOutside = (e) => {
    if (!el.isConnected) { document.removeEventListener('click', closeOutside); return; }
    if (!el.querySelector('#intern-picker').contains(e.target)) list.classList.add('hidden');
  };
  document.addEventListener('click', closeOutside);
}

function openCreateTaskModal(interns, profile) {
  createModal('Create Task', `
    <form id="create-task-form" class="space-y-4">
      <div>
        <label class="form-label">Title <span class="text-danger-500">*</span></label>
        <input type="text" id="task-title" class="form-input" placeholder="Task title" required />
      </div>

      <div>
        <label class="form-label">Description</label>
        <textarea id="task-description" class="form-input" rows="3" placeholder="Task description (optional)"></textarea>
      </div>

      <div>
        <label class="form-label">Assign To <span class="text-danger-500">*</span></label>
        ${internPickerHtml(interns)}
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="form-label">Estimated Hours</label>
          <input type="number" id="task-hours" class="form-input" step="0.5" min="0" placeholder="Optional" />
        </div>
        <div>
          <label class="form-label">Due Date</label>
          <input type="date" id="task-due" class="form-input" />
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="task-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="task-submit" class="btn-primary">Create Task</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#task-cancel').addEventListener('click', close);
    initInternPicker(el, interns);

    el.querySelector('#create-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = el.querySelector('#task-title').value.trim();
      const description = el.querySelector('#task-description').value.trim();
      const assignedTo = el.querySelector('#task-intern').value;
      if (!assignedTo) { showToast('Please select an intern', 'error'); return; }
      const estimatedHours = el.querySelector('#task-hours').value || null;
      const dueDate = el.querySelector('#task-due').value || null;

      const submitBtn = el.querySelector('#task-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating...';

      try {
        const { data, error } = await supabase
          .from('tasks')
          .insert({
            title,
            description: description || null,
            assigned_to: assignedTo,
            created_by: profile.id,
            estimated_hours: estimatedHours ? parseFloat(estimatedHours) : null,
            due_date: dueDate,
            department_id: profile.department_id,
          })
          .select()
          .single();

        if (error) throw error;

        // Notify intern
        await supabase.from('notifications').insert({
          user_id: assignedTo,
          type: 'system',
          title: 'New Task Assigned',
          message: `You have been assigned a new task: "${title}"`,
          entity_type: 'task',
          entity_id: data.id,
        });

        await logAudit('task.created', 'task', data.id, { title, assigned_to: assignedTo });
        showToast('Task created successfully', 'success');
        close();
        renderTaskManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to create task', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Task';
      }
    });
  });
}

function openEditTaskModal(task, interns, profile) {
  createModal('Edit Task', `
    <form id="edit-task-form" class="space-y-4">
      <div>
        <label class="form-label">Title <span class="text-danger-500">*</span></label>
        <input type="text" id="task-title" class="form-input" value="${task.title}" required />
      </div>

      <div>
        <label class="form-label">Description</label>
        <textarea id="task-description" class="form-input" rows="3">${task.description || ''}</textarea>
      </div>

      <div>
        <label class="form-label">Assigned To</label>
        ${internPickerHtml(interns, task.assigned_to)}
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="form-label">Estimated Hours</label>
          <input type="number" id="task-hours" class="form-input" step="0.5" min="0" value="${task.estimated_hours || ''}" />
        </div>
        <div>
          <label class="form-label">Due Date</label>
          <input type="date" id="task-due" class="form-input" value="${task.due_date || ''}" />
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-submit" class="btn-primary">Save Changes</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#edit-cancel').addEventListener('click', close);
    initInternPicker(el, interns);

    el.querySelector('#edit-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const submitBtn = el.querySelector('#edit-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const { error } = await supabase
          .from('tasks')
          .update({
            title: el.querySelector('#task-title').value.trim(),
            description: el.querySelector('#task-description').value.trim() || null,
            assigned_to: el.querySelector('#task-intern').value,
            estimated_hours: el.querySelector('#task-hours').value ? parseFloat(el.querySelector('#task-hours').value) : null,
            due_date: el.querySelector('#task-due').value || null,
          })
          .eq('id', task.id);

        if (error) throw error;

        await logAudit('task.updated', 'task', task.id, { title: el.querySelector('#task-title').value });
        showToast('Task updated successfully', 'success');
        close();
        renderTaskManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to update task', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
      }
    });
  });
}

function confirmArchiveTask(task) {
  createModal('Archive Task', `
    <div class="space-y-4">
      <p class="text-sm text-neutral-600">
        Archive the task <strong>"${task.title}"</strong>? It will be hidden from the task list and can be found in the archive.
      </p>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="archive-cancel" class="btn-secondary">Cancel</button>
        <button type="button" id="archive-confirm" class="btn-warning">Archive Task</button>
      </div>
    </div>
  `, (el, close) => {
    el.querySelector('#archive-cancel').addEventListener('click', close);

    el.querySelector('#archive-confirm').addEventListener('click', async () => {
      const confirmBtn = el.querySelector('#archive-confirm');
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Archiving...';

      try {
        const { error } = await supabase.from('tasks').update({ is_archived: true }).eq('id', task.id);
        if (error) throw error;

        await logAudit('task.archived', 'task', task.id, { title: task.title });
        showToast('Task archived', 'success');
        close();
        renderTaskManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to archive task', 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Archive Task';
      }
    });
  });
}

async function openArchivedTasksModal(profile, isAdmin, canManageTasks) {
  let query = supabase
    .from('tasks')
    .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name), creator_profile:profiles!tasks_created_by_fkey(full_name)')
    .eq('is_archived', true)
    .order('updated_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('created_by', profile.id);
  }

  const { data: archived } = await query;

  createModal('Archived Tasks', `
    <div class="space-y-4">
      ${!archived || archived.length === 0
        ? '<p class="text-sm text-neutral-400 text-center py-6">No archived tasks.</p>'
        : `<div class="overflow-x-auto">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Assigned To</th>
                  <th>Created By</th>
                  ${canManageTasks ? '<th>Action</th>' : ''}
                </tr>
              </thead>
              <tbody>
                ${archived.map(task => `
                  <tr>
                    <td>
                      <p class="font-medium">${task.title}</p>
                      ${task.description ? `<p class="text-xs text-neutral-400 truncate max-w-xs">${task.description}</p>` : ''}
                    </td>
                    <td>${task.assigned_profile?.full_name || '—'}</td>
                    <td>${task.creator_profile?.full_name || '—'}</td>
                    ${canManageTasks ? `
                    <td>
                      ${task.created_by === profile.id ? `
                        <button class="btn-sm btn-secondary unarchive-btn" data-task-id="${task.id}" title="Restore task">
                          ${icons.unarchive}
                        </button>
                      ` : '<span class="text-xs text-neutral-400">—</span>'}
                    </td>` : ''}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
      <div class="flex justify-end pt-2">
        <button type="button" id="archive-close" class="btn-secondary">Close</button>
      </div>
    </div>
  `, (el, close) => {
    el.querySelector('#archive-close').addEventListener('click', close);

    el.querySelectorAll('.unarchive-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          const { error } = await supabase.from('tasks').update({ is_archived: false }).eq('id', btn.dataset.taskId);
          if (error) throw error;
          await logAudit('task.unarchived', 'task', btn.dataset.taskId);
          showToast('Task restored', 'success');
          close();
          renderTaskManagementPage();
        } catch (err) {
          showToast(err.message || 'Failed to restore task', 'error');
          btn.disabled = false;
        }
      });
    });
  });
}
