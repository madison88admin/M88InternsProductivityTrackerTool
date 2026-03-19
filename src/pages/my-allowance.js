/**
 * My Allowance Page (Intern)
 * View personal allowance history and weekly breakdowns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, getMonday } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';
import { fetchDarData, generateDarPdf } from './reports.js';

export async function renderMyAllowancePage() {
  const profile = getProfile();

  const { data: periods } = await supabase
    .from('allowance_periods')
    .select('*')
    .eq('intern_id', profile.id)
    .order('week_start', { ascending: false });

  // Fetch admin-logged attendance dates for this intern
  const { data: adminLoggedRecords } = await supabase
    .from('attendance_records')
    .select('date')
    .eq('intern_id', profile.id)
    .eq('admin_logged', true);
  const adminLoggedDates = new Set((adminLoggedRecords || []).map(r => r.date));

  function hasAdminLoggedInWeek(weekStart, weekEnd) {
    const ws = new Date(weekStart + 'T00:00:00');
    const we = new Date(weekEnd + 'T23:59:59');
    return [...adminLoggedDates].some(d => {
      const dt = new Date(d + 'T00:00:00');
      return dt >= ws && dt <= we;
    });
  }

  const approved = (periods || []).filter(p => p.status === 'approved');
  const totalEarnings = approved.reduce((s, p) => s + (p.total_amount || 0), 0);
  const totalHours = approved.reduce((s, p) => s + (p.total_hours || 0), 0);

  // Compute week number relative to OJT start date
  const ojtStart = profile.ojt_start_date ? new Date(profile.ojt_start_date + 'T00:00:00') : null;
  const ojtMonday = ojtStart ? getMonday(ojtStart) : null;

  function getWeekNum(weekStart) {
    if (!ojtMonday || !weekStart) return '—';
    const wMonday = getMonday(new Date(weekStart + 'T00:00:00'));
    const num = Math.floor((wMonday - ojtMonday) / (7 * 24 * 60 * 60 * 1000)) + 1;
    return num < 1 ? 1 : num;
  }

  const statusBadge = (status) => {
    const map = { computed: 'badge-pending', under_review: 'badge-pending', approved: 'badge-success', rejected: 'badge-danger' };
    return `<span class="${map[status] || 'badge-secondary'}">${status.replace('_', ' ')}</span>`;
  };

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">My Allowance</h1>
      <p class="page-subtitle">Track your weekly allowance records</p>
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
        <p class="text-3xl font-bold text-neutral-900">${approved.length}</p>
      </div>
    </div>

    <!-- Weekly Records -->
    <div class="card text-left">
      <h3 class="text-base font-bold text-neutral-900 mb-4">Weekly Records</h3>
      <div class="overflow-x-auto">
        <table class="data-table text-left">
          <thead>
            <tr>
              <th>Week No.</th>
              <th>Week Range</th>
              <th>Hours</th>
              <th>Rate</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            ${(periods || []).map(p => `
              <tr>
                <td class="font-medium">Week ${getWeekNum(p.week_start)}</td>
                <td class="whitespace-nowrap">${formatDate(p.week_start)} – ${formatDate(p.week_end)}</td>
                <td>${formatHoursDisplay(p.total_hours)}${hasAdminLoggedInWeek(p.week_start, p.week_end) ? ' <span class="badge-secondary text-xs">Admin Logged</span>' : ''}</td>
                <td>₱${p.hourly_rate?.toFixed(2)}</td>
                <td class="font-semibold">₱${p.total_amount?.toFixed(2)}</td>
                <td>
                  ${statusBadge(p.status)}
                  ${p.status === 'rejected' && p.review_notes ? `<p class="text-xs text-danger-600 mt-1">${p.review_notes}</p>` : ''}
                </td>
                <td>
                  ${p.status === 'approved' ? `
                    <button
                      class="btn-secondary btn-sm dar-report-btn inline-flex items-center gap-1"
                      data-week-start="${p.week_start}"
                      data-week-end="${p.week_end}"
                      data-week-num="${getWeekNum(p.week_start)}"
                      data-status="${p.status}"
                      title="Download Daily Activity Report for this week"
                    >
                      ${icons.download} DAR
                    </button>
                  ` : '<span class="text-xs text-neutral-500">Available after admin approval</span>'}
                </td>
              </tr>
            `).join('')}
            ${(periods || []).length === 0 ? '<tr><td colspan="7" class="text-center text-neutral-400 py-8">No allowance records yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, null, '/my-allowance');

  // Attach DAR download handlers
  document.querySelectorAll('.dar-report-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const weekStart = btn.dataset.weekStart;
      const weekEnd = btn.dataset.weekEnd;
      const weekNum = parseInt(btn.dataset.weekNum, 10) || 1;
      const status = btn.dataset.status;

      if (status !== 'approved') {
        showToast('DAR is available only after admin approval', 'info');
        return;
      }

      btn.disabled = true;
      const original = btn.innerHTML;
      btn.innerHTML = '<span class="spinner"></span>';

      try {
        const darData = await fetchDarData(profile.id, weekStart, weekEnd);
        const doc = await generateDarPdf(darData, weekNum, weekStart);
        const name = profile.full_name?.replace(/\s+/g, '_') || 'intern';
        doc.save(`DAR_${name}_Week${weekNum}.pdf`);
        showToast('DAR downloaded successfully', 'success');
      } catch (err) {
        console.error('DAR generation failed:', err);
        showToast('Failed to generate DAR', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = original;
      }
    });
  });
}
