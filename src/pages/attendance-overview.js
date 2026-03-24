/**
 * Attendance Overview Page (HR/Admin)
 * Overview across all interns with filters and export.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateKey, formatHoursDisplay, formatTime } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { logAudit } from '../lib/audit.js';
import { getCurrentUser } from '../lib/auth.js';

export async function renderAttendanceOverviewPage() {
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Default: current Mon–Fri week
  const weekRanges = getWeekRanges(16);
  let dateFrom = weekRanges[0].from;
  let dateTo = weekRanges[0].to;
  let departmentFilter = '';
  let statusFilter = '';
  let searchQuery = '';

  async function fetchData() {
    let query = supabase
      .from('attendance_records')
      .select('*, intern:profiles!attendance_records_intern_id_fkey(full_name, department_id, email)')
      .order('date', { ascending: false })
      .limit(500);

    if (dateFrom) query = query.gte('date', dateFrom);
    if (dateTo) query = query.lte('date', dateTo);
    if (statusFilter) query = query.eq('status', statusFilter);

    const { data } = await query;
    let records = data || [];

    // Client-side search only (text search can't be done server-side efficiently)
    if (searchQuery) {
      const lowerSearch = searchQuery.toLowerCase();
      records = records.filter(r =>
        r.intern?.full_name?.toLowerCase().includes(lowerSearch) ||
        r.intern?.email?.toLowerCase().includes(lowerSearch)
      );
    }

    return records;
  }

  async function render() {
    const records = await fetchData();

    // Summary stats
    const total = records.length;
    const approved = records.filter(r => r.status === 'approved').length;
    const pending = records.filter(r => r.status === 'pending').length;
    const late = records.filter(r => r.is_late).length;
    const totalHours = records.reduce((s, r) => s + (r.total_hours || 0), 0);

    renderLayout(`
      <div class="page-header animate-fade-in-up">
        <h1 class="page-title">Attendance Overview</h1>
        <p class="page-subtitle">Cross-team attendance monitoring</p>
      </div>

      <!-- Filters -->
      <div class="card mb-6">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label class="form-label">Week</label>
            <select id="week-range" class="form-input">
              <option value="all">All weeks</option>
              ${weekRanges.map(w => `<option value="${w.from}|${w.to}" ${dateFrom === w.from ? 'selected' : ''}>${w.label}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Department</label>
            <select id="filter-department" class="form-input">
              <option value="">All</option>
              ${(departments || []).map(d => `<option value="${d.id}" ${departmentFilter === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="form-label">Status</label>
            <select id="filter-status" class="form-input">
              <option value="">All</option>
              <option value="pending" ${statusFilter === 'pending' ? 'selected' : ''}>Pending</option>
              <option value="approved" ${statusFilter === 'approved' ? 'selected' : ''}>Approved</option>
              <option value="rejected" ${statusFilter === 'rejected' ? 'selected' : ''}>Rejected</option>
            </select>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div class="card text-center">
          <p class="text-sm text-neutral-500">Total</p>
          <p class="text-2xl font-bold">${total}</p>
        </div>
        <div class="card text-center">
          <p class="text-sm text-neutral-500">Approved</p>
          <p class="text-2xl font-bold text-success-600">${approved}</p>
        </div>
        <div class="card text-center">
          <p class="text-sm text-neutral-500">Pending</p>
          <p class="text-2xl font-bold text-warning-600">${pending}</p>
        </div>
        <div class="card text-center">
          <p class="text-sm text-neutral-500">Late</p>
          <p class="text-2xl font-bold text-danger-600">${late}</p>
        </div>
        <div class="card text-center">
          <p class="text-sm text-neutral-500">Total Hours</p>
          <p class="text-2xl font-bold text-primary-600">${formatHoursDisplay(totalHours)}</p>
        </div>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="flex items-center justify-between mb-4 gap-3">
          <div class="relative flex-1 max-w-xs">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 pointer-events-none">
              ${icons.search}
            </span>
            <input
              type="text"
              id="search-intern"
              class="form-input pl-10!"
              placeholder="Search intern..."
              value="${searchQuery}"
            />
          </div>
          <div class="flex items-center gap-3">
            <span id="record-count" class="text-sm text-neutral-500">${total} Records</span>
            <button id="export-btn" class="btn-sm btn-secondary">
              ${icons.download}
              <span class="ml-1">Export</span>
            </button>
          </div>
        </div>
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
                <th></th>
              </tr>
            </thead>
            <tbody id="records-tbody">
              ${renderRows(records, searchQuery)}
            </tbody>
          </table>
        </div>
      </div>
    `, (el) => {
      const applyFilters = () => {
        const val = el.querySelector('#week-range').value;
        if (val === 'all') {
          dateFrom = null;
          dateTo = null;
        } else {
          const [from, to] = val.split('|');
          dateFrom = from;
          dateTo = to;
        }
        departmentFilter = el.querySelector('#filter-department').value;
        statusFilter = el.querySelector('#filter-status').value;
        render();
      };

      el.querySelector('#week-range').addEventListener('change', applyFilters);
      el.querySelector('#filter-department').addEventListener('change', applyFilters);
      el.querySelector('#filter-status').addEventListener('change', applyFilters);

      function bindEditButtons(container) {
        container.querySelectorAll('.edit-attendance-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const record = records.find(r => r.id === id);
            if (record) openEditAttendanceModal(record, render);
          });
        });
      }

      el.querySelector('#search-intern').addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        const filtered = filterBySearch(records, searchQuery);
        el.querySelector('#records-tbody').innerHTML = renderRows(records, searchQuery);
        el.querySelector('#record-count').textContent = `${filtered.length} Records`;
        bindEditButtons(el.querySelector('#records-tbody'));
      });

      el.querySelector('#export-btn').addEventListener('click', async () => {
        try {
          const XLSX = await import('xlsx');
          const rows = records.map(r => ({
            Intern: r.intern?.full_name,
            Email: r.intern?.email,
            Date: r.date,
            'AM In': r.time_in_1 ? formatTime(r.time_in_1) : '',
            'AM Out': r.time_out_1 ? formatTime(r.time_out_1) : '',
            'PM In': r.time_in_2 ? formatTime(r.time_in_2) : '',
            'PM Out': r.time_out_2 ? formatTime(r.time_out_2) : '',
            Hours: r.total_hours,
            Status: r.status,
            Late: r.is_late ? 'Yes' : 'No',
          }));
          const ws = XLSX.utils.json_to_sheet(rows);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
          const fileLabel = dateFrom ? `${dateFrom}_${dateTo}` : 'all';
          XLSX.writeFile(wb, `attendance_overview_${fileLabel}.xlsx`);
          showToast('Exported successfully', 'success');
        } catch (err) {
          showToast('Export failed', 'error');
        }
      });

      bindEditButtons(el);
    }, '/attendance-overview');
  }

  await render();
}

function ipConsistencyBadge(ip_consistent) {
  if (ip_consistent == null) return '';
  return ip_consistent
    ? '<span class="badge-success text-xs ml-1">IP Consistent</span>'
    : '<span class="badge-danger text-xs ml-1">IP Mismatch</span>';
}

function filterBySearch(records, query) {
  if (!query) return records;
  const lower = query.toLowerCase();
  return records.filter(r => (r.intern?.full_name || '').toLowerCase().includes(lower));
}

function renderRows(records, searchQuery) {
  const filtered = filterBySearch(records, searchQuery);
  if (filtered.length === 0) {
    return '<tr><td colspan="10" class="text-center text-neutral-400 py-8">No records found</td></tr>';
  }
  return filtered.map(r => `
    <tr>
      <td>${r.intern?.full_name || '—'}</td>
      <td>${formatDate(r.date)}</td>
      <td class="text-sm">${r.time_in_1 ? formatTime(r.time_in_1) : '—'}</td>
      <td class="text-sm">${r.time_out_1 ? formatTime(r.time_out_1) : '—'}</td>
      <td class="text-sm">${r.time_in_2 ? formatTime(r.time_in_2) : '—'}</td>
      <td class="text-sm">${r.time_out_2 ? formatTime(r.time_out_2) : '—'}</td>
      <td>${formatHoursDisplay(r.total_hours)}</td>
      <td><span class="badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'pending'}">${r.status}</span></td>
      <td>
        ${r.is_late ? '<span class="badge-warning text-xs">Late</span>' : ''}
        ${r.is_outside_hours ? '<span class="badge-danger text-xs ml-1">Outside</span>' : ''}
        ${ipConsistencyBadge(r.ip_consistent)}
      </td>
      <td>
        <button class="btn-sm btn-secondary edit-attendance-btn" data-id="${r.id}" title="Edit attendance">
          ${icons.edit}
        </button>
      </td>
    </tr>
  `).join('');
}

function getWeekRanges(count = 16) {
  const today = new Date();
  const day = today.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diff);
  monday.setHours(0, 0, 0, 0);

  const fmt = d => formatDateKey(d);
  const label = (mon, fri) => {
    const opts = { month: 'short', day: 'numeric' };
    return `${mon.toLocaleDateString('en-US', opts)} – ${fri.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`;
  };

  return Array.from({ length: count }, (_, i) => {
    const mon = new Date(monday);
    mon.setDate(monday.getDate() - i * 7);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    return { from: fmt(mon), to: fmt(fri), label: label(mon, fri) };
  });
}

function toTimeInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function openEditAttendanceModal(record, onSaved) {
  const internName = record.intern?.full_name || 'Unknown';

  // Pre-calculate values outside modal HTML to improve rendering speed
  const timeIn1 = toTimeInput(record.time_in_1);
  const timeOut1 = toTimeInput(record.time_out_1);
  const timeIn2 = toTimeInput(record.time_in_2);
  const timeOut2 = toTimeInput(record.time_out_2);

  createModal(`Edit Attendance — ${internName}`, `
    <form id="edit-attendance-form" class="space-y-4">
      <div class="p-3 bg-neutral-50 rounded-lg text-sm text-neutral-600">
        <strong>Date:</strong> ${formatDate(record.date)} &nbsp;|&nbsp;
        <strong>Status:</strong> ${record.status}
      </div>
      <p class="text-xs text-neutral-500">Mark a session as "Not worked" if the intern only worked the other session.</p>
      <div class="space-y-6">
        <!-- Morning Session -->
        <div class="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-semibold text-neutral-800">Morning Session</h4>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="check-morning-not-worked" class="w-4 h-4">
              <span class="text-sm text-neutral-600">Not worked</span>
            </label>
          </div>
          <div class="space-y-3">
            <div>
              <label class="form-label">Morning In *</label>
              <input type="time" id="edit-time-in-1" class="form-input w-full" value="${timeIn1}" placeholder="--:-- --">
            </div>
            <div>
              <label class="form-label">Lunch Out *</label>
              <input type="time" id="edit-time-out-1" class="form-input w-full" value="${timeOut1}" placeholder="--:-- --">
            </div>
          </div>
        </div>

        <!-- Afternoon Session -->
        <div class="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-semibold text-neutral-800">Afternoon Session</h4>
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" id="check-afternoon-not-worked" class="w-4 h-4">
              <span class="text-sm text-neutral-600">Not worked</span>
            </label>
          </div>
          <div class="space-y-3">
            <div>
              <label class="form-label">Afternoon In *</label>
              <input type="time" id="edit-time-in-2" class="form-input w-full" value="${timeIn2}" placeholder="01:00 PM">
            </div>
            <div>
              <label class="form-label">End of Day *</label>
              <input type="time" id="edit-time-out-2" class="form-input w-full" value="${timeOut2}" placeholder="05:42 PM">
            </div>
          </div>
        </div>

        <p class="text-xs text-neutral-500 italic">All times are required within worked sessions. Times must be in chronological order.</p>
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-att-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-att-submit" class="btn-primary">Save Changes</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#edit-att-cancel').addEventListener('click', close);

    // Handle "Not worked" session checkboxes
    const setupSessionToggle = (checkboxId, timeInputIds) => {
      const checkbox = el.querySelector(checkboxId);
      const inputs = timeInputIds.map(id => el.querySelector(id));
      
      checkbox.addEventListener('change', () => {
        inputs.forEach(input => {
          if (checkbox.checked) {
            input.disabled = true;
            input.value = '';
            input.style.backgroundColor = '#f3f4f6';
          } else {
            input.disabled = false;
            input.style.backgroundColor = '';
          }
        });
      });
    };

    // Determine if sessions were marked as "not worked" based on stored data
    const morningInputs = ['#edit-time-in-1', '#edit-time-out-1'].map(id => el.querySelector(id));
    const afternoonInputs = ['#edit-time-in-2', '#edit-time-out-2'].map(id => el.querySelector(id));
    
    const morningNotWorked = morningInputs.every(input => !input.value);
    const afternoonNotWorked = afternoonInputs.every(input => !input.value);

    // Pre-check and disable if session was marked as not worked
    if (morningNotWorked && (record.time_in_1 === null || record.time_in_1 === undefined)) {
      const checkbox = el.querySelector('#check-morning-not-worked');
      checkbox.checked = true;
      morningInputs.forEach(input => {
        input.disabled = true;
        input.style.backgroundColor = '#f3f4f6';
      });
    }

    if (afternoonNotWorked && (record.time_in_2 === null || record.time_in_2 === undefined)) {
      const checkbox = el.querySelector('#check-afternoon-not-worked');
      checkbox.checked = true;
      afternoonInputs.forEach(input => {
        input.disabled = true;
        input.style.backgroundColor = '#f3f4f6';
      });
    }

    setupSessionToggle('#check-morning-not-worked', ['#edit-time-in-1', '#edit-time-out-1']);
    setupSessionToggle('#check-afternoon-not-worked', ['#edit-time-in-2', '#edit-time-out-2']);

    el.querySelector('#edit-attendance-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const morningNotWorked = el.querySelector('#check-morning-not-worked').checked;
      const afternoonNotWorked = el.querySelector('#check-afternoon-not-worked').checked;

      // At least one session must be worked
      if (morningNotWorked && afternoonNotWorked) {
        showToast('At least one session (Morning or Afternoon) must be worked', 'error');
        return;
      }

      let timeIn1  = el.querySelector('#edit-time-in-1').value;
      let timeOut1 = el.querySelector('#edit-time-out-1').value;
      let timeIn2  = el.querySelector('#edit-time-in-2').value;
      let timeOut2 = el.querySelector('#edit-time-out-2').value;

      // Validate Morning session if worked
      if (!morningNotWorked) {
        if (!timeIn1 || !timeOut1) {
          showToast('Morning In and Lunch Out are both required for morning session', 'error');
          return;
        }
        if (timeIn1 >= timeOut1) {
          showToast('Morning In must be before Lunch Out', 'error');
          return;
        }
      } else {
        timeIn1 = '';
        timeOut1 = '';
      }

      // Validate Afternoon session if worked
      if (!afternoonNotWorked) {
        if (!timeIn2 || !timeOut2) {
          showToast('Afternoon In and End of Day are both required for afternoon session', 'error');
          return;
        }
        if (timeIn2 >= timeOut2) {
          showToast('Afternoon In must be before End of Day', 'error');
          return;
        }
      } else {
        timeIn2 = '';
        timeOut2 = '';
      }

      // Validate chronological order if both sessions are worked
      if (!morningNotWorked && !afternoonNotWorked) {
        if (timeOut1 >= timeIn2) {
          showToast('Lunch Out must be before Afternoon In', 'error');
          return;
        }
      }

      const toTs = (t) => t ? new Date(`${record.date}T${t}:00`).toISOString() : null;

      const updates = {
        time_in_1:  toTs(timeIn1),
        time_out_1: toTs(timeOut1),
        time_in_2:  toTs(timeIn2),
        time_out_2: toTs(timeOut2),
      };

      // Auto-approve if we have at least one complete session (morning or afternoon)
      const hasMorningSession = updates.time_in_1 && updates.time_out_1;
      const hasAfternoonSession = updates.time_in_2 && updates.time_out_2;
      const hasCompletePunches = hasMorningSession || hasAfternoonSession;

      updates.status = hasCompletePunches ? 'approved' : 'pending';
      updates.approved_at = hasCompletePunches ? new Date().toISOString() : null;
      updates.rejection_reason = null;

      const submitBtn = el.querySelector('#edit-att-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      try {
        const reviewerId = getCurrentUser()?.id || null;

        const { error } = await supabase
          .from('attendance_records')
          .update(updates)
          .eq('id', record.id);

        if (error) throw error;

        showToast('Attendance updated successfully', 'success');
        close();
        onSaved();

        const followUps = [];

        if (hasCompletePunches) {
          followUps.push(
            supabase
              .from('approvals')
              .update({
                status: 'approved',
                comments: 'Auto-approved after admin attendance edit',
                reviewed_at: new Date().toISOString(),
                reviewed_by: reviewerId,
              })
              .eq('type', 'attendance')
              .eq('entity_id', record.id)
              .eq('status', 'pending')
          );
        }

        followUps.push(
          logAudit('attendance.admin_edited', 'attendance_record', record.id, {
            intern: internName,
            date: record.date,
            previous: {
              time_in_1: record.time_in_1, time_out_1: record.time_out_1,
              time_in_2: record.time_in_2, time_out_2: record.time_out_2,
              status: record.status,
            },
            updated: updates,
            auto_approved: hasCompletePunches,
          })
        );

        Promise.allSettled(followUps).then((results) => {
          const approvalResult = hasCompletePunches ? results[0] : null;
          if (approvalResult?.status === 'fulfilled' && approvalResult.value?.error) {
            console.error('Failed to sync attendance approval status:', approvalResult.value.error);
          }
          if (approvalResult?.status === 'rejected') {
            console.error('Failed to sync attendance approval status:', approvalResult.reason);
          }
        });
      } catch (err) {
        showToast(err.message || 'Failed to update attendance', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Save Changes';
      }
    });
  });
}
