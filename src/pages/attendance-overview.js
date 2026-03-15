/**
 * Attendance Overview Page (HR/Admin)
 * Overview across all interns with filters and export.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, formatTime } from '../lib/utils.js';

export async function renderAttendanceOverviewPage() {
  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Default: last 7 days
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let dateFrom = weekAgo.toISOString().slice(0, 10);
  let dateTo = now.toISOString().slice(0, 10);
  let departmentFilter = '';
  let statusFilter = '';
  let searchQuery = '';

  async function fetchData() {
    let query = supabase
      .from('attendance_records')
      .select('*, intern:profiles!attendance_records_intern_id_fkey(full_name, department_id, email)')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })
      .limit(500);

    if (statusFilter) query = query.eq('status', statusFilter);

    const { data } = await query;
    let records = data || [];

    if (departmentFilter) {
      records = records.filter(r => r.intern?.department_id === departmentFilter);
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
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="form-label">From</label>
            <input type="date" id="date-from" class="form-input" value="${dateFrom}" />
          </div>
          <div>
            <label class="form-label">To</label>
            <input type="date" id="date-to" class="form-input" value="${dateTo}" />
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
        dateFrom = el.querySelector('#date-from').value;
        dateTo = el.querySelector('#date-to').value;
        departmentFilter = el.querySelector('#filter-department').value;
        statusFilter = el.querySelector('#filter-status').value;
        render();
      };

      el.querySelector('#date-from').addEventListener('change', applyFilters);
      el.querySelector('#date-to').addEventListener('change', applyFilters);
      el.querySelector('#filter-department').addEventListener('change', applyFilters);
      el.querySelector('#filter-status').addEventListener('change', applyFilters);

      el.querySelector('#search-intern').addEventListener('input', (e) => {
        searchQuery = e.target.value.trim();
        const filtered = filterBySearch(records, searchQuery);
        el.querySelector('#records-tbody').innerHTML = renderRows(records, searchQuery);
        el.querySelector('#record-count').textContent = `${filtered.length} Records`;
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
          XLSX.writeFile(wb, `attendance_overview_${dateFrom}_${dateTo}.xlsx`);
          showToast('Exported successfully', 'success');
        } catch (err) {
          showToast('Export failed', 'error');
        }
      });
    }, '/attendance-overview');
  }

  await render();
}

function filterBySearch(records, query) {
  if (!query) return records;
  const lower = query.toLowerCase();
  return records.filter(r => (r.intern?.full_name || '').toLowerCase().includes(lower));
}

function renderRows(records, searchQuery) {
  const filtered = filterBySearch(records, searchQuery);
  if (filtered.length === 0) {
    return '<tr><td colspan="9" class="text-center text-neutral-400 py-8">No records found</td></tr>';
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
      </td>
    </tr>
  `).join('');
}
