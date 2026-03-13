/**
 * Locations Management Page (Admin)
 * CRUD for office locations.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { createModal, confirmDialog } from '../lib/component.js';

export async function renderLocationsPage() {
  const { data: locations } = await supabase
    .from('locations')
    .select('*')
    .order('name');

  renderLayout(`
    <div class="flex items-center justify-between page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Locations</h1>
        <p class="page-subtitle">Manage office locations and IP ranges</p>
      </div>
      <button id="add-location-btn" class="btn-primary">
        ${icons.plus}
        <span class="ml-2">Add Location</span>
      </button>
    </div>

    <div class="card">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Address</th>
              <th>Timezone</th>
              <th>Allowed IPs</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${(locations || []).map(l => `
              <tr>
                <td class="font-medium">${l.name}</td>
                <td class="text-sm">${l.address || '—'}</td>
                <td class="text-sm">${l.timezone || 'Asia/Manila'}</td>
                <td class="text-xs font-mono">${(l.allowed_ips || []).join(', ') || '<span class="text-neutral-400">Any</span>'}</td>
                <td><span class="badge-${l.is_active ? 'success' : 'danger'}">${l.is_active ? 'Active' : 'Inactive'}</span></td>
                <td>
                  <div class="flex gap-1">
                    <button class="btn-sm btn-secondary edit-loc" data-id="${l.id}">
                      ${icons.edit}
                    </button>
                    <button class="btn-sm btn-danger delete-loc" data-id="${l.id}" data-name="${l.name}">
                      ${icons.trash}
                    </button>
                  </div>
                </td>
              </tr>
            `).join('')}
            ${(locations || []).length === 0 ? '<tr><td colspan="6" class="text-center text-neutral-400 py-8">No locations configured</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    el.querySelector('#add-location-btn').addEventListener('click', () => openLocationModal(null));

    el.querySelectorAll('.edit-loc').forEach(btn => {
      const loc = (locations || []).find(l => l.id === btn.dataset.id);
      btn.addEventListener('click', () => openLocationModal(loc));
    });

    el.querySelectorAll('.delete-loc').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { data: assignedUsers } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('location_id', btn.dataset.id)
          .eq('is_active', true);

        if (assignedUsers && assignedUsers.length > 0) {
          showToast(
            `Cannot delete location. Active users are still assigned: ${assignedUsers.map(u => u.full_name).join(', ')}`,
            'error'
          );
          return;
        }

        confirmDialog(`Delete location "${btn.dataset.name}"?`, async () => {
          try {
            await supabase.from('locations').delete().eq('id', btn.dataset.id);
            await logAudit('location.deleted', 'location', btn.dataset.id);
            showToast('Location deleted', 'success');
            renderLocationsPage();
          } catch (err) {
            showToast('Failed to delete — location may be in use', 'error');
          }
        }, 'Delete');
      });
    });
  }, '/locations');
}

function openLocationModal(loc) {
  const isEdit = !!loc;
  createModal(isEdit ? 'Edit Location' : 'Add Location', `
    <form id="loc-form" class="space-y-4">
      <div>
        <label class="form-label">Name <span class="text-danger-500">*</span></label>
        <input type="text" id="loc-name" class="form-input" value="${loc?.name || ''}" required />
      </div>
      <div>
        <label class="form-label">Address</label>
        <textarea id="loc-address" class="form-input" rows="2">${loc?.address || ''}</textarea>
      </div>
      <div>
        <label class="form-label">Timezone</label>
        <select id="loc-timezone" class="form-input">
          <option value="Asia/Manila" ${(loc?.timezone || 'Asia/Manila') === 'Asia/Manila' ? 'selected' : ''}>Asia/Manila (UTC+8)</option>
          <option value="America/New_York" ${loc?.timezone === 'America/New_York' ? 'selected' : ''}>America/New_York (EST)</option>
          <option value="America/Chicago" ${loc?.timezone === 'America/Chicago' ? 'selected' : ''}>America/Chicago (CST)</option>
          <option value="America/Los_Angeles" ${loc?.timezone === 'America/Los_Angeles' ? 'selected' : ''}>America/Los_Angeles (PST)</option>
          <option value="Asia/Singapore" ${loc?.timezone === 'Asia/Singapore' ? 'selected' : ''}>Asia/Singapore (SGT)</option>
          <option value="Australia/Sydney" ${loc?.timezone === 'Australia/Sydney' ? 'selected' : ''}>Australia/Sydney (AEST)</option>
        </select>
      </div>
      <div>
        <label class="form-label">Allowed IP Addresses</label>
        <textarea id="loc-ips" class="form-input" rows="3" placeholder="One IP per line (leave empty for no restriction)">${(loc?.allowed_ips || []).join('\n')}</textarea>
        <p class="text-xs text-neutral-400 mt-1">Public IPs of the office network. Interns must punch from these IPs.</p>
      </div>
      ${isEdit ? `
        <div class="flex items-center gap-2">
          <input type="checkbox" id="loc-active" ${loc.is_active ? 'checked' : ''} />
          <label for="loc-active" class="text-sm">Active</label>
        </div>
      ` : ''}
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="loc-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">${isEdit ? 'Update' : 'Create'}</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#loc-cancel').addEventListener('click', close);
    el.querySelector('#loc-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const ipsRaw = el.querySelector('#loc-ips').value.trim();
      const ips = ipsRaw ? ipsRaw.split('\n').map(ip => ip.trim()).filter(Boolean) : [];

      const payload = {
        name: el.querySelector('#loc-name').value.trim(),
        address: el.querySelector('#loc-address').value.trim() || '',
        timezone: el.querySelector('#loc-timezone').value,
        allowed_ips: ips,
      };

      if (isEdit) {
        const newIsActive = el.querySelector('#loc-active').checked;
        payload.is_active = newIsActive;

        // Block deactivation if active users are still assigned to this location
        if (loc.is_active && !newIsActive) {
          const { data: assignedUsers } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('location_id', loc.id)
            .eq('is_active', true);

          if (assignedUsers && assignedUsers.length > 0) {
            showToast(
              `Cannot deactivate location. The following users are still assigned: ${assignedUsers.map(u => u.full_name).join(', ')}`,
              'error'
            );
            return;
          }
        }

        const { error } = await supabase.from('locations').update(payload).eq('id', loc.id);
        if (error) { showToast(error.message || 'Failed to update', 'error'); return; }
        await logAudit('location.updated', 'location', loc.id);
      } else {
        const { error } = await supabase.from('locations').insert(payload);
        if (error) { showToast(error.message || 'Failed to create', 'error'); return; }
        await logAudit('location.created', 'location', null);
      }
      showToast(`Location ${isEdit ? 'updated' : 'created'}`, 'success');
      close();
      renderLocationsPage();
    });
  });
}
