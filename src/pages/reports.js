/**
 * Reports Page (HR/Admin)
 * Generate and export attendance, task, allowance reports with charts.
 * Includes Daily Activity Report (DAR) PDF generation.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateKey, formatTime, formatHoursDisplay, formatHoursBothFormats, formatHoursAsHHMM, formatCurrency, calculateSessionHours, getTrackingWeekStart, getTrackingWeekEnd, getTodayDate } from '../lib/utils.js';
import { logAudit } from '../lib/audit.js';
import { getSignedStorageUrls, getPublicStorageUrl } from '../lib/storage.js';

let chartInstance = null;

export async function renderReportsPage() {
  const [{ data: locations }, { data: departments }] = await Promise.all([
    supabase.from('locations').select('id, name').eq('is_active', true).order('name'),
    supabase.from('departments').select('id, name').eq('is_active', true).order('name'),
  ]);

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Reports</h1>
      <p class="page-subtitle">Generate, view, and export operational reports</p>
    </div>

    <!-- Filters Card -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-5 gap-4" id="standard-filters">
        <div>
          <label class="form-label">Report Type</label>
          <select id="report-type" class="form-input">
            <option value="attendance">Attendance Summary</option>
            <option value="hours">Hours Logged</option>
            <option value="tasks">Task Status</option>
            <option value="allowance">Allowance Summary</option>
            <option value="dar">Daily Activity Report (DAR)</option>
          </select>
        </div>
        <div id="date-from-group">
          <label class="form-label">Date From</label>
          <input type="date" id="date-from" class="form-input" />
        </div>
        <div id="date-to-group">
          <label class="form-label">Date To</label>
          <input type="date" id="date-to" class="form-input" />
        </div>
        <div id="location-group">
          <label class="form-label">Location</label>
          <select id="filter-location" class="form-input">
            <option value="">All Locations</option>
            ${(locations || []).map(l => `<option value="${l.id}">${l.name}</option>`).join('')}
          </select>
        </div>
        <div id="department-group">
          <label class="form-label">Department</label>
          <select id="filter-department" class="form-input">
            <option value="">All Departments</option>
            ${(departments || []).map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
          </select>
        </div>
      </div>

      <!-- DAR-specific controls -->
      <div id="dar-controls" class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4" style="display:none;">
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="form-label mb-0">Intern(s)</label>
            <button type="button" id="dar-select-all" class="text-xs text-primary-600 hover:text-primary-800 font-medium">Select All</button>
          </div>
          <div id="dar-intern-list" class="border border-neutral-200 rounded-lg overflow-y-auto bg-white divide-y divide-neutral-100" style="max-height:170px; min-height:56px;">
            <p class="text-xs text-neutral-400 p-3">Loading interns...</p>
          </div>
        </div>
        <div>
          <label class="form-label">Week</label>
          <select id="dar-week" class="form-input">
            <option value="">Select an intern first</option>
          </select>
        </div>
        <div>
          <label class="form-label">Download Mode</label>
          <select id="dar-bulk-mode" class="form-input">
            <option value="single">Individual PDF(s)</option>
            <option value="zip">Individual PDFs in ZIP</option>
            <option value="combined">Combined PDF</option>
          </select>
        </div>
      </div>

      <!-- DAR PDF Preview (auto-shown when a single intern + week is selected) -->
      <div id="dar-preview-section" class="mt-4" style="display:none;">
        <div class="flex items-center justify-between mb-2">
          <h4 class="text-sm font-semibold text-neutral-700">DAR Preview</h4>
          <span class="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-full" id="dar-preview-label"></span>
        </div>
        <div class="rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50" style="height:540px;">
          <div id="dar-preview-loading" class="flex items-center justify-center h-full text-neutral-400 text-sm" style="display:none !important;">
            <span class="spinner mr-2"></span> Generating preview...
          </div>
          <iframe id="dar-preview-frame" style="width:100%;height:100%;border:none;"></iframe>
        </div>
      </div>

      <div class="mt-4 flex flex-wrap gap-3 items-center">
        <button id="generate-btn" class="btn-primary">
          ${icons.filter}
          <span class="ml-2">Generate Report</span>
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

    <!-- Chart + Summary Stats -->
    <div class="card mb-6" id="chart-section" style="display:none;">
      <div id="chart-inner" class="flex flex-col md:flex-row items-start gap-6">
        <div id="chart-canvas-wrap" style="position:relative; flex-shrink:0;">
          <canvas id="report-chart"></canvas>
        </div>
        <div id="chart-stats" class="flex-1"></div>
      </div>
    </div>

    <!-- Data Table -->
    <div class="card" id="table-section" style="display:none;">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-neutral-800" id="table-title">Results</h3>
        <span class="text-sm text-neutral-500 bg-neutral-100 px-3 py-1 rounded-full" id="table-count"></span>
      </div>
      <div id="report-table-container" class="overflow-x-auto"></div>
    </div>
  `, (el) => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    el.querySelector('#date-from').value = formatDateKey(thirtyDaysAgo);
    el.querySelector('#date-to').value = formatDateKey(now);

    let reportData = null;
    let currentType = 'attendance';

    el.querySelector('#report-type').addEventListener('change', (e) => {
      currentType = e.target.value;
      const isDar = currentType === 'dar';
      el.querySelector('#dar-controls').style.display = isDar ? '' : 'none';
      el.querySelector('#date-from-group').style.display = isDar ? 'none' : '';
      el.querySelector('#date-to-group').style.display = isDar ? 'none' : '';
      el.querySelector('#location-group').style.display = isDar ? 'none' : '';
      el.querySelector('#department-group').style.display = isDar ? 'none' : '';
      el.querySelector('#export-xlsx-btn').style.display = isDar ? 'none' : '';
      el.querySelector('#export-pdf-btn').style.display = isDar ? 'none' : '';
      el.querySelector('#chart-section').style.display = 'none';
      el.querySelector('#table-section').style.display = 'none';
      reportData = null;

      if (isDar) populateDarInterns(el);
    });

    // Update preview when week selection changes
    el.querySelector('#dar-week').addEventListener('change', () => updateDarPreview(el));

    el.querySelector('#generate-btn').addEventListener('click', async () => {
      currentType = el.querySelector('#report-type').value;

      if (currentType === 'dar') {
        await handleDarGeneration(el);
        return;
      }

      const dateFrom = el.querySelector('#date-from').value;
      const dateTo = el.querySelector('#date-to').value;
      const locationId = el.querySelector('#filter-location').value;
      const departmentId = el.querySelector('#filter-department').value;

      if (!dateFrom || !dateTo) {
        showToast('Please select a date range', 'error');
        return;
      }

      const btn = el.querySelector('#generate-btn');
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> Generating...`;

      try {
        reportData = await fetchReportData(currentType, dateFrom, dateTo, locationId, departmentId);
        renderChart(el, currentType, reportData);
        renderTable(el, currentType, reportData);

        el.querySelector('#chart-section').style.display = '';
        el.querySelector('#table-section').style.display = '';
        el.querySelector('#export-xlsx-btn').disabled = false;
        el.querySelector('#export-pdf-btn').disabled = false;
      } catch (err) {
        console.error('Report generation error:', err);
        showToast('Failed to generate report', 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = `${icons.filter}<span class="ml-2">Generate Report</span>`;
      }
    });

    el.querySelector('#export-xlsx-btn').addEventListener('click', () => {
      if (reportData) exportXlsx(reportData, currentType);
    });

    el.querySelector('#export-pdf-btn').addEventListener('click', () => {
      if (reportData) {
        const dateFrom = el.querySelector('#date-from').value;
        const dateTo = el.querySelector('#date-to').value;
        exportPdf(reportData, currentType, dateFrom, dateTo);
      }
    });
  }, '/reports');
}

// ─── DAR: Populate intern multi-select ──────────────────────────────────────

async function populateDarInterns(el) {
  const { data: interns } = await supabase
    .from('profiles')
    .select('id, full_name, department_id, course, school, ojt_start_date, supervisor_id, signature_url')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  const list = el.querySelector('#dar-intern-list');
  const internList = interns || [];

  list.innerHTML = internList.length > 0
    ? internList.map(i => `
        <label class="flex items-center gap-2 px-3 py-2 hover:bg-neutral-50 cursor-pointer">
          <input type="checkbox" class="dar-intern-check" value="${i.id}" />
          <span class="text-sm text-neutral-800">${i.full_name}</span>
        </label>
      `).join('')
    : '<p class="text-xs text-neutral-400 p-3">No active interns found</p>';

  list._internsData = internList;

  const selectAllBtn = el.querySelector('#dar-select-all');
  selectAllBtn.textContent = 'Select All';
  selectAllBtn.onclick = () => {
    const checkboxes = list.querySelectorAll('.dar-intern-check');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => { cb.checked = !allChecked; });
    selectAllBtn.textContent = allChecked ? 'Select All' : 'Deselect All';
    populateDarWeeks(el);
  };

  list.addEventListener('change', (e) => {
    if (e.target.classList.contains('dar-intern-check')) {
      const checkboxes = list.querySelectorAll('.dar-intern-check');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      selectAllBtn.textContent = allChecked ? 'Deselect All' : 'Select All';
      populateDarWeeks(el);
    }
  });
}

// ─── DAR: Local date string helper (avoids UTC shift from toISOString) ──────

function toLocalDateStr(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateMMDDYYYY(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}/${d.getFullYear()}`;
}

// ─── DAR: Auto-detect weeks from attendance records ─────────────────────────

async function populateDarWeeks(el) {
  const list = el.querySelector('#dar-intern-list');
  const selectedIds = Array.from(list.querySelectorAll('.dar-intern-check:checked')).map(cb => cb.value);

  if (selectedIds.length === 0) {
    el.querySelector('#dar-week').innerHTML = '<option value="">Select an intern first</option>';
    updateDarPreview(el);
    return;
  }

  const firstInternId = selectedIds[0];
  const intern = (list._internsData || []).find(i => i.id === firstInternId);

  const { data: records } = await supabase
    .from('attendance_records')
    .select('date')
    .eq('intern_id', firstInternId)
    .order('date', { ascending: true });

  if (!records || records.length === 0) {
    el.querySelector('#dar-week').innerHTML = '<option value="">No attendance records found</option>';
    updateDarPreview(el);
    return;
  }

  const weeks = new Map();
  const ojtStart = intern?.ojt_start_date ? new Date(intern.ojt_start_date + 'T00:00:00') : null;

  records.forEach(r => {
    const date = new Date(r.date + 'T00:00:00');
    const start = getTrackingWeekStart(date);
    const end = getTrackingWeekEnd(date);
    const key = toLocalDateStr(start);

    if (!weeks.has(key)) {
      let weekNum = 1;
      if (ojtStart) {
        const ojtStartWeek = getTrackingWeekStart(ojtStart);
        const diffMs = start - ojtStartWeek;
        weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
        if (weekNum < 1) weekNum = 1;
      }
      weeks.set(key, {
        start: key,
        end: toLocalDateStr(end),
        weekNum,
      });
    }
  });

  const weekSelect = el.querySelector('#dar-week');
  const weeksArr = Array.from(weeks.values()).sort((a, b) => b.start.localeCompare(a.start));
  weekSelect.innerHTML = weeksArr.map(w =>
    `<option value="${w.start}|${w.end}|${w.weekNum}">Week ${w.weekNum} (${formatDateMMDDYYYY(w.start)} – ${formatDateMMDDYYYY(w.end)})</option>`
  ).join('');

  // Trigger preview whenever weeks are (re)populated
  updateDarPreview(el);
}

// ─── DAR: Auto PDF preview ───────────────────────────────────────────────────

async function updateDarPreview(el) {
  const list = el.querySelector('#dar-intern-list');
  const weekSelect = el.querySelector('#dar-week');
  const previewSection = el.querySelector('#dar-preview-section');
  const previewFrame = el.querySelector('#dar-preview-frame');
  const previewLabel = el.querySelector('#dar-preview-label');

  const selectedIds = Array.from(list.querySelectorAll('.dar-intern-check:checked')).map(cb => cb.value);
  const weekValue = weekSelect?.value;

  // Only preview for a single intern selection
  if (selectedIds.length !== 1 || !weekValue) {
    previewSection.style.display = 'none';
    if (previewFrame._blobUrl) {
      URL.revokeObjectURL(previewFrame._blobUrl);
      previewFrame._blobUrl = null;
      previewFrame.src = '';
    }
    return;
  }

  const [startDate, endDate, weekNumStr] = weekValue.split('|');
  const weekNum = parseInt(weekNumStr, 10);

  previewSection.style.display = '';
  previewLabel.textContent = 'Generating preview...';
  previewFrame.style.opacity = '0.4';

  try {
    const darData = await fetchDarData(selectedIds[0], startDate, endDate);
    // Calculate week number for the selected intern
    const internWeekNum = calculateInternWeekNumber(darData.intern?.ojt_start_date, startDate);
    const doc = await generateDarPdf(darData, internWeekNum, startDate);
    const blob = doc.output('blob');

    if (previewFrame._blobUrl) URL.revokeObjectURL(previewFrame._blobUrl);
    const url = URL.createObjectURL(blob);
    previewFrame._blobUrl = url;
    previewFrame.src = url;
    previewFrame.style.opacity = '1';

    const internName = darData.intern?.full_name || 'Intern';
    previewLabel.textContent = `${internName} — Week ${internWeekNum}`;
  } catch (err) {
    console.error('DAR preview error:', err);
    previewLabel.textContent = 'Preview unavailable';
    previewSection.style.display = 'none';
  }
}

/**
 * Calculate week number for an intern based on OJT start date and target start
 */
function calculateInternWeekNumber(ojtStartDate, startDate) {
  if (!ojtStartDate) return 1;

  const ojtStart = new Date(ojtStartDate + 'T00:00:00');
  const start = new Date(startDate + 'T00:00:00');
  const ojtStartWeek = getTrackingWeekStart(ojtStart);
  const diffMs = start - ojtStartWeek;
  let weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  if (weekNum < 1) weekNum = 1;
  return weekNum;
}

export async function fetchDarData(internId, startDate, endDate) {
  const [
    { data: intern },
    { data: attendance },
    { data: narratives },
    { data: holidays },
    { data: allowancePeriod },
    { data: allowanceConfig },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, course, school, ojt_start_date, signature_url, supervisor_id, department_id, departments(name)')
      .eq('id', internId)
      .single(),
    supabase
      .from('attendance_records')
      .select('*')
      .eq('intern_id', internId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
    supabase
      .from('narratives')
      .select('*, task:tasks(title)')
      .eq('intern_id', internId)
      .gte('date', startDate)
      .lte('date', endDate)
      .neq('status', 'draft')  // Exclude drafts from reports
      .order('date', { ascending: true }),
    supabase
      .from('holidays')
      .select('date, name')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true }),
    supabase
      .from('allowance_periods')
      .select('total_amount, total_hours, hourly_rate, status')
      .eq('intern_id', internId)
      .eq('week_start', startDate)
      .maybeSingle(),
    supabase
      .from('allowance_config')
      .select('hourly_rate')
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const supervisorIds = new Set((attendance || []).map(a => a.supervisor_id).filter(Boolean));
  if (intern?.supervisor_id) supervisorIds.add(intern.supervisor_id);

  let supervisors = [];
  if (supervisorIds.size > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, signature_url')
      .in('id', Array.from(supervisorIds));
    supervisors = data || [];
  }

  return {
    intern,
    attendance: attendance || [],
    narratives: narratives || [],
    holidays: holidays || [],
    supervisors,
    allowancePeriod,
    hourlyRate: allowanceConfig?.hourly_rate ?? null,
  };
}

// ─── DAR: Helper utilities ──────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return '';
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

async function loadImageAsDataUrl(url) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatHolidayName(name) {
  return String(name || 'Holiday').toUpperCase();
}

function addPdfHeaderStamp(doc, text, opts = {}) {
  if (!text) return;

  const margin = typeof opts.margin === 'number' ? opts.margin : 10;
  const yTop = typeof opts.yTop === 'number' ? opts.yTop : margin;
  const opacity = typeof opts.opacity === 'number' ? opts.opacity : 0.25;
  const fontSize = typeof opts.fontSize === 'number' ? opts.fontSize : 10;

  const pageWidth = doc.internal.pageSize.getWidth();

  const canSaveState = typeof doc.saveGraphicsState === 'function' && typeof doc.restoreGraphicsState === 'function';
  if (canSaveState) doc.saveGraphicsState();

  try {
    if (typeof doc.setGState === 'function' && typeof doc.GState === 'function') {
      doc.setGState(new doc.GState({ opacity }));
      doc.setTextColor(60, 60, 60);
    } else {
      doc.setTextColor(170, 170, 170);
    }
  } catch {
    doc.setTextColor(170, 170, 170);
  }

  doc.setFont(undefined, 'bold');
  doc.setFontSize(fontSize);

  // Upper-right stamp aligned with the logo row.
  doc.text(String(text), pageWidth - margin, yTop + 8, { align: 'right' });

  if (canSaveState) doc.restoreGraphicsState();
}

// ─── DAR: PDF generation ────────────────────────────────────────────────────

export async function generateDarPdf(darData, weekNum, startDate, existingDoc, options = {}) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { intern, attendance, narratives, holidays, supervisors, allowancePeriod, hourlyRate } = darData;

  const doc = existingDoc || new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();  // 210
  const margin = 10;

  // Pre-load images
  const logoDataUrl = await loadImageAsDataUrl('/logo.png');

  const signaturePaths = [
    intern?.signature_url,
    ...((supervisors || []).map((supervisor) => supervisor?.signature_url)),
  ].filter(Boolean);

  let signedSignatureUrls = new Map();
  if (signaturePaths.length > 0) {
    try {
      signedSignatureUrls = await getSignedStorageUrls('signatures', signaturePaths, 600);
    } catch {
      signedSignatureUrls = new Map();
    }
  }

  let internSigDataUrl = null;
  if (intern?.signature_url) {
    const sigUrl = signedSignatureUrls.get(intern.signature_url) 
      || getPublicStorageUrl('signatures', intern.signature_url) 
      || null;
    internSigDataUrl = await loadImageAsDataUrl(sigUrl);
  }

  const supervisorSigById = new Map();
  for (const supervisor of (supervisors || [])) {
    if (!supervisor?.signature_url) continue;
    const sigUrl = signedSignatureUrls.get(supervisor.signature_url) 
      || getPublicStorageUrl('signatures', supervisor.signature_url) 
      || null;
    const sigDataUrl = await loadImageAsDataUrl(sigUrl);
    if (sigDataUrl) supervisorSigById.set(supervisor.id, sigDataUrl);
  }

  const defaultSupervisorSigDataUrl = intern?.supervisor_id
    ? (supervisorSigById.get(intern.supervisor_id) || null)
    : null;

  // Logo at top left
  let y = margin;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, y, 65, 13);
  }

  if (options?.watermarkText) {
    addPdfHeaderStamp(doc, options.watermarkText, { margin, yTop: y, opacity: 0.18, fontSize: 10 });
  }
  y += 17;

  // Title centered below logo
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('DAILY ACTIVITY REPORT — INTERNSHIP', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Info fields
  doc.setFontSize(11);
  const departmentName = intern?.departments?.name || '—';
  const courseName = intern?.course || '—';

  const leftLabelX = margin;
  const leftValueX = margin + 36;
  const rightLabelX = pageWidth / 2 + 5;
  const rightValueX = pageWidth / 2 + 32;

  // Row 1: NAME | COURSE
  doc.setFont(undefined, 'bold');
  doc.text('NAME', leftLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(intern?.full_name || '—', leftValueX, y);

  doc.setFont(undefined, 'bold');
  doc.text('COURSE', rightLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(courseName, rightValueX, y);

  y += 5.5;

  // Row 2: DEPARTMENT | WEEK
  doc.setFont(undefined, 'bold');
  doc.text('DEPARTMENT', leftLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(departmentName, leftValueX, y);

  doc.setFont(undefined, 'bold');
  doc.text('WEEK', rightLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(String(weekNum), rightValueX, y);

  y += 6;

  // Build 5 target days: Friday, Monday, Tuesday, Wednesday, Thursday
  const startWeekDate = new Date(startDate + 'T00:00:00'); // This is a Friday
  const weekdays = [];
  
  // 1) Friday (Last week)
  weekdays.push(toLocalDateStr(startWeekDate));
  
  // 2) Monday (This week)
  const mondayOfThisWeek = new Date(startWeekDate);
  mondayOfThisWeek.setDate(startWeekDate.getDate() + 3);
  weekdays.push(toLocalDateStr(mondayOfThisWeek));
  
  // 3) Tuesday (This week)
  const tuesdayOfThisWeek = new Date(startWeekDate);
  tuesdayOfThisWeek.setDate(startWeekDate.getDate() + 4);
  weekdays.push(toLocalDateStr(tuesdayOfThisWeek));

  // 4) Wednesday (This week)
  const wednesdayOfThisWeek = new Date(startWeekDate);
  wednesdayOfThisWeek.setDate(startWeekDate.getDate() + 5);
  weekdays.push(toLocalDateStr(wednesdayOfThisWeek));

  // 5) Thursday (This week)
  const thursdayOfThisWeek = new Date(startWeekDate);
  thursdayOfThisWeek.setDate(startWeekDate.getDate() + 6);
  weekdays.push(toLocalDateStr(thursdayOfThisWeek));

  // Build table body (10 rows: 2 per day)
  const tableBody = [];
  let totalHours = 0;
  const signatureCells = [];
  const holidayByDate = new Map((holidays || []).map(h => [h.date, h.name || 'Holiday']));

  weekdays.forEach((dateStr, dayIdx) => {
    const att = attendance.find(a => a.date === dateStr);
    const morningNarr = narratives.find(n => n.date === dateStr && n.session === 'morning');
    const afternoonNarr = narratives.find(n => n.date === dateStr && n.session === 'afternoon');
    const holidayName = holidayByDate.get(dateStr);
    const isHolidayDate = !!holidayName;
    const isNoLog = !att && !isHolidayDate;  // No attendance AND not a holiday
    const isApproved = att?.status === 'approved';
    const supervisorSigDataUrl = att?.supervisor_id
      ? (supervisorSigById.get(att.supervisor_id) || defaultSupervisorSigDataUrl)
      : defaultSupervisorSigDataUrl;
    const holidayTask = `--- SUSPENSION OF WORK DUE TO ${formatHolidayName(holidayName)} HOLIDAY ---`;
    const noLogTask = '--- NO RECORDED LOG FOR THIS DAY ---';

    // Morning session (calculate for display purposes only)
    const mHours = isHolidayDate ? 0 : (isNoLog ? 0 : calculateSessionHours(att?.time_in_1, att?.time_out_1));
    const mTask = morningNarr?.task?.title || '';
    const mContent = stripHtml(morningNarr?.content);
    let mAccomplished = mTask ? `${mTask}${mContent ? ': ' + mContent : ''}` : mContent;
    if (isHolidayDate) mAccomplished = holidayTask;
    if (isNoLog) mAccomplished = noLogTask;
    if (mAccomplished.length > 200) mAccomplished = mAccomplished.slice(0, 200) + '...';

    tableBody.push([
      formatDateMMDDYYYY(dateStr),
      isHolidayDate || isNoLog ? '00:00' : (att?.time_in_1 ? formatTime(att.time_in_1) : '00:00'),
      isHolidayDate || isNoLog ? '00:00' : (att?.time_out_1 ? formatTime(att.time_out_1) : '00:00'),
      mAccomplished,
      formatHoursAsHHMM(mHours),
      '',
      '',
    ]);

    const mRowIdx = dayIdx * 2;
    // Add intern signature for approved, holiday, or no-log entries
    if ((isApproved || isHolidayDate || isNoLog) && internSigDataUrl) {
      signatureCells.push({ row: mRowIdx, col: 5, dataUrl: internSigDataUrl });
    }
    // Add supervisor signature only for approved or holiday (not for no-log)
    if ((isApproved || isHolidayDate) && supervisorSigDataUrl) {
      signatureCells.push({ row: mRowIdx, col: 6, dataUrl: supervisorSigDataUrl });
    }

    // Afternoon session (calculate for display purposes only)
    const aHours = isHolidayDate ? 0 : (isNoLog ? 0 : calculateSessionHours(att?.time_in_2, att?.time_out_2));
    const aTask = afternoonNarr?.task?.title || '';
    const aContent = stripHtml(afternoonNarr?.content);
    let aAccomplished = aTask ? `${aTask}${aContent ? ': ' + aContent : ''}` : aContent;
    if (isHolidayDate) aAccomplished = holidayTask;
    if (isNoLog) aAccomplished = noLogTask;
    if (aAccomplished.length > 200) aAccomplished = aAccomplished.slice(0, 200) + '...';

    tableBody.push([
      formatDateMMDDYYYY(dateStr),
      isHolidayDate || isNoLog ? '00:00' : (att?.time_in_2 ? formatTime(att.time_in_2) : '00:00'),
      isHolidayDate || isNoLog ? '00:00' : (att?.time_out_2 ? formatTime(att.time_out_2) : '00:00'),
      aAccomplished,
      formatHoursAsHHMM(aHours),
      '',
      '',
    ]);

    const aRowIdx = dayIdx * 2 + 1;
    // Add intern signature for approved, holiday, or no-log entries
    if ((isApproved || isHolidayDate || isNoLog) && internSigDataUrl) {
      signatureCells.push({ row: aRowIdx, col: 5, dataUrl: internSigDataUrl });
    }
    // Add supervisor signature only for approved or holiday (not for no-log)
    if ((isApproved || isHolidayDate) && supervisorSigDataUrl) {
      signatureCells.push({ row: aRowIdx, col: 6, dataUrl: supervisorSigDataUrl });
    }

    // Use stored total_hours from database (source of truth) instead of recalculating
    // This ensures consistency with attendance overview and allowance computations
    if (att?.total_hours != null) {
      totalHours += att.total_hours;
    }
  });

  const pageHeight = doc.internal.pageSize.getHeight();
  const approxHeaderRowH = 14;
  const footerSpace = 18;
  const bodyRowH = (pageHeight - y - margin - footerSpace - approxHeaderRowH) / 10;

  autoTable(doc, {
    startY: y,
    head: [['DATE', 'TIME IN', 'TIME OUT', 'TASK ACCOMPLISHED', 'NO. OF HOURS', 'Signature of Intern', 'Signature of Supervisor']],
    body: tableBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 1,
      valign: 'middle',
      textColor: [15, 23, 42],
      lineWidth: 0.2,
      lineColor: [0, 0, 0],
      minCellHeight: bodyRowH,
    },
    headStyles: {
      fillColor: [41, 65, 148],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 10,
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 18, halign: 'center' },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 16, halign: 'center' },
      5: { cellWidth: 24, halign: 'center' },
      6: { cellWidth: 24, halign: 'center' },
    },
    didDrawCell: (data) => {
      if (data.section === 'body') {
        const match = signatureCells.find(s => s.row === data.row.index && s.col === data.column.index);
        if (match && match.dataUrl) {
          const imgWidth = Math.min(data.cell.width - 4, 20);
          const imgHeight = Math.min(data.cell.height - 4, 14);
          const cx = data.cell.x + (data.cell.width - imgWidth) / 2;
          const cy = data.cell.y + (data.cell.height - imgHeight) / 2;
          doc.addImage(match.dataUrl, 'PNG', cx, cy, imgWidth, imgHeight);
        }
      }
    },
  });

  if (!options?.hideTotals) {
    const finalY = doc.lastAutoTable.finalY + 6;
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');

    const appliedHourlyRate = allowancePeriod?.hourly_rate ?? hourlyRate ?? 0;
    const computedAllowance = totalHours * appliedHourlyRate;
    const allowanceTotal = Number.isFinite(allowancePeriod?.total_amount)
      ? allowancePeriod.total_amount
      : (Number.isFinite(computedAllowance) ? computedAllowance : 0);

    const shouldMaskAllowance = options?.maskAllowanceUnlessApproved === true
      && allowancePeriod?.status !== 'approved';
    const allowanceForDisplay = shouldMaskAllowance ? 0 : allowanceTotal;

    // Place totals on the same row, left and right
    // Show hours in both formats for transparency: "28h 45m (28.75 hrs)"
    // Show allowance with 2 decimal places: "PHP 719.16"
    const totalHoursDisplay = formatHoursBothFormats(totalHours);
    doc.text(`TOTAL NUMBER OF HOURS: ${totalHoursDisplay}`, margin, finalY);
    doc.text(`TOTAL ALLOWANCE FOR THIS WEEK: PHP ${allowanceForDisplay.toFixed(2)}`, pageWidth - margin, finalY, { align: 'right' });
  }

  return doc;
}

// ─── DAR: Generation handler ────────────────────────────────────────────────

async function handleDarGeneration(el) {
  const list = el.querySelector('#dar-intern-list');
  const weekSelect = el.querySelector('#dar-week');
  const bulkMode = el.querySelector('#dar-bulk-mode').value;

  const selectedInternIds = Array.from(list.querySelectorAll('.dar-intern-check:checked')).map(cb => cb.value);
  const weekValue = weekSelect.value;

  if (selectedInternIds.length === 0) {
    showToast('Please select at least one intern', 'error');
    return;
  }
  if (!weekValue) {
    showToast('Please select a week', 'error');
    return;
  }

  const [startDate, endDate, weekNumStr] = weekValue.split('|');
  const weekNum = parseInt(weekNumStr, 10);

  const btn = el.querySelector('#generate-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating DAR...';

  try {
    if (selectedInternIds.length === 1 || bulkMode === 'single') {
      for (const internId of selectedInternIds) {
        const darData = await fetchDarData(internId, startDate, endDate);
        const internWeekNum = calculateInternWeekNumber(darData.intern?.ojt_start_date, startDate);
        const doc = await generateDarPdf(darData, internWeekNum, startDate);
        const fileName = `DAR_${darData.intern?.full_name?.replace(/\s+/g, '_') || 'intern'}_Week${internWeekNum}.pdf`;
        doc.save(fileName);
      }
      await logAudit('report.export_pdf', 'report', null, {
        report_type: 'dar',
        format: 'pdf',
        mode: selectedInternIds.length === 1 ? 'single' : 'multiple_single',
        intern_count: selectedInternIds.length,
        week: weekNum,
        date_from: startDate,
        date_to: endDate,
      });
      showToast(`${selectedInternIds.length} DAR PDF(s) generated`, 'success');

    } else if (bulkMode === 'zip') {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (const internId of selectedInternIds) {
        const darData = await fetchDarData(internId, startDate, endDate);
        const internWeekNum = calculateInternWeekNumber(darData.intern?.ojt_start_date, startDate);
        const doc = await generateDarPdf(darData, internWeekNum, startDate);
        const fileName = `DAR_${darData.intern?.full_name?.replace(/\s+/g, '_') || 'intern'}_Week${internWeekNum}.pdf`;
        const pdfBlob = doc.output('blob');
        zip.file(fileName, pdfBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DAR_${formatDateKey(startDate)}_to_${formatDateKey(endDate)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      await logAudit('report.export_pdf', 'report', null, {
        report_type: 'dar',
        format: 'zip',
        mode: 'zip',
        intern_count: selectedInternIds.length,
        week: weekNum,
        date_from: startDate,
        date_to: endDate,
      });
      showToast('DAR ZIP downloaded', 'success');

    } else if (bulkMode === 'combined') {
      let doc = null;

      for (let i = 0; i < selectedInternIds.length; i++) {
        const darData = await fetchDarData(selectedInternIds[i], startDate, endDate);
        const internWeekNum = calculateInternWeekNumber(darData.intern?.ojt_start_date, startDate);
        if (i === 0) {
          doc = await generateDarPdf(darData, internWeekNum, startDate);
        } else {
          doc.addPage('a4', 'portrait');
          await generateDarPdf(darData, internWeekNum, startDate, doc);
        }
      }

      if (doc) {
        doc.save(`DAR_Combined_${formatDateKey(startDate)}_to_${formatDateKey(endDate)}.pdf`);
        await logAudit('report.export_pdf', 'report', null, {
          report_type: 'dar',
          format: 'pdf',
          mode: 'combined',
          intern_count: selectedInternIds.length,
          week: weekNum,
          date_from: startDate,
          date_to: endDate,
        });
        showToast('Combined DAR PDF generated', 'success');
      }
    }
  } catch (err) {
    console.error('DAR generation error:', err);
    showToast('Failed to generate DAR', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icons.filter}<span class="ml-2">Generate Report</span>`;
  }
}

// ─── Standard report data fetching ──────────────────────────────────────────

async function fetchReportData(type, dateFrom, dateTo, locationId, departmentId) {
  switch (type) {
    case 'attendance': {
      const { data } = await supabase
        .from('attendance_records')
        .select('*, intern:profiles!attendance_records_intern_id_fkey(id, full_name, location_id, department_id, locations(name), departments(name))')
        .gte('date', dateFrom)
        .lte('date', dateTo)
        .order('date', { ascending: false });
      let records = data || [];
      if (locationId) records = records.filter(r => r.intern?.location_id === locationId);
      if (departmentId) records = records.filter(r => r.intern?.department_id === departmentId);
      return records;
    }

    case 'hours': {
      const { data } = await supabase
        .from('attendance_records')
        .select('date, total_hours, intern:profiles!attendance_records_intern_id_fkey(id, full_name, location_id, department_id, locations(name), departments(name))')
        .eq('status', 'approved')
        .gte('date', dateFrom)
        .lte('date', dateTo);
      let records = data || [];
      if (locationId) records = records.filter(r => r.intern?.location_id === locationId);
      if (departmentId) records = records.filter(r => r.intern?.department_id === departmentId);

      // Group by intern
      const grouped = {};
      records.forEach(r => {
        const id = r.intern?.id || r.intern?.full_name || 'unknown';
        if (!grouped[id]) {
          grouped[id] = {
            name: r.intern?.full_name || 'Unknown',
            department: r.intern?.departments?.name || '—',
            location: r.intern?.locations?.name || '—',
            hours: 0,
            days: 0,
          };
        }
        grouped[id].hours += r.total_hours || 0;
        grouped[id].days += 1;
      });
      return Object.values(grouped);
    }

    case 'tasks': {
      const { data } = await supabase
        .from('tasks')
        .select('id, title, status, priority, due_date, created_at, assignee:profiles!tasks_assigned_to_fkey(full_name, department_id, departments(name))')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59');
      let tasks = data || [];
      if (departmentId) tasks = tasks.filter(t => t.assignee?.department_id === departmentId);
      return tasks;
    }

    case 'allowance': {
      const { data } = await supabase
        .from('allowance_periods')
        .select('*, intern:profiles!allowance_periods_intern_id_fkey(full_name, department_id, departments(name))')
        .gte('week_start', dateFrom)
        .lte('week_end', dateTo)
        .eq('status', 'approved')
        .order('week_start', { ascending: false });
      let records = data || [];
      if (departmentId) records = records.filter(p => p.intern?.department_id === departmentId);
      return records;
    }

    default:
      return [];
  }
}

// ─── Chart rendering ─────────────────────────────────────────────────────────

async function renderChart(el, type, data) {
  const { Chart, registerables } = await import('chart.js');
  Chart.register(...registerables);

  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const canvasWrap = el.querySelector('#chart-canvas-wrap');
  const statsEl = el.querySelector('#chart-stats');

  let config;

  switch (type) {
    case 'attendance': {
      const counts = { pending: 0, approved: 0, rejected: 0 };
      data.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
      const total = data.length;

      // Constrain doughnut
      canvasWrap.style.width = '260px';
      canvasWrap.style.height = '260px';

      statsEl.innerHTML = `
        <div>
          <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Summary</p>
          <div class="space-y-3">
            ${statTile('Total Records', total, '#4f46e5')}
            ${statTile('Approved', counts.approved, '#10b981')}
            ${statTile('Pending', counts.pending, '#f59e0b')}
            ${statTile('Rejected', counts.rejected, '#ef4444')}
          </div>
        </div>`;

      config = {
        type: 'doughnut',
        data: {
          labels: ['Pending', 'Approved', 'Rejected'],
          datasets: [{ data: [counts.pending, counts.approved, counts.rejected], backgroundColor: ['#f59e0b', '#10b981', '#ef4444'], borderWidth: 2 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Attendance Status Distribution', font: { size: 13 } },
          },
        },
      };
      break;
    }

    case 'hours': {
      canvasWrap.style.width = '100%';
      canvasWrap.style.height = '320px';
      statsEl.innerHTML = '';

      const totalHrs = data.reduce((s, d) => s + d.hours, 0);
      const totalDays = data.reduce((s, d) => s + d.days, 0);

      statsEl.innerHTML = `
        <div>
          <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Summary</p>
          <div class="space-y-3">
            ${statTile('Total Interns', data.length, '#4f46e5')}
            ${statTile('Total Hours', totalHrs.toFixed(1) + ' hrs', '#10b981')}
            ${statTile('Total Days', totalDays + ' days', '#f59e0b')}
          </div>
        </div>`;
      canvasWrap.style.width = 'auto';
      canvasWrap.style.flex = '1';

      config = {
        type: 'bar',
        data: {
          labels: data.map(d => d.name),
          datasets: [{ label: 'Total Hours', data: data.map(d => +d.hours.toFixed(2)), backgroundColor: '#4f46e5', borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { title: { display: true, text: 'Hours Logged per Intern', font: { size: 13 } }, legend: { display: false } },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'Hours' } } },
        },
      };
      break;
    }

    case 'tasks': {
      const counts = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
      data.forEach(t => { if (t.status in counts) counts[t.status]++; });
      const total = data.length;

      canvasWrap.style.width = '260px';
      canvasWrap.style.height = '260px';

      statsEl.innerHTML = `
        <div>
          <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Summary</p>
          <div class="space-y-3">
            ${statTile('Total Tasks', total, '#4f46e5')}
            ${statTile('Not Started', counts.not_started, '#6b7280')}
            ${statTile('In Progress', counts.in_progress, '#3b82f6')}
            ${statTile('Completed', counts.completed, '#10b981')}
            ${statTile('Blocked', counts.blocked, '#ef4444')}
          </div>
        </div>`;

      config = {
        type: 'doughnut',
        data: {
          labels: ['Not Started', 'In Progress', 'Completed', 'Blocked'],
          datasets: [{ data: [counts.not_started, counts.in_progress, counts.completed, counts.blocked], backgroundColor: ['#6b7280', '#3b82f6', '#10b981', '#ef4444'], borderWidth: 2 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: { position: 'bottom' },
            title: { display: true, text: 'Task Status Breakdown', font: { size: 13 } },
          },
        },
      };
      break;
    }

    case 'allowance': {
      const byIntern = {};
      data.forEach(p => {
        const name = p.intern?.full_name || 'Unknown';
        byIntern[name] = (byIntern[name] || 0) + (p.total_amount || 0);
      });
      const grandTotal = Object.values(byIntern).reduce((s, v) => s + v, 0);

      statsEl.innerHTML = `
        <div>
          <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-3">Summary</p>
          <div class="space-y-3">
            ${statTile('Total Periods', data.length, '#4f46e5')}
            ${statTile('Total Interns', Object.keys(byIntern).length, '#3b82f6')}
            ${statTile('Grand Total', '₱' + grandTotal.toFixed(2), '#10b981')}
          </div>
        </div>`;
      canvasWrap.style.width = 'auto';
      canvasWrap.style.flex = '1';

      config = {
        type: 'bar',
        data: {
          labels: Object.keys(byIntern),
          datasets: [{ label: 'Total Allowance (₱)', data: Object.values(byIntern).map(v => +v.toFixed(2)), backgroundColor: '#10b981', borderRadius: 4 }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { title: { display: true, text: 'Total Allowance per Intern', font: { size: 13 } }, legend: { display: false } },
          scales: { y: { beginAtZero: true, title: { display: true, text: 'Amount (₱)' } } },
        },
      };
      break;
    }
  }

  // Set explicit height on canvas for bar charts
  const canvas = el.querySelector('#report-chart');
  if (type === 'hours' || type === 'allowance') {
    canvas.style.height = '300px';
  } else {
    canvas.style.height = '';
  }

  chartInstance = new Chart(canvas, config);
}

function statTile(label, value, color) {
  return `
    <div class="flex items-center justify-between py-2 px-3 bg-neutral-50 rounded-lg border border-neutral-100">
      <span class="text-sm text-neutral-600">${label}</span>
      <span class="text-sm font-semibold" style="color:${color}">${value}</span>
    </div>`;
}

// ─── Table rendering ─────────────────────────────────────────────────────────

function renderTable(el, type, data) {
  const container = el.querySelector('#report-table-container');
  const titleEl = el.querySelector('#table-title');
  const countEl = el.querySelector('#table-count');

  const labels = {
    attendance: 'Attendance Records',
    hours: 'Hours Logged by Intern',
    tasks: 'Task Details',
    allowance: 'Approved Allowance Periods',
  };
  titleEl.textContent = labels[type] || 'Results';

  const statusBadge = (status) => {
    const map = {
      approved: 'badge-success',
      rejected: 'badge-danger',
      pending: 'badge-pending',
      completed: 'badge-success',
      in_progress: 'badge-info',
      not_started: 'badge-secondary',
      blocked: 'badge-danger',
    };
    const cls = map[status] || 'badge-secondary';
    return `<span class="${cls}">${status.replace(/_/g, ' ')}</span>`;
  };

  switch (type) {
    case 'attendance': {
      countEl.textContent = `${data.length} records`;
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Intern</th>
              <th>Department</th>
              <th>Location</th>
              <th>Date</th>
              <th>AM In</th>
              <th>AM Out</th>
              <th>PM In</th>
              <th>PM Out</th>
              <th>Total Hours</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? '<tr><td colspan="10" class="text-center text-neutral-400 py-8">No records found</td></tr>' :
              data.map(r => `<tr>
                <td class="font-medium">${r.intern?.full_name || '—'}</td>
                <td>${r.intern?.departments?.name || '—'}</td>
                <td>${r.intern?.locations?.name || '—'}</td>
                <td>${formatDate(r.date)}</td>
                <td>${r.time_in_1 ? formatTime(r.time_in_1) : '—'}</td>
                <td>${r.time_out_1 ? formatTime(r.time_out_1) : '—'}</td>
                <td>${r.time_in_2 ? formatTime(r.time_in_2) : '—'}</td>
                <td>${r.time_out_2 ? formatTime(r.time_out_2) : '—'}</td>
                <td>${formatHoursDisplay(r.total_hours)}</td>
                <td>${statusBadge(r.status)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      break;
    }

    case 'hours': {
      const totalHrs = data.reduce((s, d) => s + d.hours, 0);
      countEl.textContent = `${data.length} intern${data.length !== 1 ? 's' : ''}`;
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Intern</th>
              <th>Department</th>
              <th>Location</th>
              <th>Days Attended</th>
              <th>Total Hours</th>
              <th>Avg Hours / Day</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? '<tr><td colspan="6" class="text-center text-neutral-400 py-8">No records found</td></tr>' :
              data.map(d => `<tr>
                <td class="font-medium">${d.name}</td>
                <td>${d.department}</td>
                <td>${d.location}</td>
                <td>${d.days}</td>
                <td class="font-semibold">${formatHoursDisplay(d.hours)}</td>
                <td>${d.days > 0 ? formatHoursDisplay(d.hours / d.days) : '—'}</td>
              </tr>`).join('')}
          </tbody>
          ${data.length > 0 ? `
          <tfoot>
            <tr class="font-semibold bg-neutral-50">
              <td colspan="3">Total</td>
              <td>${data.reduce((s, d) => s + d.days, 0)}</td>
              <td>${formatHoursDisplay(totalHrs)}</td>
              <td>—</td>
            </tr>
          </tfoot>` : ''}
        </table>`;
      break;
    }

    case 'tasks': {
      countEl.textContent = `${data.length} task${data.length !== 1 ? 's' : ''}`;
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Task Title</th>
              <th>Assigned To</th>
              <th>Department</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Due Date</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? '<tr><td colspan="7" class="text-center text-neutral-400 py-8">No tasks found</td></tr>' :
              data.map(t => `<tr>
                <td class="font-medium">${t.title || '—'}</td>
                <td>${t.assignee?.full_name || '—'}</td>
                <td>${t.assignee?.departments?.name || '—'}</td>
                <td>${statusBadge(t.status)}</td>
                <td>${t.priority ? `<span class="badge-secondary capitalize">${t.priority}</span>` : '—'}</td>
                <td>${t.due_date ? formatDate(t.due_date) : '—'}</td>
                <td>${formatDate(t.created_at?.slice(0, 10))}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
      break;
    }

    case 'allowance': {
      const grandTotal = data.reduce((s, p) => s + (p.total_amount || 0), 0);
      countEl.textContent = `${data.length} period${data.length !== 1 ? 's' : ''}`;
      container.innerHTML = `
        <table class="data-table">
          <thead>
            <tr>
              <th>Intern</th>
              <th>Department</th>
              <th>Week Start</th>
              <th>Week End</th>
              <th>Hours</th>
              <th>Rate (₱/hr)</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${data.length === 0 ? '<tr><td colspan="8" class="text-center text-neutral-400 py-8">No records found</td></tr>' :
              data.map(p => `<tr>
                <td class="font-medium">${p.intern?.full_name || '—'}</td>
                <td>${p.intern?.departments?.name || '—'}</td>
                <td>${formatDate(p.week_start)}</td>
                <td>${formatDate(p.week_end)}</td>
                <td>${formatHoursDisplay(p.total_hours)}</td>
                <td>₱${p.hourly_rate?.toFixed(2) ?? '—'}</td>
                <td class="font-semibold">₱${p.total_amount?.toFixed(2) ?? '—'}</td>
                <td>${statusBadge(p.status)}</td>
              </tr>`).join('')}
          </tbody>
          ${data.length > 0 ? `
          <tfoot>
            <tr class="font-semibold bg-neutral-50">
              <td colspan="6">Grand Total</td>
              <td>₱${grandTotal.toFixed(2)}</td>
              <td></td>
            </tr>
          </tfoot>` : ''}
        </table>`;
      break;
    }
  }
}

// ─── XLSX export ─────────────────────────────────────────────────────────────

async function exportXlsx(data, type) {
  try {
    const XLSX = await import('xlsx');
    let rows;

    switch (type) {
      case 'attendance':
        rows = data.map(r => ({
          Intern: r.intern?.full_name || '',
          Department: r.intern?.departments?.name || '',
          Location: r.intern?.locations?.name || '',
          Date: r.date,
          'AM In': r.time_in_1 ? formatTime(r.time_in_1) : '',
          'AM Out': r.time_out_1 ? formatTime(r.time_out_1) : '',
          'PM In': r.time_in_2 ? formatTime(r.time_in_2) : '',
          'PM Out': r.time_out_2 ? formatTime(r.time_out_2) : '',
          'Total Hours': r.total_hours || 0,
          Status: r.status,
        }));
        break;

      case 'hours':
        rows = data.map(d => ({
          Intern: d.name,
          Department: d.department,
          Location: d.location,
          'Days Attended': d.days,
          'Total Hours': +d.hours.toFixed(2),
          'Avg Hours / Day': d.days > 0 ? +(d.hours / d.days).toFixed(2) : 0,
        }));
        break;

      case 'tasks':
        rows = data.map(t => ({
          'Task Title': t.title || '',
          'Assigned To': t.assignee?.full_name || '',
          Department: t.assignee?.departments?.name || '',
          Status: t.status,
          Priority: t.priority || '',
          'Due Date': t.due_date || '',
          'Created': t.created_at?.slice(0, 10) || '',
        }));
        break;

      case 'allowance':
        rows = data.map(p => ({
          Intern: p.intern?.full_name || '',
          Department: p.intern?.departments?.name || '',
          'Week Start': p.week_start,
          'Week End': p.week_end,
          Hours: p.total_hours || 0,
          'Rate (₱/hr)': p.hourly_rate || 0,
          Amount: p.total_amount || 0,
          Status: p.status,
        }));
        break;

      default:
        rows = [];
    }

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    XLSX.writeFile(wb, `report_${type}_${getTodayDate()}.xlsx`);
    await logAudit('report.export_xlsx', 'report', null, {
      report_type: type,
      row_count: rows.length,
    });
    showToast('XLSX exported successfully', 'success');
  } catch (err) {
    console.error('XLSX export error:', err);
    showToast('Failed to export XLSX', 'error');
  }
}

// ─── PDF export ──────────────────────────────────────────────────────────────

async function exportPdf(data, type, dateFrom, dateTo) {
  try {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();   // 297
    const pageHeight = doc.internal.pageSize.getHeight(); // 210
    const margin = 14;

    const reportTitles = {
      attendance: 'Attendance Summary Report',
      hours: 'Hours Logged Report',
      tasks: 'Task Status Report',
      allowance: 'Allowance Summary Report',
    };
    const reportTitle = reportTitles[type] || 'Report';
    const dateRangeStr = `${formatDate(dateFrom)} – ${formatDate(dateTo)}`;

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.setFillColor(41, 65, 148);
    doc.rect(0, 0, pageWidth, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont(undefined, 'bold');
    doc.text('M88 INTERNS PRODUCTIVITY TRACKER', pageWidth / 2, 10, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(reportTitle, pageWidth / 2, 18, { align: 'center' });

    // ── Sub-header ──────────────────────────────────────────────────────────
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.text(`Date Range: ${dateRangeStr}`, margin, 31);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth - margin, 31, { align: 'right' });

    doc.setDrawColor(41, 65, 148);
    doc.setLineWidth(0.4);
    doc.line(margin, 34, pageWidth - margin, 34);

    // ── Build table head/body ───────────────────────────────────────────────
    let head, body, foot;

    switch (type) {
      case 'attendance':
        head = [['Intern', 'Department', 'Location', 'Date', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Total Hours', 'Status']];
        body = data.map(r => [
          r.intern?.full_name || '—',
          r.intern?.departments?.name || '—',
          r.intern?.locations?.name || '—',
          r.date || '—',
          r.time_in_1 ? formatTime(r.time_in_1) : '—',
          r.time_out_1 ? formatTime(r.time_out_1) : '—',
          r.time_in_2 ? formatTime(r.time_in_2) : '—',
          r.time_out_2 ? formatTime(r.time_out_2) : '—',
          r.total_hours != null ? r.total_hours.toFixed(2) : '—',
          r.status || '—',
        ]);
        break;

      case 'hours': {
        const totalHrs = data.reduce((s, d) => s + d.hours, 0);
        const totalDays = data.reduce((s, d) => s + d.days, 0);
        head = [['Intern', 'Department', 'Location', 'Days Attended', 'Total Hours', 'Avg Hours / Day']];
        body = data.map(d => [
          d.name,
          d.department,
          d.location,
          d.days,
          d.hours.toFixed(2),
          d.days > 0 ? (d.hours / d.days).toFixed(2) : '—',
        ]);
        foot = [['TOTAL', '', '', totalDays, totalHrs.toFixed(2), '']];
        break;
      }

      case 'tasks':
        head = [['Task Title', 'Assigned To', 'Department', 'Status', 'Priority', 'Due Date', 'Created']];
        body = data.map(t => [
          t.title || '—',
          t.assignee?.full_name || '—',
          t.assignee?.departments?.name || '—',
          t.status?.replace(/_/g, ' ') || '—',
          t.priority || '—',
          t.due_date ? formatDate(t.due_date) : '—',
          t.created_at ? formatDate(t.created_at.slice(0, 10)) : '—',
        ]);
        break;

      case 'allowance': {
        const grandTotal = data.reduce((s, p) => s + (p.total_amount || 0), 0);
        head = [['Intern', 'Department', 'Week Start', 'Week End', 'Hours', 'Rate (₱/hr)', 'Amount', 'Status']];
        body = data.map(p => [
          p.intern?.full_name || '—',
          p.intern?.departments?.name || '—',
          p.week_start || '—',
          p.week_end || '—',
          p.total_hours != null ? p.total_hours.toFixed(2) : '—',
          p.hourly_rate != null ? `₱${p.hourly_rate.toFixed(2)}` : '—',
          p.total_amount != null ? `₱${p.total_amount.toFixed(2)}` : '—',
          p.status || '—',
        ]);
        foot = [['GRAND TOTAL', '', '', '', '', '', `₱${grandTotal.toFixed(2)}`, '']];
        break;
      }

      default:
        head = [['No Data']];
        body = [['No data available']];
    }

    // ── Render table ────────────────────────────────────────────────────────
    autoTable(doc, {
      head,
      body,
      foot: foot || undefined,
      startY: 37,
      margin: { left: margin, right: margin },
      theme: 'striped',
      styles: {
        fontSize: 8,
        cellPadding: 2.5,
        valign: 'middle',
        textColor: [30, 30, 30],
        lineWidth: 0.1,
        lineColor: [210, 210, 210],
      },
      headStyles: {
        fillColor: [41, 65, 148],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8.5,
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [245, 247, 255],
      },
      footStyles: {
        fillColor: [235, 238, 255],
        textColor: [30, 30, 30],
        fontStyle: 'bold',
        fontSize: 8.5,
      },
      didDrawPage: (hookData) => {
        // Page number footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(
          `Page ${hookData.pageNumber} of ${doc.internal.getNumberOfPages()}`,
          pageWidth / 2, pageHeight - 5, { align: 'center' }
        );
      },
    });

    // ── Summary block for tasks (aggregate counts) ──────────────────────────
    if (type === 'tasks' && data.length > 0) {
      const counts = { not_started: 0, in_progress: 0, completed: 0, blocked: 0 };
      data.forEach(t => { if (t.status in counts) counts[t.status]++; });

      const summaryY = doc.lastAutoTable.finalY + 8;
      if (summaryY < pageHeight - 30) {
        doc.setFontSize(9);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(41, 65, 148);
        doc.text('Status Summary:', margin, summaryY);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(60, 60, 60);
        doc.text(
          `Not Started: ${counts.not_started}   In Progress: ${counts.in_progress}   Completed: ${counts.completed}   Blocked: ${counts.blocked}   Total: ${data.length}`,
          margin + 30, summaryY
        );
      }
    }

    doc.save(`report_${type}_${getTodayDate()}.pdf`);
    await logAudit('report.export_pdf', 'report', null, {
      report_type: type,
      row_count: data.length,
      date_from: dateFrom,
      date_to: dateTo,
    });
    showToast('PDF exported successfully', 'success');
  } catch (err) {
    console.error('PDF export error:', err);
    showToast('Failed to export PDF', 'error');
  }
}
