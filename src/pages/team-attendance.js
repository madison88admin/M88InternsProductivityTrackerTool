/**
 * Team Attendance Page (Supervisor / Admin with department)
 * View and manage attendance of assigned interns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatTime, formatHoursDisplay, getMonday, getFriday } from '../lib/utils.js';

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

  if (isAdmin && profile.department_id) {
    internsQuery = internsQuery.or(`department_id.eq.${profile.department_id},supervisor_id.eq.${profile.id}`);
  } else {
    internsQuery = internsQuery.eq('supervisor_id', profile.id);
  }

  const { data: interns } = await internsQuery;

  const internIds = (interns || []).map(i => i.id);

  // Get this week's attendance
  const now = new Date();
  const monday = getMonday(now);
  const friday = getFriday(monday);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd = friday.toISOString().slice(0, 10);

  let attendance = [];
  if (internIds.length > 0) {
    const { data } = await supabase
      .from('attendance_records')
      .select('*, intern:profiles!attendance_records_intern_id_fkey(full_name)')
      .in('intern_id', internIds)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .order('date', { ascending: false });
    attendance = data || [];
  }

  // Filter state
  let selectedIntern = '';
  let selectedStatus = '';

  function getFiltered() {
    let filtered = attendance;
    if (selectedIntern) filtered = filtered.filter(a => a.intern_id === selectedIntern);
    if (selectedStatus) filtered = filtered.filter(a => a.status === selectedStatus);
    return filtered;
  }

  function renderContent(el) {
    const filtered = getFiltered();
    const tbody = el.querySelector('#attendance-tbody');
    tbody.innerHTML = filtered.map(a => `
      <tr>
        <td>${a.intern?.full_name || '—'}</td>
        <td>${formatDate(a.date)}</td>
        <td class="text-sm">${a.time_in_1 ? formatTime(a.time_in_1) : '—'}</td>
        <td class="text-sm">${a.time_out_1 ? formatTime(a.time_out_1) : '—'}</td>
        <td class="text-sm">${a.time_in_2 ? formatTime(a.time_in_2) : '—'}</td>
        <td class="text-sm">${a.time_out_2 ? formatTime(a.time_out_2) : '—'}</td>
        <td>${formatHoursDisplay(a.total_hours)}</td>
        <td>
          <span class="badge-${a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'danger' : 'pending'}">${a.status}</span>
        </td>
        <td>
          ${a.is_late ? '<span class="badge-warning text-xs">Late</span>' : ''}
          ${a.is_outside_hours ? '<span class="badge-danger text-xs ml-1">Outside</span>' : ''}
        </td>
      </tr>
    `).join('') || '<tr><td colspan="9" class="text-center text-neutral-400 py-8">No attendance records</td></tr>';

    el.querySelector('#record-count').textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;
  }

  const allInternsLabel = isAdmin && profile.department_id
    ? `All Interns — ${profile.departments?.name || 'Department'}`
    : 'All Interns';

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Team Attendance</h1>
      <p class="page-subtitle">Week of ${formatDate(weekStart)} – ${formatDate(weekEnd)}</p>
    </div>

    <!-- Filters -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="form-label">Intern</label>
          <select id="filter-intern" class="form-input">
            <option value="">${allInternsLabel}</option>
            ${(interns || []).map(i => `<option value="${i.id}">${i.full_name}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="form-label">Status</label>
          <select id="filter-status" class="form-input">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div class="flex items-end">
          <p class="text-sm text-neutral-500" id="record-count">${attendance.length} records</p>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="card">
      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Intern</th>
              <th>Date</th>
              <th>AM In</th>
              <th>AM Out</th>
              <th>PM In</th>
              <th>PM Out</th>
              <th>Hours</th>
              <th>Status</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody id="attendance-tbody"></tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    renderContent(el);

    el.querySelector('#filter-intern').addEventListener('change', (e) => {
      selectedIntern = e.target.value;
      renderContent(el);
    });
    el.querySelector('#filter-status').addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      renderContent(el);
    });
  }, '/team-attendance');
}
