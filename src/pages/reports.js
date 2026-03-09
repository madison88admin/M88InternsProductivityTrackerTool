/**
 * Reports Page (HR/Admin)
 * Generate and export attendance, task, allowance reports with charts.
 */
import { getProfile, getUserRole } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, getMonday, getFriday } from '../lib/utils.js';

let chartInstance = null;

export async function renderReportsPage() {
  const profile = getProfile();
  const role = getUserRole();

  // Get locations and departments for filters
  const [{ data: locations }, { data: departments }] = await Promise.all([
    supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
  ]);

  renderLayout(`
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">Reports</h1>
      <p class="text-neutral-500 mt-1">Generate and export reports</p>
    </div>

    <!-- Report Type Selection -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label class="form-label">Report Type</label>
          <select id="report-type" class="form-input">
            <option value="attendance">Attendance Summary</option>
            <option value="hours">Hours Logged</option>
            <option value="tasks">Task Status</option>
            <option value="allowance">Allowance Summary</option>
          </select>
        </div>
        <div>
          <label class="form-label">Date From</label>
          <input type="date" id="date-from" class="form-input" />
        </div>
        <div>
          <label class="form-label">Date To</label>
          <input type="date" id="date-to" class="form-input" />
        </div>
        <div>
          <label class="form-label">Location</label>
          <select id="filter-location" class="form-input">
            <option value="">All Locations</option>
            ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="mt-4 flex gap-3">
        <button id="generate-btn" class="btn-primary">
          ${icons.filter}
          <span class="ml-2">Generate</span>
        </button>
        <button id="export-xlsx-btn" class="btn-secondary" disabled>
          ${icons.download}
          <span class="ml-2">Export XLSX</span>
        </button>
        <button id="export-pdf-btn" class="btn-secondary" disabled>
          ${icons.download}
          <span class="ml-2">Export PDF</span>
        </button>
      </div>
    </div>

    <!-- Chart -->
    <div class="card mb-6" id="chart-section" style="display:none;">
      <canvas id="report-chart" height="300"></canvas>
    </div>

    <!-- Data Table -->
    <div class="card" id="table-section" style="display:none;">
      <div id="report-table-container"></div>
    </div>
  `, (el) => {
    // Set default dates (last 30 days)
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    el.querySelector('#date-from').value = thirtyDaysAgo.toISOString().slice(0, 10);
    el.querySelector('#date-to').value = now.toISOString().slice(0, 10);

    let reportData = null;

    el.querySelector('#generate-btn').addEventListener('click', async () => {
      const type = el.querySelector('#report-type').value;
      const dateFrom = el.querySelector('#date-from').value;
      const dateTo = el.querySelector('#date-to').value;
      const locationId = el.querySelector('#filter-location').value;

      if (!dateFrom || !dateTo) {
        showToast('Please select date range', 'error');
        return;
      }

      const btn = el.querySelector('#generate-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Generating...`;

      try {
        reportData = await fetchReportData(type, dateFrom, dateTo, locationId);
        renderChart(el, type, reportData);
        renderTable(el, type, reportData);

        el.querySelector('#chart-section').style.display = '';
        el.querySelector('#table-section').style.display = '';
        el.querySelector('#export-xlsx-btn').disabled = false;
        el.querySelector('#export-pdf-btn').disabled = false;
      } catch (err) {
        showToast('Failed to generate report', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icons.filter}<span class="ml-2">Generate</span>`;
      }
    });

    el.querySelector('#export-xlsx-btn').addEventListener('click', () => {
      if (reportData) exportXlsx(reportData, el.querySelector('#report-type').value);
    });

    el.querySelector('#export-pdf-btn').addEventListener('click', () => {
      if (reportData) exportPdf(reportData, el.querySelector('#report-type').value);
    });
  }, '/reports');
}

async function fetchReportData(type, dateFrom, dateTo, locationId) {
  switch (type) {
    case 'attendance': {
      let query = supabase
        .from('attendance_records')
        .select('*, intern:profiles!attendance_records_intern_id_fkey(full_name, location_id)')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false });
      const { data } = await query;
      let records = data || [];
      if (locationId) records = records.filter(r => r.intern?.location_id === locationId);
      return records;
    }
    case 'hours': {
      let query = supabase
        .from('attendance_records')
        .select('date, total_hours, intern:profiles!attendance_records_intern_id_fkey(full_name, location_id)')
        .eq('status', 'approved')
        .gte('date', dateFrom)
        .lte('date', dateTo);
      const { data } = await query;
      let records = data || [];
      if (locationId) records = records.filter(r => r.intern?.location_id === locationId);

      // Group by intern
      const grouped = {};
      records.forEach(r => {
        const name = r.intern?.full_name || 'Unknown';
        if (!grouped[name]) grouped[name] = 0;
        grouped[name] += r.total_hours || 0;
      });
      return Object.entries(grouped).map(([name, hours]) => ({ name, hours }));
    }
    case 'tasks': {
      const { data } = await supabase
        .from('tasks')
        .select('status')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59');
      const counts = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
      (data || []).forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });
      return counts;
    }
    case 'allowance': {
      const { data } = await supabase
        .from('allowance_periods')
        .select('*, intern:profiles!allowance_periods_intern_id_fkey(full_name)')
        .gte('week_start', dateFrom)
        .lte('week_end', dateTo)
        .eq('status', 'approved')
        .order('week_start', { ascending: false });
      return data || [];
    }
    default:
      return [];
  }
}

async function renderChart(el, type, data) {
  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);

  if (chartInstance) chartInstance.destroy();
  const ctx = el.querySelector('#report-chart').getContext('2d');

  let config;
  switch (type) {
    case 'attendance': {
      const statusCounts = { pending: 0, approved: 0, rejected: 0 };
      data.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });
      config = {
        type: 'doughnut',
        data: {
          labels: ['Pending', 'Approved', 'Rejected'],
          datasets: [{
            data: [statusCounts.pending, statusCounts.approved, statusCounts.rejected],
            backgroundColor: ['#f59e0b', '#10b981', '#ef4444'],
          }],
        },
        options: { plugins: { title: { display: true, text: 'Attendance Status Distribution' } } },
      };
      break;
    }
    case 'hours': {
      config = {
        type: 'bar',
        data: {
          labels: data.map(d => d.name),
          datasets: [{
            label: 'Hours',
            data: data.map(d => d.hours),
            backgroundColor: '#4f46e5',
          }],
        },
        options: { plugins: { title: { display: true, text: 'Total Hours by Intern' } }, scales: { y: { beginAtZero: true } } },
      };
      break;
    }
    case 'tasks': {
      config = {
        type: 'doughnut',
        data: {
          labels: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
          datasets: [{
            data: [data.not_started, data.in_progress, data.completed, data.blocked],
            backgroundColor: ['#6b7280', '#3b82f6', '#10b981', '#ef4444'],
          }],
        },
        options: { plugins: { title: { display: true, text: 'Task Status Breakdown' } } },
      };
      break;
    }
    case 'allowance': {
      const byIntern = {};
      data.forEach(p => {
        const name = p.intern?.full_name || 'Unknown';
        byIntern[name] = (byIntern[name] || 0) + p.total_amount;
      });
      config = {
        type: 'bar',
        data: {
          labels: Object.keys(byIntern),
          datasets: [{
            label: 'Total Allowance (₱)',
            data: Object.values(byIntern),
            backgroundColor: '#10b981',
          }],
        },
        options: { plugins: { title: { display: true, text: 'Allowance by Intern' } }, scales: { y: { beginAtZero: true } } },
      };
      break;
    }
  }

  chartInstance = new Chart(ctx, config);
}

function renderTable(el, type, data) {
  const container = el.querySelector('#report-table-container');

  switch (type) {
    case 'attendance':
      container.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Intern</th><th>Date</th><th>Clock In</th><th>Clock Out</th><th>Hours</th><th>Status</th></tr></thead>
          <tbody>
            ${data.map(r => `<tr>
              <td>${r.intern?.full_name || '—'}</td>
              <td>${formatDate(r.date)}</td>
              <td>${r.morning_in || '—'}</td>
              <td>${r.afternoon_out || '—'}</td>
              <td>${formatHoursDisplay(r.total_hours)}</td>
              <td><span class="badge-${r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'pending'}">${r.status}</span></td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      break;
    case 'hours':
      container.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Intern</th><th>Total Hours</th></tr></thead>
          <tbody>
            ${data.map(d => `<tr><td>${d.name}</td><td>${formatHoursDisplay(d.hours)}</td></tr>`).join('')}
          </tbody>
        </table>`;
      break;
    case 'tasks':
      container.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Status</th><th>Count</th></tr></thead>
          <tbody>
            <tr><td>Not Started</td><td>${data.not_started}</td></tr>
            <tr><td>In Progress</td><td>${data.in_progress}</td></tr>
            <tr><td>Completed</td><td>${data.completed}</td></tr>
            <tr><td>Blocked</td><td>${data.blocked}</td></tr>
          </tbody>
        </table>`;
      break;
    case 'allowance':
      container.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Intern</th><th>Week</th><th>Hours</th><th>Rate</th><th>Amount</th></tr></thead>
          <tbody>
            ${data.map(p => `<tr>
              <td>${p.intern?.full_name || '—'}</td>
              <td>${formatDate(p.week_start)} – ${formatDate(p.week_end)}</td>
              <td>${formatHoursDisplay(p.total_hours)}</td>
              <td>₱${p.hourly_rate?.toFixed(2)}</td>
              <td class="font-semibold">₱${p.total_amount?.toFixed(2)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
      break;
  }
}

async function exportXlsx(data, type) {
  try {
    const XLSX = await import('xlsx');
    let rows;

    switch (type) {
      case 'attendance':
        rows = data.map(r => ({
          Intern: r.intern?.full_name, Date: r.date,
          'Clock In': r.morning_in, 'Clock Out': r.afternoon_out,
          Hours: r.total_hours, Status: r.status,
        }));
        break;
      case 'hours':
        rows = data.map(d => ({ Intern: d.name, 'Total Hours': d.hours }));
        break;
      case 'tasks':
        rows = [
          { Status: 'Not Started', Count: data.not_started },
          { Status: 'In Progress', Count: data.in_progress },
          { Status: 'Completed', Count: data.completed },
          { Status: 'Blocked', Count: data.blocked },
        ];
        break;
      case 'allowance':
        rows = data.map(p => ({
          Intern: p.intern?.full_name, 'Week Start': p.week_start,
          'Week End': p.week_end, Hours: p.total_hours,
          Rate: p.hourly_rate, Amount: p.total_amount,
        }));
        break;
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast('XLSX exported', 'success');
  } catch (err) {
    showToast('Failed to export XLSX', 'error');
  }
}

async function exportPdf(data, type) {
  try {
    const { default: jsPDF } = await import('jspdf');
    await import('jspdf-autotable');

    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(`Report: ${type.charAt(0).toUpperCase() + type.slice(1)}`, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);

    let head, body;
    switch (type) {
      case 'attendance':
        head = [['Intern', 'Date', 'Clock In', 'Clock Out', 'Hours', 'Status']];
        body = data.map(r => [r.intern?.full_name, r.date, r.morning_in || '—', r.afternoon_out || '—', r.total_hours?.toFixed(2), r.status]);
        break;
      case 'hours':
        head = [['Intern', 'Total Hours']];
        body = data.map(d => [d.name, d.hours.toFixed(2)]);
        break;
      case 'tasks':
        head = [['Status', 'Count']];
        body = [['Not Started', data.not_started], ['In Progress', data.in_progress], ['Completed', data.completed], ['Blocked', data.blocked]];
        break;
      case 'allowance':
        head = [['Intern', 'Week', 'Hours', 'Rate', 'Amount']];
        body = data.map(p => [p.intern?.full_name, `${p.week_start} – ${p.week_end}`, p.total_hours?.toFixed(2), `₱${p.hourly_rate?.toFixed(2)}`, `₱${p.total_amount?.toFixed(2)}`]);
        break;
    }

    doc.autoTable({ head, body, startY: 35 });
    doc.save(`report_${type}_${new Date().toISOString().slice(0, 10)}.pdf`);
    showToast('PDF exported', 'success');
  } catch (err) {
    showToast('Failed to export PDF', 'error');
  }
}
