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
import { formatDate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderTaskManagementPage() {
  const profile = getProfile();
  const role = getUserRole();
  const isAdmin = role === 'admin';

  // Fetch team interns
  let internsQuery = supabase.from('profiles').select('id, full_name').eq('role', 'intern').eq('is_active', true);
  if (!isAdmin) {
    internsQuery = internsQuery.eq('supervisor_id', profile.id);
  }
  const { data: interns } = await internsQuery;

  // Fetch tasks
  let tasksQuery = supabase
    .from('tasks')
    .select('*, assigned_profile:profiles!tasks_assigned_to_fkey(full_name), creator_profile:profiles!tasks_created_by_fkey(full_name)')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    tasksQuery = tasksQuery.eq('created_by', profile.id);
  }

  const { data: tasks } = await tasksQuery;

  renderLayout(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-neutral-800">Task Management</h1>
        <p class="text-neutral-500 mt-1">Create and manage intern tasks</p>
      </div>
      <button id="create-task-btn" class="btn-primary" ${(!interns || interns.length === 0) ? 'disabled title="No interns available"' : ''}>
        ${icons.plus}
        <span class="ml-2">Create Task</span>
      </button>
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
              <th>Actions</th>
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
                <td>
                  <div class="flex gap-1">
                    <button class="btn-sm btn-secondary edit-task-btn" data-task-id="${task.id}" title="Edit">
                      ${icons.edit}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${(!tasks || tasks.length === 0) ? '<tr><td colspan="7" class="text-center text-neutral-400 py-8">No tasks created yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    // Create task button
    el.querySelector('#create-task-btn')?.addEventListener('click', () => {
      openCreateTaskModal(interns, profile);
    });

    // Edit task buttons
    el.querySelectorAll('.edit-task-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const taskId = btn.dataset.taskId;
        const task = tasks.find(t => t.id === taskId);
        if (task) openEditTaskModal(task, interns, profile);
      });
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
        <select id="task-intern" class="form-input" required>
          <option value="">Select an intern...</option>
          ${(interns || []).map(i => `<option value="${i.id}">${i.full_name}</option>`).join('')}
        </select>
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

    el.querySelector('#create-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = el.querySelector('#task-title').value.trim();
      const description = el.querySelector('#task-description').value.trim();
      const assignedTo = el.querySelector('#task-intern').value;
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
        <select id="task-intern" class="form-input">
          ${(interns || []).map(i => `<option value="${i.id}" ${i.id === task.assigned_to ? 'selected' : ''}>${i.full_name}</option>`).join('')}
        </select>
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
