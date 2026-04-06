/**
 * Team Attendance Page (Supervisor / Admin with department)
 * View and manage attendance of assigned interns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateKey, formatTime, formatHoursDisplay, getTrackingWeekStart, getTrackingWeekEnd, getTodayDate } from '../lib/utils.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { createModal } from '../lib/component.js';

function ipConsistencyBadge(ip_consistent) {
  if (ip_consistent == null) return '';
  return ip_consistent
    ? '<span class="badge-success text-xs ml-1">IP Consistent</span>'
    : '<span class="badge-danger text-xs ml-1">IP Mismatch</span>';
}

export async function renderTeamAttendancePage() {
  const profile = getProfile();
  const isAdmin = profile.role === 'admin';

  // Admins find their interns by department; supervisors by supervisor_id
  let internsQuery = supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  // Supervisors and admins in a department see all dept interns; otherwise fall back to supervisor_id
  if (profile.department_id) {
    internsQuery = internsQuery.eq('department_id', profile.department_id);
  } else {
    internsQuery = internsQuery.eq('supervisor_id', profile.id);
  }

  const { data: interns } = await internsQuery;

  const internIds = (interns || []).map(i => i.id);

  // Generate week options (current week + 8 past weeks = 9 weeks total)
  const weekOptions = [];
  const now = new Date();
  const currentStart = getTrackingWeekStart(now);
  for (let i = 0; i < 9; i++) {
    const start = new Date(currentStart);
    start.setDate(currentStart.getDate() - (i * 7));
    const end = getTrackingWeekEnd(start);
    weekOptions.push({
      index: i,
      label: i === 0 ? 'Current Week' : i === 1 ? 'Last Week' : `${i} Weeks Ago`,
      start: formatDateKey(start),
      end: formatDateKey(end),
      startDate: start,
      endDate: end,
    });
  }

  // Filter state
  let selectedWeekIndex = 0;
  let selectedIntern = '';
  let selectedStatus = '';
  let attendance = [];

  async function loadAttendanceForWeek(weekIndex) {
    const week = weekOptions[weekIndex];
    if (internIds.length > 0) {
      const { data } = await supabase
        .from('attendance_records')
        .select('*, intern:profiles!attendance_records_intern_id_fkey(full_name)')
        .in('intern_id', internIds)
        .gte('date', week.start)
        .lte('date', week.end)
        .order('date', { ascending: false });
      attendance = data || [];
    } else {
      attendance = [];
    }
  }

  // Load initial week
  await loadAttendanceForWeek(0);

  function getFiltered() {
    let filtered = attendance;
    if (selectedIntern) filtered = filtered.filter(a => a.intern_id === selectedIntern);
    if (selectedStatus) filtered = filtered.filter(a => a.status === selectedStatus);
    return filtered;
  }

  function getStats(records) {
    return {
      total: records.length,
      pending: records.filter(r => r.status === 'pending').length,
      approved: records.filter(r => r.status === 'approved').length,
      rejected: records.filter(r => r.status === 'rejected').length,
      late: records.filter(r => r.is_late).length,
      ipMismatch: records.filter(r => r.ip_consistent === false).length,
    };
  }

  function renderContent(el) {
    const filtered = getFiltered();
    const stats = getStats(filtered);
    const today = getTodayDate();
    const tbody = el.querySelector('#attendance-tbody');

    tbody.innerHTML = filtered.map(a => {
      // Show actions when End of Day is missing and at least one punch is logged
      const hasPunches = a.time_in_1 || a.time_in_2;
      const missingEndOfDay = !a.time_out_2 && hasPunches;
      const isPastDate = a.date < today;
      const showActions = missingEndOfDay && (isPastDate || isEndOfDayCutoffPassed());

      return `
      <tr class="hover:bg-neutral-50 transition-colors">
        <td class="font-medium text-neutral-800">${a.intern?.full_name || '—'}</td>
        <td class="text-neutral-600">${formatDate(a.date)}</td>
        <td class="text-sm font-mono text-neutral-700">${a.time_in_1 ? formatTime(a.time_in_1) : '<span class="text-neutral-400">—</span>'}</td>
        <td class="text-sm font-mono text-neutral-700">${a.time_out_1 ? formatTime(a.time_out_1) : '<span class="text-neutral-400">—</span>'}</td>
        <td class="text-sm font-mono text-neutral-700">${a.time_in_2 ? formatTime(a.time_in_2) : '<span class="text-neutral-400">—</span>'}</td>
        <td class="text-sm font-mono text-neutral-700">${a.time_out_2 ? formatTime(a.time_out_2) : '<span class="text-neutral-400">—</span>'}</td>
        <td class="font-semibold text-primary-600">${formatHoursDisplay(a.total_hours)}</td>
        <td>
          <span class="badge-${a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'pending'} capitalize">${a.status}</span>
        </td>
        <td>
          <div class="flex flex-wrap gap-1">
            ${a.is_late ? '<span class="badge-warning text-xs">Late</span>' : ''}
            ${a.is_outside_hours ? '<span class="badge-danger text-xs">Overtime</span>' : ''}
            ${ipConsistencyBadge(a.ip_consistent)}
          </div>
        </td>
        <td>
          ${showActions ? `
            <div class="flex gap-2">
              <button class="btn-sm btn-primary fill-eod-btn" data-id="${a.id}" data-date="${a.date}" data-intern="${a.intern?.full_name || 'Intern'}">
                ${icons.clock} Fill EOD
              </button>
              <button class="btn-sm btn-secondary escalate-btn" data-id="${a.id}" data-date="${a.date}" data-intern-id="${a.intern_id}" data-intern="${a.intern?.full_name || 'Intern'}">
                ${icons.alert} Escalate
              </button>
            </div>
          ` : '<span class="text-neutral-400 text-sm">—</span>'}
        </td>
      </tr>
    `}).join('') || `<tr><td colspan="10" class="text-center text-neutral-400 py-12">
      <div class="flex flex-col items-center gap-2">
        <svg class="w-12 h-12 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
        </svg>
        <p>No attendance records found</p>
      </div>
    </td></tr>`;

    // Update stats cards
    el.querySelector('#stat-total').textContent = stats.total;
    el.querySelector('#stat-pending').textContent = stats.pending;
    el.querySelector('#stat-approved').textContent = stats.approved;
    el.querySelector('#stat-rejected').textContent = stats.rejected;
    el.querySelector('#stat-late').textContent = stats.late;
    el.querySelector('#stat-ip-mismatch').textContent = stats.ipMismatch;
  }

  const allInternsLabel = profile.department_id
    ? `All Interns — ${profile.departments?.name || 'Department'}`
    : 'All Interns';

  const currentWeek = weekOptions[0];
  const stats = getStats(attendance);

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-linear-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
          </svg>
        </div>
        <div>
          <h1 class="page-title mb-1">Team Attendance</h1>
          <p class="page-subtitle text-sm">Monitor and manage your team's attendance records</p>
        </div>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 animate-fade-in-up" style="animation-delay: 0.1s;">
      <div class="card bg-linear-to-br from-blue-50 to-blue-100 border-blue-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-blue-600 uppercase tracking-wide">Total</p>
            <p class="text-2xl font-bold text-blue-900 mt-1" id="stat-total">${stats.total}</p>
          </div>
          <div class="w-10 h-10 bg-blue-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-yellow-50 to-yellow-100 border-yellow-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-yellow-600 uppercase tracking-wide">Pending</p>
            <p class="text-2xl font-bold text-yellow-900 mt-1" id="stat-pending">${stats.pending}</p>
          </div>
          <div class="w-10 h-10 bg-yellow-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-green-50 to-green-100 border-green-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-green-600 uppercase tracking-wide">Approved</p>
            <p class="text-2xl font-bold text-green-900 mt-1" id="stat-approved">${stats.approved}</p>
          </div>
          <div class="w-10 h-10 bg-green-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-red-50 to-red-100 border-red-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-red-600 uppercase tracking-wide">Rejected</p>
            <p class="text-2xl font-bold text-red-900 mt-1" id="stat-rejected">${stats.rejected}</p>
          </div>
          <div class="w-10 h-10 bg-red-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-orange-50 to-orange-100 border-orange-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-orange-600 uppercase tracking-wide">Late</p>
            <p class="text-2xl font-bold text-orange-900 mt-1" id="stat-late">${stats.late}</p>
          </div>
          <div class="w-10 h-10 bg-orange-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-purple-50 to-purple-100 border-purple-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-purple-600 uppercase tracking-wide">IP Issues</p>
            <p class="text-2xl font-bold text-purple-900 mt-1" id="stat-ip-mismatch">${stats.ipMismatch}</p>
          </div>
          <div class="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-6 animate-fade-in-up" style="animation-delay: 0.2s;">
      <div class="flex items-center gap-2 mb-4 pb-4 border-b border-neutral-200">
        <svg class="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
        </svg>
        <h2 class="text-lg font-semibold text-neutral-800">Filters & Options</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <span>Week Period</span>
          </label>
          <select id="filter-week" class="form-input font-medium">
            ${weekOptions.map(w => `<option value="${w.index}">${w.label} (${formatDate(w.start)} – ${formatDate(w.end)})</option>`).join('')}
          </select>
          <p class="text-xs text-neutral-500 mt-1">Select the week to view attendance</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span>Intern</span>
          </label>
          <select id="filter-intern" class="form-input">
            <option value="">${allInternsLabel}</option>
            ${(interns || []).map(i => `<option value="${i.id}">${i.full_name}</option>`).join('')}
          </select>
          <p class="text-xs text-neutral-500 mt-1">Filter by specific intern</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Status</span>
          </label>
          <select id="filter-status" class="form-input">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <p class="text-xs text-neutral-500 mt-1">Filter by approval status</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2 invisible">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <span>Actions</span>
          </label>
          <button id="reset-filters" class="btn-secondary w-full">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Reset Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card animate-fade-in-up" style="animation-delay: 0.3s;">
      <div class="flex items-center justify-between mb-4 pb-4 border-b border-neutral-200">
        <h2 class="text-lg font-semibold text-neutral-800">Attendance Records</h2>
        <div class="flex items-center gap-2 text-sm text-neutral-600">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
          <span id="loading-indicator" class="hidden">Loading...</span>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th class="text-left">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                  </svg>
                  Intern
                </div>
              </th>
              <th class="text-left">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  Date
                </div>
              </th>
              <th class="text-left">AM In</th>
              <th class="text-left">AM Out</th>
              <th class="text-left">PM In</th>
              <th class="text-left">PM Out</th>
              <th class="text-left">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Hours
                </div>
              </th>
              <th class="text-left">Status</th>
              <th class="text-left">Flags</th>
              <th class="text-left">Actions</th>
            </tr>
          </thead>
          <tbody id="attendance-tbody"></tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    renderContent(el);

    // Week filter change handler
    el.querySelector('#filter-week').addEventListener('change', async (e) => {
      selectedWeekIndex = parseInt(e.target.value);
      const loadingIndicator = el.querySelector('#loading-indicator');
      loadingIndicator.classList.remove('hidden');

      await loadAttendanceForWeek(selectedWeekIndex);
      renderContent(el);

      loadingIndicator.classList.add('hidden');
      showToast(`Loaded ${weekOptions[selectedWeekIndex].label}`, 'success');
    });

    // Intern filter change handler
    el.querySelector('#filter-intern').addEventListener('change', (e) => {
      selectedIntern = e.target.value;
      renderContent(el);
    });

    // Status filter change handler
    el.querySelector('#filter-status').addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      renderContent(el);
    });

    // Reset filters button
    el.querySelector('#reset-filters').addEventListener('click', async () => {
      selectedWeekIndex = 0;
      selectedIntern = '';
      selectedStatus = '';

      el.querySelector('#filter-week').value = '0';
      el.querySelector('#filter-intern').value = '';
      el.querySelector('#filter-status').value = '';

      const loadingIndicator = el.querySelector('#loading-indicator');
      loadingIndicator.classList.remove('hidden');

      await loadAttendanceForWeek(0);
      renderContent(el);

      loadingIndicator.classList.add('hidden');
      showToast('Filters reset to current week', 'success');
    });

    // Delegate click events for action buttons
    el.addEventListener('click', (e) => {
      const fillBtn = e.target.closest('.fill-eod-btn');
      if (fillBtn) {
        openFillEndOfDayModal(fillBtn.dataset.id, fillBtn.dataset.date, fillBtn.dataset.intern, profile, () => {
          renderTeamAttendancePage();
        });
        return;
      }

      const escalateBtn = e.target.closest('.escalate-btn');
      if (escalateBtn) {
        handleEscalateToAdmin(escalateBtn.dataset.id, escalateBtn.dataset.date, escalateBtn.dataset.internId, escalateBtn.dataset.intern, profile);
      }
    });
  }, '/team-attendance');
}

function isEndOfDayCutoffPassed() {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= 19 * 60 + 30; // 7:30 PM
}

function openFillEndOfDayModal(recordId, date, internName, profile, onComplete) {
  createModal('Fill End of Day Time', `
    <form id="fill-eod-form" class="space-y-4">
      <p class="text-sm text-neutral-600">Enter the time <strong>${internName}</strong> left on <strong>${formatDate(date)}</strong>.</p>

      <div>
        <label class="form-label">End of Day Time</label>
        <input type="time" id="eod-time" class="form-input" required />
      </div>

      <div class="flex justify-end gap-3">
        <button type="button" id="fill-eod-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">Save</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#fill-eod-cancel').addEventListener('click', close);

    el.querySelector('#fill-eod-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const timeValue = el.querySelector('#eod-time').value;
      if (!timeValue) {
        showToast('Please enter a valid time', 'error');
        return;
      }

      const correctedTimestamp = new Date(`${date}T${timeValue}:00`).toISOString();

      try {
        const { error } = await supabase
          .from('attendance_records')
          .update({ time_out_2: correctedTimestamp })
          .eq('id', recordId);

        if (error) throw error;

        await logAudit('attendance.supervisor_filled_eod', 'attendance', recordId, {
          filled_by: profile.id,
          time_out_2: correctedTimestamp,
        });

        showToast(`End of Day time saved for ${internName}`, 'success');
        close();
        onComplete();
      } catch (err) {
        showToast(err.message || 'Failed to update attendance', 'error');
      }
    });
  });
}

async function handleEscalateToAdmin(recordId, date, internId, internName, profile) {
  if (!confirm(`Escalate ${internName}'s incomplete attendance on ${formatDate(date)} to admin?`)) return;

  try {
    const { data: admins } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);

    if (admins && admins.length > 0) {
      const notifications = admins.map(a => ({
        user_id: a.id,
        type: 'escalation',
        title: 'Attendance Escalation',
        message: `${profile.full_name} escalated ${internName}'s incomplete attendance for ${formatDate(date)}. End of Day punch is missing.`,
        entity_type: 'attendance',
        entity_id: recordId,
      }));
      await supabase.from('notifications').insert(notifications);
    }

    await logAudit('attendance.escalated_to_admin', 'attendance', recordId, {
      escalated_by: profile.id,
      intern_id: internId,
      reason: 'Missing End of Day punch',
    });

    showToast('Escalated to admin successfully', 'success');
  } catch (err) {
    showToast(err.message || 'Failed to escalate', 'error');
  }
}
