/**
 * User Management Page (Admin)
 * Manage all user accounts — invite, edit, activate/deactivate.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, renderAvatar } from '../lib/utils.js';
import { createModal, confirmDialog } from '../lib/component.js';

export async function renderUserManagementPage() {
  const profile = getProfile();

  const { data: users } = await supabase
    .from('profiles')
    .select('*, departments(name), locations(name)')
    .order('created_at', { ascending: false });

  const { data: departments } = await supabase.from('departments').select('id, name').eq('is_active', true);
  const { data: locations } = await supabase.from('locations').select('id, name').eq('is_active', true);
  const { data: supervisors } = await supabase
    .from('profiles')
    .select('id, full_name, department_id')
    .or('role.eq.supervisor,and(role.eq.admin,department_id.not.is.null)')
    .eq('is_active', true)
    .order('full_name');

  renderLayout(`
    <div class="flex items-center justify-between page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">User Maintenance</h1>
        <p class="page-subtitle">Manage system users and accounts</p>
      </div>
      <button id="invite-user-btn" class="btn-primary">
        ${icons.plus}
        <span class="ml-2">Invite User</span>
      </button>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-2 mb-6">
      <select id="filter-role" class="form-input w-auto">
        <option value="">All Roles</option>
        <option value="admin">Admin</option>
        <option value="supervisor">Supervisor</option>
        <option value="intern">Intern</option>
      </select>
      <select id="filter-status" class="form-input w-auto">
        <option value="">All Status</option>
        <option value="active">Active</option>
        <option value="inactive">Inactive</option>
      </select>
      <input type="text" id="filter-search" class="form-input w-auto" placeholder="Search by name or email..." />
    </div>

    <!-- Users Table -->
    <div class="card">
      <div class="overflow-x-auto">
        <table class="data-table" id="users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Role</th>
              <th>Department</th>
              <th>Location</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(users || []).map(user => `
              <tr data-role="${user.role}" data-active="${user.is_active}" data-name="${(user.full_name || '').toLowerCase()}" data-email="${(user.email || '').toLowerCase()}">
                <td>
                  <div class="flex items-center gap-3">
                    ${renderAvatar(user, 'w-8 h-8', 'text-sm')}
                    <div>
                      <p class="font-medium">${user.full_name || 'Unknown'}</p>
                      <p class="text-xs text-neutral-400">${user.email}</p>
                    </div>
                  </div>
                </td>
                <td><span class="badge-info capitalize">${user.role}</span></td>
                <td>${user.departments?.name || '—'}</td>
                <td>${user.locations?.name || '—'}</td>
                <td>
                  <span class="badge-${user.is_active ? 'approved' : 'rejected'}">
                    ${user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td>${formatDate(user.created_at)}</td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn-sm btn-secondary edit-user-btn" data-user-id="${user.id}" title="Edit">
                      ${icons.edit}
                    </button>
                    <button class="btn-sm ${user.is_active ? 'btn-warning' : 'btn-success'} toggle-user-btn"
                            data-user-id="${user.id}" data-active="${user.is_active}"
                            title="${user.is_active ? 'Deactivate' : 'Activate'}"
                            ${user.id === profile.id ? 'disabled' : ''}>
                      ${user.is_active ? icons.x : icons.check}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    // Invite user
    el.querySelector('#invite-user-btn').addEventListener('click', () => {
      openInviteModal(departments, locations, supervisors);
    });

    // Edit user
    el.querySelectorAll('.edit-user-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const user = users.find(u => u.id === btn.dataset.userId);
        if (user) openEditUserModal(user, departments, locations, supervisors);
      });
    });

    // Toggle active
    el.querySelectorAll('.toggle-user-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = btn.dataset.userId;
        const isActive = btn.dataset.active === 'true';
        const user = users.find(u => u.id === userId);

        // If activating, proceed directly
        if (!isActive) {
          confirmDialog(
            `Are you sure you want to activate ${user?.full_name}?`,
            async () => {
              try {
                await supabase.from('profiles').update({ is_active: true }).eq('id', userId);
                await logAudit('user.activated', 'user', userId);
                showToast(`User activated`, 'success');
                renderUserManagementPage();
              } catch (err) {
                showToast('Failed to update user', 'error');
              }
            },
            'Activate'
          );
          return;
        }

        // If deactivating, validate based on role
        try {
          if (user.role === 'supervisor') {
            // Check for assigned interns
            const { data: assignedInterns, error: internError } = await supabase
              .from('profiles')
              .select('id, full_name')
              .eq('supervisor_id', userId)
              .eq('is_active', true);

            if (internError) throw internError;

            if (assignedInterns && assignedInterns.length > 0) {
              const internNames = assignedInterns.map(i => i.full_name).join(', ');
              showToast(
                `Cannot deactivate supervisor. The following interns are still assigned: ${internNames}`,
                'error'
              );
              return;
            }
          } else if (user.role === 'intern') {
            // Check for assigned or in-progress tasks
            const { data: activeTasks, error: taskError } = await supabase
              .from('tasks')
              .select('id, title, status')
              .eq('assigned_to', userId)
              .in('status', ['not_started', 'in_progress']);

            if (taskError) throw taskError;

            if (activeTasks && activeTasks.length > 0) {
              const taskSummary = activeTasks
                .map(t => `${t.title} (${t.status})`)
                .join(', ');
              showToast(
                `Cannot deactivate intern. The following tasks are still assigned or in progress: ${taskSummary}`,
                'error'
              );
              return;
            }
          }

          // Validation passed, proceed with deactivation
          confirmDialog(
            `Are you sure you want to deactivate ${user?.full_name}?`,
            async () => {
              try {
                await supabase.from('profiles').update({ is_active: false }).eq('id', userId);
                await logAudit('user.deactivated', 'user', userId);
                showToast(`User deactivated`, 'success');
                renderUserManagementPage();
              } catch (err) {
                showToast('Failed to update user', 'error');
              }
            },
            'Deactivate'
          );
        } catch (err) {
          showToast('Failed to validate deactivation', 'error');
        }
      });
    });

    // Filters
    const filterRole = el.querySelector('#filter-role');
    const filterStatus = el.querySelector('#filter-status');
    const filterSearch = el.querySelector('#filter-search');

    const applyFilters = () => {
      const role = filterRole.value;
      const active = filterStatus.value;
      const search = filterSearch.value.toLowerCase();

      el.querySelectorAll('#users-table tbody tr').forEach(row => {
        const matchRole = !role || row.dataset.role === role;
        const matchStatus = !active || (active === 'active' ? row.dataset.active === 'true' : row.dataset.active === 'false');
        const matchSearch = !search || row.dataset.name.includes(search) || row.dataset.email.includes(search);
        row.style.display = (matchRole && matchStatus && matchSearch) ? '' : 'none';
      });
    };

    filterRole.addEventListener('change', applyFilters);
    filterStatus.addEventListener('change', applyFilters);
    filterSearch.addEventListener('input', applyFilters);
  }, '/user-management');
}

/**
 * Auto-populate the supervisor select based on the chosen department.
 * - 1 match  → auto-select & disable (only one possibility)
 * - 2+ match → show only those supervisors so the admin picks
 * - 0 match  → show the full list as a fallback
 */
function applyDeptSupervisor(deptId, supervisors, selectEl, currentValue = null, emptyLabel = 'Select supervisor...') {
  const matching = deptId
    ? (supervisors || []).filter(s => s.department_id === deptId)
    : [];

  if (matching.length === 1) {
    selectEl.innerHTML = `<option value="${matching[0].id}">${matching[0].full_name}</option>`;
    selectEl.value = matching[0].id;
    selectEl.disabled = true;
  } else {
    const options = matching.length > 1 ? matching : (supervisors || []);
    selectEl.innerHTML = `<option value="">${emptyLabel}</option>` +
      options.map(s => `<option value="${s.id}">${s.full_name}</option>`).join('');
    selectEl.disabled = false;
    if (currentValue) selectEl.value = currentValue;
  }
}

function openInviteModal(departments, locations, supervisors) {
  createModal('Invite New User', `
    <form id="invite-form" class="space-y-4">
      <!-- Base fields (always visible) -->
      <div>
        <label class="form-label">Email <span class="text-danger-500">*</span></label>
        <input type="email" id="invite-email" class="form-input" placeholder="user@madison88.com" required />
      </div>
      <div>
        <label class="form-label">Full Name <span class="text-danger-500">*</span></label>
        <input type="text" id="invite-name" class="form-input" placeholder="Full name" required />
      </div>
      <div>
        <label class="form-label">Role <span class="text-danger-500">*</span></label>
        <select id="invite-role" class="form-input" required>
          <option value="">Select role...</option>
          <option value="intern">Intern</option>
          <option value="supervisor">Supervisor</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      <!-- Role-specific sections (shown after role is selected) -->
      <div id="role-fields" class="hidden space-y-4">

        <!-- Common fields for all roles -->
        <div id="common-fields" class="space-y-4">
          <div>
            <label class="form-label">Phone</label>
            <input type="tel" id="invite-phone" class="form-input" placeholder="Phone number" />
          </div>
          <div>
            <label class="form-label">Location</label>
            <select id="invite-location" class="form-input">
              <option value="">Select location...</option>
              ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Department</label>
            <select id="invite-department" class="form-input">
              <option value="">Select department...</option>
              ${(departments || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Intern-only fields -->
        <div id="intern-fields" class="hidden space-y-4">
          <div>
            <label class="form-label">Supervisor</label>
            <select id="invite-supervisor" class="form-input">
              <option value="">Select supervisor...</option>
              ${(supervisors || []).map(s => `<option value="${s.id}">${s.full_name}</option>`).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label">School</label>
              <input type="text" id="invite-school" class="form-input" placeholder="School name" />
            </div>
            <div>
              <label class="form-label">Course</label>
              <input type="text" id="invite-course" class="form-input" placeholder="Course / Program" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label">Hours Required</label>
              <input type="number" id="invite-hours" class="form-input" placeholder="e.g. 480" step="0.5" min="0" />
            </div>
            <div>
              <label class="form-label">OJT Start Date</label>
              <input type="date" id="invite-start" class="form-input" />
            </div>
          </div>
        </div>

      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="invite-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="invite-submit" class="btn-primary">Send Invitation</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#invite-cancel').addEventListener('click', close);

    // Show/hide role-specific fields based on selected role
    el.querySelector('#invite-role').addEventListener('change', (e) => {
      const role = e.target.value;
      const roleFields = el.querySelector('#role-fields');
      const internFields = el.querySelector('#intern-fields');

      roleFields.classList.toggle('hidden', !role);
      internFields.classList.toggle('hidden', role !== 'intern');

      // When switching to intern, apply dept→supervisor logic if a dept is already chosen
      if (role === 'intern') {
        const deptId = el.querySelector('#invite-department').value;
        applyDeptSupervisor(deptId, supervisors, el.querySelector('#invite-supervisor'));
      }
    });

    // Auto-populate supervisor when department changes (intern role only)
    el.querySelector('#invite-department').addEventListener('change', (e) => {
      if (el.querySelector('#invite-role').value !== 'intern') return;
      applyDeptSupervisor(e.target.value, supervisors, el.querySelector('#invite-supervisor'));
    });

    el.querySelector('#invite-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = el.querySelector('#invite-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      const email = el.querySelector('#invite-email').value;
      const fullName = el.querySelector('#invite-name').value.trim();
      const role = el.querySelector('#invite-role').value;
      const locationId = el.querySelector('#invite-location')?.value || null;
      const departmentId = el.querySelector('#invite-department')?.value || null;

      try {
        // Use Supabase auth to invite
        const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: {
            full_name: fullName,
            role,
            department_id: departmentId,
            location_id: locationId,
          },
        });

        if (error) throw error;

        // Update profile with all additional fields after creation
        if (data?.user?.id) {
          const updates = {
            department_id: departmentId,
            location_id: locationId,
            phone: el.querySelector('#invite-phone')?.value || null,
          };

          if (role === 'intern') {
            const supervisorId = el.querySelector('#invite-supervisor').value;
            if (supervisorId) updates.supervisor_id = supervisorId;
            updates.school = el.querySelector('#invite-school').value || null;
            updates.course = el.querySelector('#invite-course').value || null;
            const hours = el.querySelector('#invite-hours').value;
            updates.hours_required = hours ? parseFloat(hours) : null;
            updates.ojt_start_date = el.querySelector('#invite-start').value || null;
          }

          await supabase.from('profiles').update(updates).eq('id', data.user.id);
        }

        await logAudit('user.invited', 'user', data?.user?.id, { email, role });
        showToast(`Invitation sent to ${email}`, 'success');
        close();
        renderUserManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to send invitation', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Send Invitation';
      }
    });
  });
}

function openEditUserModal(user, departments, locations, supervisors) {
  createModal('Edit User', `
    <form id="edit-user-form" class="space-y-4">
      <!-- Base fields (always visible) -->
      <div>
        <label class="form-label">Email</label>
        <input type="email" id="edit-email" class="form-input" value="${user.email || ''}" disabled />
      </div>
      <div>
        <label class="form-label">Full Name <span class="text-danger-500">*</span></label>
        <input type="text" id="edit-name" class="form-input" value="${user.full_name || ''}" required />
      </div>
      <div>
        <label class="form-label">Role <span class="text-danger-500">*</span></label>
        <select id="edit-role" class="form-input" required>
          <option value="">Select role...</option>
          <option value="intern" ${user.role === 'intern' ? 'selected' : ''}>Intern</option>
          <option value="supervisor" ${user.role === 'supervisor' ? 'selected' : ''}>Supervisor</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>

      <!-- Role-specific sections (shown after role is selected) -->
      <div id="role-fields" class="${user.role ? '' : 'hidden'} space-y-4">

        <!-- Common fields for all roles -->
        <div id="common-fields" class="space-y-4">
          <div>
            <label class="form-label">Phone</label>
            <input type="tel" id="edit-phone" class="form-input" value="${user.phone || ''}" placeholder="Phone number" />
          </div>
          <div>
            <label class="form-label">Location</label>
            <select id="edit-location" class="form-input">
              <option value="">Select location...</option>
              ${(locations || []).map(l => `<option value="${l.id}" ${l.id === user.location_id ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Department</label>
            <select id="edit-department" class="form-input">
              <option value="">Select department...</option>
              ${(departments || []).map(d => `<option value="${d.id}" ${d.id === user.department_id ? 'selected' : ''}>${d.name}</option>`).join('')}
            </select>
          </div>
        </div>

        <!-- Intern-only fields -->
        <div id="intern-fields" class="${user.role === 'intern' ? '' : 'hidden'} space-y-4">
          <div>
            <label class="form-label">Supervisor</label>
            <select id="edit-supervisor" class="form-input">
              <option value="">Select supervisor...</option>
              ${(supervisors || []).map(s => `<option value="${s.id}" ${s.id === user.supervisor_id ? 'selected' : ''}>${s.full_name}</option>`).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label">School</label>
              <input type="text" id="edit-school" class="form-input" value="${user.school || ''}" placeholder="School name" />
            </div>
            <div>
              <label class="form-label">Course</label>
              <input type="text" id="edit-course" class="form-input" value="${user.course || ''}" placeholder="Course / Program" />
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="form-label">Hours Required</label>
              <input type="number" id="edit-hours" class="form-input" value="${user.hours_required || ''}" placeholder="e.g. 480" step="0.5" min="0" />
            </div>
            <div>
              <label class="form-label">OJT Start Date</label>
              <input type="date" id="edit-start" class="form-input" value="${user.ojt_start_date || ''}" />
            </div>
          </div>
        </div>

      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-submit" class="btn-primary">Save Changes</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#edit-cancel').addEventListener('click', close);

    // Show/hide role-specific fields based on selected role
    el.querySelector('#edit-role').addEventListener('change', (e) => {
      const role = e.target.value;
      const roleFields = el.querySelector('#role-fields');
      const internFields = el.querySelector('#intern-fields');

      roleFields.classList.toggle('hidden', !role);
      internFields.classList.toggle('hidden', role !== 'intern');

      // When switching to intern, apply dept→supervisor logic if a dept is already chosen
      if (role === 'intern') {
        const deptId = el.querySelector('#edit-department').value;
        applyDeptSupervisor(deptId, supervisors, el.querySelector('#edit-supervisor'), null, 'Select supervisor...');
      }
    });

    // Auto-populate supervisor when department changes (intern role only)
    el.querySelector('#edit-department').addEventListener('change', (e) => {
      if (el.querySelector('#edit-role').value !== 'intern') return;
      applyDeptSupervisor(e.target.value, supervisors, el.querySelector('#edit-supervisor'), null, 'Select supervisor...');
    });

    // On initial load for interns with a department, filter & auto-select supervisor
    if (user.role === 'intern' && user.department_id) {
      applyDeptSupervisor(user.department_id, supervisors, el.querySelector('#edit-supervisor'), user.supervisor_id, 'Select supervisor...');
    }

    el.querySelector('#edit-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = el.querySelector('#edit-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      const role = el.querySelector('#edit-role').value;
      const updates = {
        full_name: el.querySelector('#edit-name').value.trim(),
        role,
        location_id: el.querySelector('#edit-location').value || null,
        department_id: el.querySelector('#edit-department').value || null,
        phone: el.querySelector('#edit-phone').value || null,
      };

      if (role === 'intern') {
        updates.supervisor_id = el.querySelector('#edit-supervisor').value || null;
        updates.school = el.querySelector('#edit-school').value || null;
        updates.course = el.querySelector('#edit-course').value || null;
        updates.hours_required = el.querySelector('#edit-hours').value ? parseFloat(el.querySelector('#edit-hours').value) : null;
        updates.ojt_start_date = el.querySelector('#edit-start').value || null;
      } else {
        updates.supervisor_id = null;
      }

      try {
        const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
        if (error) throw error;

        await logAudit('user.updated', 'user', user.id, updates);
        showToast('User updated successfully', 'success');
        close();
        renderUserManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to update user', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
      }
    });
  });
}
