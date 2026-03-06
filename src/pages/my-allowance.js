/**
 * My Allowance Page (Intern)
 * View personal allowance history and weekly breakdowns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay } from '../lib/utils.js';

export async function renderMyAllowancePage() {
  const profile = getProfile();

  const { data: periods } = await supabase
    .from('allowance_periods')
    .select('*')
    .eq('intern_id', profile.id)
    .order('week_start', { ascending: false });

  const approved = (periods || []).filter(p => p.status === 'approved');
  const totalEarnings = approved.reduce((s, p) => s + (p.total_amount || 0), 0);
  const totalHours = approved.reduce((s, p) => s + (p.total_hours || 0), 0);

  const statusBadge = (status) => {
    const map = { computed: 'badge-pending', under_review: 'badge-pending', approved: 'badge-success', rejected: 'badge-danger' };
    return `<span class="${map[status] || 'badge-secondary'}">${status.replace('_', ' ')}</span>`;
  };

  renderLayout(`
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">My Allowance</h1>
      <p class="text-neutral-500 mt-1">Track your weekly allowance records</p>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <div class="card text-center">
        <p class="text-sm text-neutral-500">Total Earnings</p>
        <p class="text-3xl font-bold text-success-600">₱${totalEarnings.toFixed(2)}</p>
      </div>
      <div class="card text-center">
        <p class="text-sm text-neutral-500">Total Hours Logged</p>
        <p class="text-3xl font-bold text-primary-600">${formatHoursDisplay(totalHours)}</p>
      </div>
      <div class="card text-center">
        <p class="text-sm text-neutral-500">Weeks Paid</p>
        <p class="text-3xl font-bold text-neutral-800">${approved.length}</p>
      </div>
    </div>

    <!-- Weekly Records -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Weekly Records</h3>
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Week</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${(periods || []).map(p => `
              <tr>
                <td>${formatDate(p.week_start)} – ${formatDate(p.week_end)}</td>
                <td>${formatHoursDisplay(p.total_hours)}</td>
                <td>₱${p.hourly_rate?.toFixed(2)}</td>
                <td class="font-semibold">₱${p.total_amount?.toFixed(2)}</td>
                <td>${statusBadge(p.status)}
                  ${p.status === 'rejected' && p.review_notes ? `<p class="text-xs text-danger-600 mt-1">${p.review_notes}</p>` : ''}
                </td>
              </tr>
            `).join('')}
            ${(periods || []).length === 0 ? '<tr><td colspan="5" class="text-center text-neutral-400 py-8">No allowance records yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `);
}
