/**
 * Reports Page (HR/Admin)
 * Generate and export attendance, task, allowance reports with charts.
 * Includes Daily Activity Report (DAR) PDF generation.
 */
import { getProfile, getUserRole } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatTime, formatHoursDisplay, getMonday, getFriday } from '../lib/utils.js';

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
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Reports</h1>
      <p class="page-subtitle">Generate and export reports</p>
    </div>

    <!-- Report Type Selection -->
    <div class="card mb-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4" id="standard-filters">
        <div>
          <label class="form-label">Report Type</label>
          <select id="report-type" class="form-input">
            <option value="attendance">Attendance Summary</option>
            <option value="hours">Hours Logged</option>
            <option value="tasks">Task Status</option>
            <option value="allowance">Allowance Summary</option>
            <option value="dar">Daily Activity Report</option>
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
      </div>

      <!-- DAR-specific controls -->
      <div id="dar-controls" class="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4" style="display:none;">
        <div>
          <label class="form-label">Intern(s)</label>
          <select id="dar-intern" class="form-input" multiple size="5">
          </select>
          <p class="text-xs text-neutral-400 mt-1">Hold Ctrl/Cmd to select multiple</p>
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

    // Toggle DAR controls visibility
    el.querySelector('#report-type').addEventListener('change', (e) => {
      const isDar = e.target.value === 'dar';
      el.querySelector('#dar-controls').style.display = isDar ? '' : 'none';
      el.querySelector('#date-from-group').style.display = isDar ? 'none' : '';
      el.querySelector('#date-to-group').style.display = isDar ? 'none' : '';
      el.querySelector('#location-group').style.display = isDar ? 'none' : '';
      el.querySelector('#export-xlsx-btn').style.display = isDar ? 'none' : '';
      el.querySelector('#export-pdf-btn').style.display = isDar ? 'none' : '';
      el.querySelector('#chart-section').style.display = 'none';
      el.querySelector('#table-section').style.display = 'none';

      if (isDar) {
        populateDarInterns(el);
      }
    });

    el.querySelector('#generate-btn').addEventListener('click', async () => {
      const type = el.querySelector('#report-type').value;

      // DAR branch
      if (type === 'dar') {
        await handleDarGeneration(el);
        return;
      }

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

// ─── DAR: Populate intern multi-select ──────────────────────────────────────

async function populateDarInterns(el) {
  const { data: interns } = await supabase
    .from('profiles')
    .select('id, full_name, department_id, course, school, ojt_start_date, supervisor_id, signature_url')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  const select = el.querySelector('#dar-intern');
  select.innerHTML = (interns || []).map(i =>
    `<option value="${i.id}">${i.full_name}</option>`
  ).join('');

  // Store interns data for later use
  select._internsData = interns || [];

  // Remove existing listener if any, then add new one
  const handler = () => populateDarWeeks(el);
  select.removeEventListener('change', select._weekHandler);
  select._weekHandler = handler;
  select.addEventListener('change', handler);
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
  const internSelect = el.querySelector('#dar-intern');
  const selectedIds = Array.from(internSelect.selectedOptions).map(o => o.value);

  if (selectedIds.length === 0) {
    el.querySelector('#dar-week').innerHTML = '<option value="">Select an intern first</option>';
    return;
  }

  const firstInternId = selectedIds[0];
  const intern = internSelect._internsData.find(i => i.id === firstInternId);

  const { data: records } = await supabase
    .from('attendance_records')
    .select('date')
    .eq('intern_id', firstInternId)
    .order('date', { ascending: true });

  if (!records || records.length === 0) {
    el.querySelector('#dar-week').innerHTML = '<option value="">No attendance records found</option>';
    return;
  }

  // Group dates into Mon-Fri weeks
  const weeks = new Map();
  const ojtStart = intern?.ojt_start_date ? new Date(intern.ojt_start_date + 'T00:00:00') : null;

  records.forEach(r => {
    const date = new Date(r.date + 'T00:00:00');
    const monday = getMonday(date);
    const friday = getFriday(date);
    const key = toLocalDateStr(monday);

    if (!weeks.has(key)) {
      let weekNum = 1;
      if (ojtStart) {
        const ojtMonday = getMonday(ojtStart);
        const diffMs = monday - ojtMonday;
        weekNum = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
        if (weekNum < 1) weekNum = 1;
      }
      weeks.set(key, {
        monday: key,
        friday: toLocalDateStr(friday),
        weekNum,
      });
    }
  });

  const weekSelect = el.querySelector('#dar-week');
  const weeksArr = Array.from(weeks.values()).sort((a, b) => b.monday.localeCompare(a.monday));
  weekSelect.innerHTML = weeksArr.map(w =>
    `<option value="${w.monday}|${w.friday}|${w.weekNum}">Week ${w.weekNum} (${formatDateMMDDYYYY(w.monday)} – ${formatDateMMDDYYYY(w.friday)})</option>`
  ).join('');
}

// ─── DAR: Fetch all data for one intern's weekly report ─────────────────────

async function fetchDarData(internId, mondayDate, fridayDate) {
  const [
    { data: intern },
    { data: attendance },
    { data: narratives },
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
      .gte('date', mondayDate)
      .lte('date', fridayDate)
      .order('date', { ascending: true }),
    supabase
      .from('narratives')
      .select('*, task:tasks(title)')
      .eq('intern_id', internId)
      .gte('date', mondayDate)
      .lte('date', fridayDate)
      .order('date', { ascending: true }),
    supabase
      .from('allowance_periods')
      .select('total_amount, total_hours, hourly_rate, status')
      .eq('intern_id', internId)
      .eq('week_start', mondayDate)
      .maybeSingle(),
    supabase
      .from('allowance_config')
      .select('hourly_rate')
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Fetch supervisor profile for signature
  let supervisor = null;
  if (intern?.supervisor_id) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, signature_url')
      .eq('id', intern.supervisor_id)
      .single();
    supervisor = data;
  }

  return {
    intern,
    attendance: attendance || [],
    narratives: narratives || [],
    supervisor,
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

function calcSessionHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const ms = new Date(timeOut) - new Date(timeIn);
  return Math.max(0, ms / (1000 * 60 * 60));
}

// ─── DAR: PDF generation ────────────────────────────────────────────────────

async function generateDarPdf(darData, weekNum, mondayDate, existingDoc) {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const { intern, attendance, narratives, supervisor, allowancePeriod, hourlyRate } = darData;

  const doc = existingDoc || new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();  // 210
  const margin = 10;

  // Pre-load images
  const logoDataUrl = await loadImageAsDataUrl('/logo.png');

  let internSigDataUrl = null;
  if (intern?.signature_url) {
    const sigUrl = supabase.storage.from('signatures').getPublicUrl(intern.signature_url).data.publicUrl;
    internSigDataUrl = await loadImageAsDataUrl(sigUrl);
  }

  let supervisorSigDataUrl = null;
  if (supervisor?.signature_url) {
    const sigUrl = supabase.storage.from('signatures').getPublicUrl(supervisor.signature_url).data.publicUrl;
    supervisorSigDataUrl = await loadImageAsDataUrl(sigUrl);
  }

  // Logo at top left
  let y = margin;
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, 'PNG', margin, y, 65, 13);
  }
  y += 17;

  // Title centered below logo
  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text('DAILY ACTIVITY REPORT — INTERNSHIP', pageWidth / 2, y, { align: 'center' });
  y += 8;

  // Info fields — fixed column positions so labels and values align
  doc.setFontSize(11);
  const departmentName = intern?.departments?.name || '—';
  const courseName = intern?.course || '—';

  const leftLabelX = margin;
  const leftValueX = margin + 36;
  const rightLabelX = pageWidth / 2 + 5;
  const rightValueX = pageWidth / 2 + 32;

  // Row 1: NAME (left) | COURSE (right)
  doc.setFont(undefined, 'bold');
  doc.text('NAME', leftLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(intern?.full_name || '—', leftValueX, y);

  doc.setFont(undefined, 'bold');
  doc.text('COURSE', rightLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(courseName, rightValueX, y);

  y += 5.5;

  // Row 2: DEPARTMENT (left) | WEEK (right)
  doc.setFont(undefined, 'bold');
  doc.text('DEPARTMENT', leftLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(departmentName, leftValueX, y);

  doc.setFont(undefined, 'bold');
  doc.text('WEEK', rightLabelX, y);
  doc.setFont(undefined, 'normal');
  doc.text(String(weekNum), rightValueX, y);

  y += 6;

  // Build 5 weekdays (Mon-Fri) using local date strings
  const monday = new Date(mondayDate + 'T00:00:00');
  const weekdays = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    weekdays.push(toLocalDateStr(d));
  }

  // Build table body (10 rows: 2 per day)
  const tableBody = [];
  let totalHours = 0;
  const signatureCells = [];

  weekdays.forEach((dateStr, dayIdx) => {
    const att = attendance.find(a => a.date === dateStr);
    const morningNarr = narratives.find(n => n.date === dateStr && n.session === 'morning');
    const afternoonNarr = narratives.find(n => n.date === dateStr && n.session === 'afternoon');
    const isApproved = att?.status === 'approved';

    // Morning row
    const mHours = calcSessionHours(att?.time_in_1, att?.time_out_1);
    const mTask = morningNarr?.task?.title || '';
    const mContent = stripHtml(morningNarr?.content);
    let mAccomplished = mTask ? `${mTask}${mContent ? ': ' + mContent : ''}` : mContent;
    if (mAccomplished.length > 200) mAccomplished = mAccomplished.slice(0, 200) + '...';

    tableBody.push([
      formatDateMMDDYYYY(dateStr),
      att?.time_in_1 ? formatTime(att.time_in_1) : '',
      att?.time_out_1 ? formatTime(att.time_out_1) : '',
      mAccomplished,
      mHours > 0 ? mHours.toFixed(2) : '',
      '',
      '',
    ]);

    const mRowIdx = dayIdx * 2;
    if (isApproved && internSigDataUrl) {
      signatureCells.push({ row: mRowIdx, col: 5, dataUrl: internSigDataUrl });
    }
    if (isApproved && supervisorSigDataUrl) {
      signatureCells.push({ row: mRowIdx, col: 6, dataUrl: supervisorSigDataUrl });
    }

    // Afternoon row
    const aHours = calcSessionHours(att?.time_in_2, att?.time_out_2);
    const aTask = afternoonNarr?.task?.title || '';
    const aContent = stripHtml(afternoonNarr?.content);
    let aAccomplished = aTask ? `${aTask}${aContent ? ': ' + aContent : ''}` : aContent;
    if (aAccomplished.length > 200) aAccomplished = aAccomplished.slice(0, 200) + '...';

    tableBody.push([
      formatDateMMDDYYYY(dateStr),
      att?.time_in_2 ? formatTime(att.time_in_2) : '',
      att?.time_out_2 ? formatTime(att.time_out_2) : '',
      aAccomplished,
      aHours > 0 ? aHours.toFixed(2) : '',
      '',
      '',
    ]);

    const aRowIdx = dayIdx * 2 + 1;
    if (isApproved && internSigDataUrl) {
      signatureCells.push({ row: aRowIdx, col: 5, dataUrl: internSigDataUrl });
    }
    if (isApproved && supervisorSigDataUrl) {
      signatureCells.push({ row: aRowIdx, col: 6, dataUrl: supervisorSigDataUrl });
    }

    totalHours += mHours + aHours;
  });

  // Calculate row height to fill the entire page
  const pageHeight = doc.internal.pageSize.getHeight();
  const approxHeaderRowH = 14;
  const footerSpace = 18;
  const bodyRowH = (pageHeight - y - margin - footerSpace - approxHeaderRowH) / 10;

  // Render table
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

  // Footer: total hours + total allowance on the same line
  const finalY = doc.lastAutoTable.finalY + 6;
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  doc.text(`TOTAL NUMBER OF HOURS: ${totalHours.toFixed(2)} hours`, margin, finalY);

  const appliedHourlyRate = allowancePeriod?.hourly_rate ?? hourlyRate ?? 0;
  const computedAllowance = totalHours * appliedHourlyRate;
  const allowanceTotal = Number.isFinite(allowancePeriod?.total_amount)
    ? allowancePeriod.total_amount
    : (Number.isFinite(computedAllowance) ? computedAllowance : 0);
  doc.text(`TOTAL ALLOWANCE FOR THIS WEEK: ${allowanceTotal.toFixed(2)}`, pageWidth - margin, finalY, { align: 'right' });

  return doc;
}

// ─── DAR: Generation handler ────────────────────────────────────────────────

async function handleDarGeneration(el) {
  const internSelect = el.querySelector('#dar-intern');
  const weekSelect = el.querySelector('#dar-week');
  const bulkMode = el.querySelector('#dar-bulk-mode').value;

  const selectedInternIds = Array.from(internSelect.selectedOptions).map(o => o.value);
  const weekValue = weekSelect.value;

  if (selectedInternIds.length === 0) {
    showToast('Please select at least one intern', 'error');
    return;
  }
  if (!weekValue) {
    showToast('Please select a week', 'error');
    return;
  }

  const [mondayDate, fridayDate, weekNumStr] = weekValue.split('|');
  const weekNum = parseInt(weekNumStr, 10);

  const btn = el.querySelector('#generate-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Generating DAR...';

  try {
    if (selectedInternIds.length === 1 || bulkMode === 'single') {
      // Individual PDFs — download each one
      for (const internId of selectedInternIds) {
        const darData = await fetchDarData(internId, mondayDate, fridayDate);
        const doc = await generateDarPdf(darData, weekNum, mondayDate);
        const fileName = `DAR_${darData.intern?.full_name?.replace(/\s+/g, '_') || 'intern'}_Week${weekNum}.pdf`;
        doc.save(fileName);
      }
      showToast(`${selectedInternIds.length} DAR PDF(s) generated`, 'success');

    } else if (bulkMode === 'zip') {
      // Individual PDFs packaged in a ZIP
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      for (const internId of selectedInternIds) {
        const darData = await fetchDarData(internId, mondayDate, fridayDate);
        const doc = await generateDarPdf(darData, weekNum, mondayDate);
        const fileName = `DAR_${darData.intern?.full_name?.replace(/\s+/g, '_') || 'intern'}_Week${weekNum}.pdf`;
        const pdfBlob = doc.output('blob');
        zip.file(fileName, pdfBlob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `DAR_Week${weekNum}_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('DAR ZIP downloaded', 'success');

    } else if (bulkMode === 'combined') {
      // All interns in one PDF, each on a new page
      let doc = null;

      for (let i = 0; i < selectedInternIds.length; i++) {
        const darData = await fetchDarData(selectedInternIds[i], mondayDate, fridayDate);
        if (i === 0) {
          doc = await generateDarPdf(darData, weekNum, mondayDate);
        } else {
          doc.addPage('a4', 'portrait');
          await generateDarPdf(darData, weekNum, mondayDate, doc);
        }
      }

      if (doc) {
        doc.save(`DAR_Combined_Week${weekNum}_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('Combined DAR PDF generated', 'success');
      }
    }
  } catch (err) {
    console.error('DAR generation error:', err);
    showToast('Failed to generate DAR', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icons.filter}<span class="ml-2">Generate</span>`;
  }
}

// ─── Standard report functions (unchanged) ──────────────────────────────────

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
