/**
 * Allowance Management Page (HR/Admin)
 * Configure rates, compute, review and approve weekly allowances.
 */
import { getProfile, getUserRole } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, getMonday, getFriday } from '../lib/utils.js';
import { createModal, confirmDialog } from '../lib/component.js';

export async function renderAllowanceManagementPage() {
  const profile = getProfile();

  // Get current allowance rate
  const { data: currentRate } = await supabase
    .from('allowance_config')
    .select('*')
    .order('effective_from', { ascending: false })
    .limit(1)
    .single();

  // Get allowance periods
  const { data: periods } = await supabase
    .from('allowance_periods')
    .select('*, intern:profiles!allowance_periods_intern_id_fkey(full_name, email)')
    .order('week_start', { ascending: false })
    .limit(100);

  const pendingPeriods = (periods || []).filter(p => p.status === 'computed' || p.status === 'under_review');
  const approvedPeriods = (periods || []).filter(p => p.status === 'approved');

  renderLayout(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-neutral-800">Allowance Management</h1>
        <p class="text-neutral-500 mt-1">Configure rates and manage intern allowances</p>
      </div>
      <div class="flex gap-2">
        <button id="set-rate-btn" class="btn-secondary">
          ${icons.settings}
          <span class="ml-2">Set Rate</span>
        </button>
        <button id="compute-btn" class="btn-primary">
          ${icons.money}
          <span class="ml-2">Compute Weekly</span>
        </button>
      </div>
    </div>

    <!-- Current Rate -->
    <div class="card mb-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-neutral-500">Current Hourly Rate</p>
          <p class="text-3xl font-bold text-primary-600">₱${currentRate?.hourly_rate?.toFixed(2) || '0.00'}</p>
          ${currentRate ? `<p class="text-xs text-neutral-400 mt-1">Effective from ${formatDate(currentRate.effective_from)}</p>` : ''}
        </div>
        ${currentRate?.notes ? `<p class="text-sm text-neutral-500 max-w-xs">${currentRate.notes}</p>` : ''}
      </div>
    </div>

    <!-- Pending Review -->
    <div class="card mb-6">
      <h3 class="text-lg font-semibold mb-4">Pending Review (${pendingPeriods.length})</h3>
      ${pendingPeriods.length > 0 ? `
        <div class="mb-4">
          <button id="approve-all-btn" class="btn-sm btn-success">Approve All</button>
        </div>
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Intern</th>
                <th>Week</th>
                <th>Hours</th>
                <th>Rate</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${pendingPeriods.map(p => `
                <tr>
                  <td>${p.intern?.full_name || '—'}</td>
                  <td>${formatDate(p.week_start)} – ${formatDate(p.week_end)}</td>
                  <td>${formatHoursDisplay(p.total_hours)}</td>
                  <td>₱${p.hourly_rate?.toFixed(2)}</td>
                  <td class="font-semibold">₱${p.total_amount?.toFixed(2)}</td>
                  <td><span class="badge-pending">${p.status.replace('_', ' ')}</span></td>
                  <td>
                    <div class="flex gap-1">
                      <button class="btn-sm btn-success approve-period-btn" data-period-id="${p.id}">
                        ${icons.check}
                      </button>
                      <button class="btn-sm btn-danger reject-period-btn" data-period-id="${p.id}">
                        ${icons.x}
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '<p class="text-neutral-400 text-center py-6">No pending allowances</p>'}
    </div>

    <!-- Approved History -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Approved Allowances</h3>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Intern</th>
              <th>Week</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Approved On</th>
            </tr>
          </thead>
          <tbody>
            ${approvedPeriods.map(p => `
              <tr>
                <td>${p.intern?.full_name || '—'}</td>
                <td>${formatDate(p.week_start)} – ${formatDate(p.week_end)}</td>
                <td>${formatHoursDisplay(p.total_hours)}</td>
                <td>₱${p.hourly_rate?.toFixed(2)}</td>
                <td class="font-semibold">₱${p.total_amount?.toFixed(2)}</td>
                <td>${p.reviewed_at ? formatDate(p.reviewed_at) : '—'}</td>
              </tr>
            `).join('')}
            ${approvedPeriods.length === 0 ? '<tr><td colspan="6" class="text-center text-neutral-400 py-8">No approved allowances yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    // Set rate button
    el.querySelector('#set-rate-btn')?.addEventListener('click', () => openSetRateModal(currentRate, profile));

    // Compute weekly button
    el.querySelector('#compute-btn')?.addEventListener('click', () => computeWeeklyAllowances(currentRate, profile));

    // Approve individual
    el.querySelectorAll('.approve-period-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await supabase.from('allowance_periods').update({
            status: 'approved',
            reviewed_by: profile.id,
            reviewed_at: new Date().toISOString(),
          }).eq('id', btn.dataset.periodId);

          await logAudit('allowance.approved', 'allowance', btn.dataset.periodId);
          showToast('Allowance approved', 'success');
          renderAllowanceManagementPage();
        } catch (err) {
          showToast('Failed to approve', 'error');
        }
      });
    });

    // Reject individual
    el.querySelectorAll('.reject-period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        createModal('Reject Allowance', `
          <form id="reject-allowance-form" class="space-y-4">
            <div>
              <label class="form-label">Reason</label>
              <textarea id="reject-notes" class="form-input" rows="3" required></textarea>
            </div>
            <div class="flex justify-end gap-3">
              <button type="button" id="reject-cancel" class="btn-secondary">Cancel</button>
              <button type="submit" class="btn-danger">Reject</button>
            </div>
          </form>
        `, (modalEl, close) => {
          modalEl.querySelector('#reject-cancel').addEventListener('click', close);
          modalEl.querySelector('#reject-allowance-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
              await supabase.from('allowance_periods').update({
                status: 'rejected',
                reviewed_by: profile.id,
                reviewed_at: new Date().toISOString(),
                review_notes: modalEl.querySelector('#reject-notes').value,
              }).eq('id', btn.dataset.periodId);

              await logAudit('allowance.rejected', 'allowance', btn.dataset.periodId);
              showToast('Allowance rejected', 'success');
              close();
              renderAllowanceManagementPage();
            } catch (err) {
              showToast('Failed to reject', 'error');
            }
          });
        });
      });
    });

    // Approve all
    el.querySelector('#approve-all-btn')?.addEventListener('click', () => {
      confirmDialog(`Approve all ${pendingPeriods.length} pending allowances?`, async () => {
        try {
          const ids = pendingPeriods.map(p => p.id);
          for (const id of ids) {
            await supabase.from('allowance_periods').update({
              status: 'approved',
              reviewed_by: profile.id,
              reviewed_at: new Date().toISOString(),
            }).eq('id', id);
          }
          showToast(`${ids.length} allowances approved`, 'success');
          renderAllowanceManagementPage();
        } catch (err) {
          showToast('Failed to approve all', 'error');
        }
      }, 'Approve All');
    });
  });
}

function openSetRateModal(currentRate, profile) {
  createModal('Set Hourly Rate', `
    <form id="set-rate-form" class="space-y-4">
      <div>
        <label class="form-label">Current Rate</label>
        <p class="text-lg font-bold text-neutral-800">₱${currentRate?.hourly_rate?.toFixed(2) || '0.00'}</p>
      </div>
      <div>
        <label class="form-label">New Hourly Rate (₱) <span class="text-danger-500">*</span></label>
        <input type="number" id="new-rate" class="form-input" step="0.01" min="0" required placeholder="e.g., 75.00" />
      </div>
      <div>
        <label class="form-label">Effective From <span class="text-danger-500">*</span></label>
        <input type="date" id="rate-effective" class="form-input" required />
      </div>
      <div>
        <label class="form-label">Notes</label>
        <textarea id="rate-notes" class="form-input" rows="2" placeholder="Reason for rate change (optional)"></textarea>
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="rate-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">Save Rate</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#rate-cancel').addEventListener('click', close);

    el.querySelector('#set-rate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const { error } = await supabase.from('allowance_config').insert({
          hourly_rate: parseFloat(el.querySelector('#new-rate').value),
          effective_from: el.querySelector('#rate-effective').value,
          set_by: profile.id,
          notes: el.querySelector('#rate-notes').value || null,
        });

        if (error) throw error;
        await logAudit('allowance.rate_set', 'allowance_config', null, {
          rate: el.querySelector('#new-rate').value,
        });

        showToast('Hourly rate updated', 'success');
        close();
        renderAllowanceManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to set rate', 'error');
      }
    });
  });
}

async function computeWeeklyAllowances(currentRate, profile) {
  if (!currentRate) {
    showToast('Please set an hourly rate first', 'error');
    return;
  }

  const now = new Date();
  const lastMonday = getMonday(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const lastFriday = getFriday(lastMonday);

  createModal('Compute Weekly Allowances', `
    <div class="space-y-4">
      <p class="text-sm text-neutral-600">
        This will compute allowances for the week of <strong>${formatDate(lastMonday)} – ${formatDate(lastFriday)}</strong>
        using the current rate of <strong>₱${currentRate.hourly_rate.toFixed(2)}/hour</strong>.
      </p>
      <p class="text-sm text-neutral-500">Only approved attendance records will be counted.</p>
      <div class="flex justify-end gap-3">
        <button id="compute-cancel" class="btn-secondary">Cancel</button>
        <button id="compute-confirm" class="btn-primary">Compute Now</button>
      </div>
    </div>
  `, (el, close) => {
    el.querySelector('#compute-cancel').addEventListener('click', close);

    el.querySelector('#compute-confirm').addEventListener('click', async () => {
      const btn = el.querySelector('#compute-confirm');
      btn.disabled = true;
      btn.textContent = 'Computing...';

      try {
        // Get all active interns
        const { data: interns } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'intern')
          .eq('is_active', true);

        let computed = 0;
        const weekStart = lastMonday.toISOString().slice(0, 10);
        const weekEnd = lastFriday.toISOString().slice(0, 10);

        for (const intern of (interns || [])) {
          // Check if already computed
          const { data: existing } = await supabase
            .from('allowance_periods')
            .select('id')
            .eq('intern_id', intern.id)
            .eq('week_start', weekStart)
            .single();

          if (existing) continue;

          // Get approved hours for the week
          const { data: attendance } = await supabase
            .from('attendance_records')
            .select('total_hours')
            .eq('intern_id', intern.id)
            .eq('status', 'approved')
            .gte('date', weekStart)
            .lte('date', weekEnd);

          const totalHours = (attendance || []).reduce((sum, r) => sum + (r.total_hours || 0), 0);

          if (totalHours > 0) {
            await supabase.from('allowance_periods').insert({
              intern_id: intern.id,
              week_start: weekStart,
              week_end: weekEnd,
              total_hours: totalHours,
              hourly_rate: currentRate.hourly_rate,
              total_amount: Math.round(totalHours * currentRate.hourly_rate * 100) / 100,
              status: 'computed',
            });
            computed++;
          }
        }

        await logAudit('allowance.computed', 'allowance', null, {
          week_start: weekStart,
          week_end: weekEnd,
          interns_computed: computed,
        });

        showToast(`Allowances computed for ${computed} interns`, 'success');
        close();
        renderAllowanceManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to compute', 'error');
        btn.disabled = false;
        btn.textContent = 'Compute Now';
      }
    });
  });
}
