/**
 * Departments Management Page (Admin)
 * CRUD for departments.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { createModal, confirmDialog } from '../lib/component.js';

export async function renderDepartmentsPage() {
  const { data: departments } = await supabase
    .from('departments')
    .select('*, location:locations(name)')
    .order('name');

  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  renderLayout(`
    <div class="flex items-center justify-between page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Departments</h1>
        <p class="page-subtitle">Manage organizational departments</p>
      </div>
      <button id="add-dept-btn" class="btn-primary">
        ${icons.plus}
        <span class="ml-2">Add Department</span>
      </button>
    </div>

    <div class="card">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Location</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(departments || []).map(d => `
              <tr>
                <td class="font-medium">${d.name}</td>
                <td>${d.location?.name || '—'}</td>
                <td><span class="badge-${d.is_active ? 'success' : 'danger'}">${d.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn-sm btn-secondary edit-dept" data-id="${d.id}" data-name="${d.name}" data-location="${d.location_id || ''}" data-active="${d.is_active}">
                      ${icons.edit}
                    </button>
                    <button class="btn-sm btn-danger delete-dept" data-id="${d.id}" data-name="${d.name}">
                      ${icons.trash}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${(departments || []).length === 0 ? '<tr><td colspan="4" class="text-center text-neutral-400 py-8">No departments</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    el.querySelector('#add-dept-btn').addEventListener('click', () => openDeptModal(null, locations));

    el.querySelectorAll('.edit-dept').forEach(btn => {
      btn.addEventListener('click', () => openDeptModal({
        id: btn.dataset.id,
        name: btn.dataset.name,
        location_id: btn.dataset.location || null,
        is_active: btn.dataset.active === 'true',
      }, locations));
    });

    el.querySelectorAll('.delete-dept').forEach(btn => {
      btn.addEventListener('click', () => {
        confirmDialog(`Delete department "${btn.dataset.name}"?`, async () => {
          try {
            await supabase.from('departments').delete().eq('id', btn.dataset.id);
            await logAudit('department.deleted', 'department', btn.dataset.id);
            showToast('Department deleted', 'success');
            renderDepartmentsPage();
          } catch (err) {
            showToast('Failed to delete', 'error');
          }
        }, 'Delete');
      });
    });
  }, '/departments');
}

function openDeptModal(dept, locations) {
  const isEdit = !!dept;
  createModal(isEdit ? 'Edit Department' : 'Add Department', `
    <form id="dept-form" class="space-y-4">
      <div>
        <label class="form-label">Name <span class="text-danger-500">*</span></label>
        <input type="text" id="dept-name" class="form-input" value="${dept?.name || ''}" required />
      </div>
      <div>
        <label class="form-label">Location <span class="text-danger-500">*</span></label>
        <select id="dept-location" class="form-input" required>
          <option value="">— Select —</option>
          ${(locations || []).map(l => `<option value="${l.id}" ${dept?.location_id === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
        </select>
      </div>
      ${isEdit ? `
        <div class="flex items-center gap-2">
          <input type="checkbox" id="dept-active" ${dept.is_active ? 'checked' : ''} />
          <label for="dept-active" class="text-sm">Active</label>
        </div>
      ` : ''}
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="dept-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#dept-cancel').addEventListener('click', close);
    el.querySelector('#dept-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const locationId = el.querySelector('#dept-location').value;
      if (!locationId) {
        showToast('Please select a location', 'error');
        return;
      }
      const payload = {
        name: el.querySelector('#dept-name').value.trim(),
        location_id: locationId,
      };
      if (isEdit) {
        payload.is_active = el.querySelector('#dept-active').checked;
        const { error } = await supabase.from('departments').update(payload).eq('id', dept.id);
        if (error) {
          showToast(error.code === '23505' ? 'A department with that name already exists in this location' : (error.message || 'Failed to update'), 'error');
          return;
        }
        await logAudit('department.updated', 'department', dept.id);
      } else {
        const { error } = await supabase.from('departments').insert(payload);
        if (error) {
          showToast(error.code === '23505' ? 'A department with that name already exists in this location' : (error.message || 'Failed to create'), 'error');
          return;
        }
        await logAudit('department.created', 'department', null);
      }
      showToast(`Department ${isEdit ? 'updated' : 'created'}`, 'success');
      close();
      renderDepartmentsPage();
    });
  });
}
