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
    .maybeSingle();

  // Get allowance periods
  const { data: periods } = await supabase
    .from('allowance_periods')
    .select('*, intern:profiles!allowance_periods_intern_id_fkey(full_name, email)')
    .order('week_start', { ascending: false })
    .limit(100);

  const pendingPeriods = (periods || []).filter(p => p.status === 'computed' || p.status === 'under_review');
  const approvedPeriods = (periods || []).filter(p => p.status === 'approved');

  // Get per-intern rate overrides
  const { data: internRatesSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'intern_hourly_rates')
    .maybeSingle();
  const internRates = internRatesSetting?.value || {};
  const customRateCount = Object.keys(internRates).length;

  renderLayout(`
    <div class="flex items-center justify-between page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Allowance Management</h1>
        <p class="page-subtitle">Configure rates and manage intern allowances</p>
      </div>
      <div class="flex gap-2">
        <button id="set-rate-btn" class="btn-secondary">
          ${icons.settings}
          <span class="ml-2">Set Rate</span>
        </button>
        <button id="compute-btn" class="btn-primary">
          ${icons.php}
          <span class="ml-2">Compute Weekly</span>
        </button>
      </div>
    </div>

    <!-- Current Rate -->
    <div class="card mb-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-sm text-white">Global Hourly Rate</p>
          <p class="text-3xl font-bold text-white">₱${currentRate?.hourly_rate?.toFixed(2) || '0.00'}</p>
          ${currentRate ? `<p class="text-xs text-white mt-1">Effective from ${formatDate(currentRate.effective_from)}</p>` : ''}
          ${customRateCount > 0 ? `<p class="text-xs text-white mt-1 opacity-80">${customRateCount} intern${customRateCount !== 1 ? 's' : ''} have individual rate overrides</p>` : ''}
        </div>
        ${currentRate?.notes ? `<p class="text-sm text-white max-w-xs">${currentRate.notes}</p>` : ''}
      </div>
    </div>

    <!-- Pending Review -->
    <div class="card mb-6">
      <h3 class="text-base font-bold text-neutral-900 mb-4">Pending Review (${pendingPeriods.length})</h3>
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
      <h3 class="text-base font-bold text-neutral-900 mb-4">Approved Allowances</h3>
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
    el.querySelector('#set-rate-btn')?.addEventListener('click', () => openSetRateModal(currentRate, internRates, profile));

    // Compute weekly button
    el.querySelector('#compute-btn')?.addEventListener('click', () => computeWeeklyAllowances(currentRate, internRates, profile));

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
  }, '/allowance-management');
}

function openSetRateModal(currentRate, internRates, profile) {
  createModal('Set Hourly Rate', `
    <div class="space-y-4">
      <!-- Tabs -->
      <div class="flex rounded-lg overflow-hidden border border-neutral-200">
        <button id="tab-global" class="flex-1 px-4 py-2 text-sm font-medium bg-primary-600 text-white transition-colors">Global Rate</button>
        <button id="tab-individual" class="flex-1 px-4 py-2 text-sm font-medium bg-white text-neutral-600 hover:bg-neutral-50 transition-colors">Per-Intern Rates</button>
      </div>

      <!-- Global Rate Panel -->
      <div id="panel-global">
        <form id="set-rate-form" class="space-y-4">
          <div>
            <label class="form-label">Current Rate</label>
            <p class="text-lg font-bold text-neutral-900">₱${currentRate?.hourly_rate?.toFixed(2) || '0.00'}</p>
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
      </div>

      <!-- Per-Intern Rates Panel -->
      <div id="panel-individual" class="hidden space-y-3">
        <p class="text-sm text-neutral-500">
          Set a custom hourly rate per intern. Leave blank to use the global rate
          (₱${currentRate?.hourly_rate?.toFixed(2) || '0.00'}/hr).
        </p>
        <div id="intern-rates-list" class="space-y-1 max-h-72 overflow-y-auto pr-1">
          <p class="text-neutral-400 text-sm text-center py-4">Loading interns…</p>
        </div>
        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="individual-cancel" class="btn-secondary">Cancel</button>
          <button id="individual-save" class="btn-primary">Save Individual Rates</button>
        </div>
      </div>
    </div>
  `, async (el, close) => {
    const tabGlobal = el.querySelector('#tab-global');
    const tabIndividual = el.querySelector('#tab-individual');
    const panelGlobal = el.querySelector('#panel-global');
    const panelIndividual = el.querySelector('#panel-individual');

    tabGlobal.addEventListener('click', () => {
      tabGlobal.className = 'flex-1 px-4 py-2 text-sm font-medium bg-primary-600 text-white transition-colors';
      tabIndividual.className = 'flex-1 px-4 py-2 text-sm font-medium bg-white text-neutral-600 hover:bg-neutral-50 transition-colors';
      panelGlobal.classList.remove('hidden');
      panelIndividual.classList.add('hidden');
    });

    tabIndividual.addEventListener('click', async () => {
      tabIndividual.className = 'flex-1 px-4 py-2 text-sm font-medium bg-primary-600 text-white transition-colors';
      tabGlobal.className = 'flex-1 px-4 py-2 text-sm font-medium bg-white text-neutral-600 hover:bg-neutral-50 transition-colors';
      panelIndividual.classList.remove('hidden');
      panelGlobal.classList.add('hidden');
      await loadInternRates(el, currentRate, internRates);
    });

    el.querySelector('#rate-cancel').addEventListener('click', close);
    el.querySelector('#individual-cancel').addEventListener('click', close);

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
        await logAudit('allowance.rate_set', 'allowance_config', null, { rate: el.querySelector('#new-rate').value });
        showToast('Hourly rate updated', 'success');
        close();
        renderAllowanceManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to set rate', 'error');
      }
    });

    el.querySelector('#individual-save').addEventListener('click', async () => {
      try {
        const inputs = el.querySelectorAll('.intern-rate-input');
        const rates = {};
        inputs.forEach(input => {
          const val = parseFloat(input.value);
          if (!isNaN(val) && val >= 0) rates[input.dataset.internId] = val;
        });
        await supabase
          .from('system_settings')
          .upsert({ key: 'intern_hourly_rates', value: rates, updated_by: profile.id }, { onConflict: 'key' });
        await logAudit('allowance.individual_rates_set', 'system_settings', null, { count: Object.keys(rates).length });
        showToast('Individual rates saved', 'success');
        close();
        renderAllowanceManagementPage();
      } catch (err) {
        showToast(err.message || 'Failed to save rates', 'error');
      }
    });
  });
}

async function loadInternRates(el, currentRate, existingRates) {
  const listEl = el.querySelector('#intern-rates-list');
  const { data: interns } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  if (!interns || interns.length === 0) {
    listEl.innerHTML = '<p class="text-neutral-400 text-sm text-center py-4">No active interns found</p>';
    return;
  }

  listEl.innerHTML = interns.map(intern => `
    <div class="flex items-center gap-3 py-2 border-b border-neutral-100 last:border-0">
      <div class="flex-1 min-w-0">
        <p class="text-sm font-medium text-neutral-900 truncate">${intern.full_name}</p>
        <p class="text-xs text-neutral-400 truncate">${intern.email}</p>
      </div>
      <div class="flex items-center gap-1 shrink-0">
        <span class="text-xs text-neutral-400">₱</span>
        <input
          type="number"
          class="form-input intern-rate-input w-28 text-sm py-1"
          step="0.01" min="0"
          data-intern-id="${intern.id}"
          placeholder="${currentRate?.hourly_rate?.toFixed(2) || '0.00'}"
          value="${existingRates[intern.id] !== undefined ? existingRates[intern.id] : ''}"
        />
        <span class="text-xs text-neutral-400">/hr</span>
      </div>
    </div>
  `).join('');
}

async function computeWeeklyAllowances(currentRate, internRates, profile) {
  if (!currentRate && Object.keys(internRates).length === 0) {
    showToast('Please set an hourly rate first', 'error');
    return;
  }

  const customRateCount = Object.keys(internRates).length;

  // Default to the current week's Monday
  const now = new Date();
  const thisMonday = getMonday(now);
  const defaultWeekStart = thisMonday.toLocaleDateString('en-CA');

  createModal('Compute Weekly Allowances', `
    <div class="space-y-4">
      <div>
        <label class="form-label">Week Starting (Monday) <span class="text-danger-500">*</span></label>
        <input type="date" id="compute-week-start" class="form-input" value="${defaultWeekStart}" />
        <p class="text-xs text-neutral-400 mt-1">The Friday of the selected week will be the end date.</p>
      </div>
      <p class="text-sm text-neutral-500">
        Global rate: <strong>${currentRate ? `₱${currentRate.hourly_rate.toFixed(2)}/hour` : 'Not set'}</strong>.
        ${customRateCount > 0
          ? `<span class="text-primary-600 font-medium">${customRateCount} intern${customRateCount !== 1 ? 's' : ''} will use their individual rate.</span>`
          : 'All interns will use the global rate.'}
        Only approved attendance records will be counted.
      </p>
      <p id="compute-week-label" class="text-sm text-neutral-600"></p>
      <div class="flex justify-end gap-3">
        <button id="compute-cancel" class="btn-secondary">Cancel</button>
        <button id="compute-confirm" class="btn-primary">Compute Now</button>
      </div>
    </div>
  `, (el, close) => {
    const weekStartInput = el.querySelector('#compute-week-start');
    const weekLabel = el.querySelector('#compute-week-label');

    function updateLabel() {
      const picked = new Date(weekStartInput.value + 'T00:00:00');
      const monday = getMonday(picked);
      const friday = getFriday(monday);
      weekLabel.textContent = `Will compute: ${formatDate(monday)} – ${formatDate(friday)}`;
    }
    updateLabel();
    weekStartInput.addEventListener('change', updateLabel);

    el.querySelector('#compute-cancel').addEventListener('click', close);

    el.querySelector('#compute-confirm').addEventListener('click', async () => {
      const btn = el.querySelector('#compute-confirm');
      btn.disabled = true;
      btn.textContent = 'Computing...';

      try {
        const picked = new Date(weekStartInput.value + 'T00:00:00');
        const monday = getMonday(picked);
        const friday = getFriday(monday);
        const weekStart = monday.toLocaleDateString('en-CA');
        const weekEnd = friday.toLocaleDateString('en-CA');

        // Get all active interns
        const { data: interns } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('role', 'intern')
          .eq('is_active', true);

        let computed = 0;

        for (const intern of (interns || [])) {
          // Check if already computed for this week
          const { data: existing } = await supabase
            .from('allowance_periods')
            .select('id')
            .eq('intern_id', intern.id)
            .eq('week_start', weekStart)
            .maybeSingle();

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
            // Use individual rate override if set, otherwise fall back to global rate
            const rate = internRates[intern.id] !== undefined
              ? internRates[intern.id]
              : currentRate?.hourly_rate;

            if (rate == null) continue; // no rate available for this intern

            await supabase.from('allowance_periods').insert({
              intern_id: intern.id,
              week_start: weekStart,
              week_end: weekEnd,
              total_hours: totalHours,
              hourly_rate: rate,
              total_amount: Math.round(totalHours * rate * 100) / 100,
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

        showToast(computed > 0 ? `Allowances computed for ${computed} intern${computed !== 1 ? 's' : ''}` : 'No new allowances to compute (already computed or no approved hours)', computed > 0 ? 'success' : 'info');
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
