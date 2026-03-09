/**
 * Attendance Overview Page (HR/Admin)
 * Overview across all interns with filters and export.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay } from '../lib/utils.js';

export async function renderAttendanceOverviewPage() {
  const { data: locations } = await supabase
    .from('locations')
    .select('id, name')
    .eq('is_active', true)
    .order('name');

  // Default: last 7 days
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let dateFrom = weekAgo.toISOString().slice(0, 10);
  let dateTo = now.toISOString().slice(0, 10);
  let locationFilter = '';
  let statusFilter = '';

  async function fetchData() {
    let query = supabase
      .from('attendance_records')
      .select('*, intern:profiles!attendance_records_intern_id_fkey(full_name, location_id, email)')
      .gte('date', dateFrom)
      .lte('date', dateTo)
      .order('date', { ascending: false })
      .limit(500);

    if (statusFilter) query = query.eq('status', statusFilter);

    const { data } = await query;
    let records = data || [];

    if (locationFilter) {
      records = records.filter(r => r.intern?.location_id === locationFilter);
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
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-neutral-800">Attendance Overview</h1>
        <p class="text-neutral-500 mt-1">Cross-team attendance monitoring</p>
      </div>

      <!-- Filters -->
      <div class="card mb-6">
        <div class="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label class="form-label">From</label>
            <input type="date" id="date-from" class="form-input" value="${dateFrom}" />
          </div>
          <div>
            <label class="form-label">To</label>
            <input type="date" id="date-to" class="form-input" value="${dateTo}" />
          </div>
          <div>
            <label class="form-label">Location</label>
            <select id="filter-location" class="form-input">
              <option value="">All</option>
              ${(locations || []).map(l => `<option value="${l.id}" ${locationFilter === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}
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
          <div class="flex items-end">
            <button id="apply-btn" class="btn-primary w-full">Apply</button>
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
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold">${total} Records</h3>
          <button id="export-btn" class="btn-sm btn-secondary">
            ${icons.download}
            <span class="ml-1">Export</span>
          </button>
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
            <tbody>
              ${records.map(r => `
                <tr>
                  <td>${r.intern?.full_name || '—'}</td>
                  <td>${formatDate(r.date)}</td>
                  <td class="text-sm">${r.morning_in || '—'}</td>
                  <td class="text-sm">${r.morning_out || '—'}</td>
                  <td class="text-sm">${r.afternoon_in || '—'}</td>
                  <td class="text-sm">${r.afternoon_out || '—'}</td>
                  <td>${formatHoursDisplay(r.total_hours)}</td>
                  <td><span class="badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'pending'}">${r.status}</span></td>
                  <td>
                    ${r.is_late ? '<span class="badge-warning text-xs">Late</span>' : ''}
                    ${r.is_outside_hours ? '<span class="badge-danger text-xs ml-1">Outside</span>' : ''}
                  </td>
                </tr>
              `).join('')}
              ${records.length === 0 ? '<tr><td colspan="9" class="text-center text-neutral-400 py-8">No records found</td></tr>' : ''}
            </tbody>
          </table>
        </div>
      </div>
    `, (el) => {
      el.querySelector('#apply-btn').addEventListener('click', () => {
        dateFrom = el.querySelector('#date-from').value;
        dateTo = el.querySelector('#date-to').value;
        locationFilter = el.querySelector('#filter-location').value;
        statusFilter = el.querySelector('#filter-status').value;
        render();
      });

      el.querySelector('#export-btn').addEventListener('click', async () => {
        try {
          const XLSX = await import('xlsx');
          const rows = records.map(r => ({
            Intern: r.intern?.full_name,
            Email: r.intern?.email,
            Date: r.date,
            'AM In': r.morning_in,
            'AM Out': r.morning_out,
            'PM In': r.afternoon_in,
            'PM Out': r.afternoon_out,
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
