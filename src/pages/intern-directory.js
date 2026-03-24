/**
 * Intern Directory Page (Admin)
 * View and search all interns with OJT progress.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, debounce, renderAvatar, computeEstimatedEndDate, getTodayDate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { getCurrentUser } from '../lib/auth.js';
import { extractTextWithPositions, parseDailyActivityReport } from '../lib/pdf-parser.js';

export async function renderInternDirectoryPage() {
  const { data: interns } = await supabase
    .from('profiles')
    .select('*, department:departments(name), location:locations(name)')
    .eq('role', 'intern')
    .order('full_name');

  // Fetch supervisors separately to avoid self-referencing FK join issues
  const supervisorIds = [...new Set((interns || []).map(i => i.supervisor_id).filter(Boolean))];
  let supervisorMap = {};
  if (supervisorIds.length > 0) {
    const { data: supervisors } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', supervisorIds);
    (supervisors || []).forEach(s => { supervisorMap[s.id] = s.full_name; });
  }

  // Fetch hours and days worked per intern (approved attendance)
  const internIds = (interns || []).map(i => i.id);
  let hoursMap = {};
  let daysWorkedMap = {};
  if (internIds.length > 0) {
    const { data: attendance } = await supabase
      .from('attendance_records')
      .select('intern_id, total_hours, date')
      .in('intern_id', internIds)
      .eq('status', 'approved');
    (attendance || []).forEach(r => {
      hoursMap[r.intern_id] = (hoursMap[r.intern_id] || 0) + (r.total_hours || 0);
      if (!daysWorkedMap[r.intern_id]) daysWorkedMap[r.intern_id] = new Set();
      daysWorkedMap[r.intern_id].add(r.date);
    });
  }

  let searchTerm = '';
  let statusFilter = '';

  function getFiltered() {
    let list = interns || [];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i => i.full_name?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q) || i.school?.toLowerCase().includes(q));
    }
    if (statusFilter === 'active') list = list.filter(i => i.is_active);
    if (statusFilter === 'inactive') list = list.filter(i => !i.is_active);
    return list;
  }

  function renderContent(el) {
    const filtered = getFiltered();
    const container = el.querySelector('#intern-grid');

    if (filtered.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center text-neutral-400 py-12">No interns found</div>';
      el.querySelector('#intern-count').textContent = '0 interns';
      return;
    }

    container.innerHTML = filtered.map(i => {
      const completed = hoursMap[i.id] || 0;
      const required = i.hours_required || 500;
      const pct = Math.min(100, (completed / required) * 100);
      const daysWorked = daysWorkedMap[i.id] ? daysWorkedMap[i.id].size : 0;
      const estEnd = computeEstimatedEndDate(required, completed, daysWorked);

      return `
        <div class="card">
          <div class="flex items-center gap-3 mb-3">
            ${renderAvatar(i, 'w-10 h-10', 'text-sm')}
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-neutral-900 truncate">${i.full_name}</h4>
              <p class="text-xs text-neutral-400 truncate">${i.email}</p>
            </div>
            <span class="badge-${i.is_active ? 'success' : 'danger'} text-xs">${i.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="space-y-1 text-sm text-neutral-600">
            ${i.school ? `<p>${icons.building} ${i.school}</p>` : ''}
            ${i.course ? `<p>Course: ${i.course}</p>` : ''}
            ${i.department?.name ? `<p>Dept: ${i.department.name}</p>` : ''}
            ${i.location?.name ? `<p>${icons.location} ${i.location.name}</p>` : ''}
            ${supervisorMap[i.supervisor_id] ? `<p>Supervisor: ${supervisorMap[i.supervisor_id]}</p>` : ''}
            ${i.ojt_start_date ? `<p>${icons.calendar} ${formatDate(i.ojt_start_date)}${estEnd ? ` – ${formatDate(estEnd)}` : ''}</p>` : ''}
          </div>
          <div class="mt-3 pt-3 border-t border-neutral-200">
            <div class="flex justify-between text-xs mb-1">
              <span>OJT Progress</span>
              <span>${pct.toFixed(1)}%</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${pct.toFixed(1)}%"></div>
            </div>
            <p class="text-xs text-neutral-400 mt-1">${formatHoursDisplay(completed)} / ${formatHoursDisplay(required)}</p>
            ${estEnd ? `<p class="text-xs text-primary-500 mt-1">${icons.calendar} Est. completion: ${formatDate(estEnd)}</p>` : completed >= required && required > 0 ? `<p class="text-xs text-success-500 mt-1">✅ Completed</p>` : ''}
          </div>
          ${i.is_active ? `
            <div class="mt-3 pt-3 border-t border-neutral-200 space-y-2">
              <button class="btn-secondary btn-sm log-past-hours-btn w-full inline-flex items-center justify-center gap-1" data-intern-id="${i.id}" data-intern-name="${i.full_name}" data-ojt-start="${i.ojt_start_date || ''}" data-supervisor-id="${i.supervisor_id || ''}">
                ${icons.clock} Log Past Hours
              </button>
              <!--
              <button class="btn-secondary btn-sm import-pdf-btn w-full inline-flex items-center justify-center gap-1" data-intern-id="${i.id}" data-intern-name="${i.full_name}" data-ojt-start="${i.ojt_start_date || ''}" data-supervisor-id="${i.supervisor_id || ''}">
                ${icons.upload} Import from PDF
              </button>
              -->
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    el.querySelector('#intern-count').textContent = `${filtered.length} intern${filtered.length !== 1 ? 's' : ''}`;

    // Attach click handlers for Log Past Hours buttons
    el.querySelectorAll('.log-past-hours-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openLogPastHoursModal({
          internId: btn.dataset.internId,
          internName: btn.dataset.internName,
          ojtStart: btn.dataset.ojtStart,
          supervisorId: btn.dataset.supervisorId,
        });
      });
    });

    // Attach click handlers for Import from PDF buttons
    el.querySelectorAll('.import-pdf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const intern = {
          internId: btn.dataset.internId,
          internName: btn.dataset.internName,
          ojtStart: btn.dataset.ojtStart,
          supervisorId: btn.dataset.supervisorId,
        };
        // Create a temporary file input
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'application/pdf,.pdf';
        fileInput.classList.add('hidden');
        fileInput.addEventListener('change', async () => {
          const file = fileInput.files[0];
          if (!file) return;
          fileInput.remove();
          await handlePdfImport(intern, file);
        });
        document.body.appendChild(fileInput);
        fileInput.click();
      });
    });
  }

  function openLogPastHoursModal(intern) {
    const today = getTodayDate();
    const minDate = intern.ojtStart || '';

    createModal(`Log Past Hours — ${intern.internName}`, `
      <form id="log-past-hours-form" class="space-y-4">
        <div>
          <label class="form-label">Date <span class="text-danger-500">*</span></label>
          <input type="date" id="lph-date" class="form-input" required max="${today}" ${minDate ? `min="${minDate}"` : ''} />
          <p class="text-xs text-neutral-400 mt-1">Select a past date or today</p>
        </div>

        <p class="text-xs text-neutral-500">Mark a session as "Not worked" if the intern only worked the other session.</p>
        <div class="space-y-6">
          <!-- Morning Session -->
          <div class="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
            <div class="flex items-center justify-between mb-4">
              <h4 class="font-semibold text-neutral-800">Morning Session</h4>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="lph-check-morning-not-worked" class="w-4 h-4">
                <span class="text-sm text-neutral-600">Not worked</span>
              </label>
            </div>
            <div class="space-y-3">
              <div>
                <label class="form-label">Morning In *</label>
                <input type="time" id="lph-time-in-1" class="form-input w-full" placeholder="--:-- --">
              </div>
              <div>
                <label class="form-label">Lunch Out *</label>
                <input type="time" id="lph-time-out-1" class="form-input w-full" placeholder="--:-- --">
              </div>
            </div>
          </div>

          <!-- Afternoon Session -->
          <div class="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
            <div class="flex items-center justify-between mb-4">
              <h4 class="font-semibold text-neutral-800">Afternoon Session</h4>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" id="lph-check-afternoon-not-worked" class="w-4 h-4">
                <span class="text-sm text-neutral-600">Not worked</span>
              </label>
            </div>
            <div class="space-y-3">
              <div>
                <label class="form-label">Afternoon In *</label>
                <input type="time" id="lph-time-in-2" class="form-input w-full" placeholder="01:00 PM">
              </div>
              <div>
                <label class="form-label">End of Day *</label>
                <input type="time" id="lph-time-out-2" class="form-input w-full" placeholder="05:42 PM">
              </div>
            </div>
          </div>

          <p class="text-xs text-neutral-500 italic">All times are required within worked sessions. Times must be in chronological order.</p>
        </div>

        <div class="flex justify-end gap-3 pt-2">
          <button type="button" id="lph-cancel" class="btn-secondary">Cancel</button>
          <button type="submit" id="lph-submit" class="btn-primary">Save Attendance</button>
        </div>
      </form>
    `, (el, close) => {
      el.querySelector('#lph-cancel').addEventListener('click', close);

      const dateInput = el.querySelector('#lph-date');
      const timeIn1Input = el.querySelector('#lph-time-in-1');
      const timeOut1Input = el.querySelector('#lph-time-out-1');
      const timeIn2Input = el.querySelector('#lph-time-in-2');
      const timeOut2Input = el.querySelector('#lph-time-out-2');
      let lastRequestedDate = '';

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

      setupSessionToggle('#lph-check-morning-not-worked', ['#lph-time-in-1', '#lph-time-out-1']);
      setupSessionToggle('#lph-check-afternoon-not-worked', ['#lph-time-in-2', '#lph-time-out-2']);

      const toTimeInputValue = (timestamp) => {
        if (!timestamp) return '';
        const parsed = new Date(timestamp);
        if (Number.isNaN(parsed.getTime())) return '';
        const hh = String(parsed.getHours()).padStart(2, '0');
        const mm = String(parsed.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
      };

      const clearTimeInputs = () => {
        timeIn1Input.value = '';
        timeOut1Input.value = '';
        timeIn2Input.value = '';
        timeOut2Input.value = '';
        el.querySelector('#lph-check-morning-not-worked').checked = false;
        el.querySelector('#lph-check-afternoon-not-worked').checked = false;
        // Reset styles
        timeIn1Input.style.backgroundColor = '';
        timeOut1Input.style.backgroundColor = '';
        timeIn2Input.style.backgroundColor = '';
        timeOut2Input.style.backgroundColor = '';
        timeIn1Input.disabled = false;
        timeOut1Input.disabled = false;
        timeIn2Input.disabled = false;
        timeOut2Input.disabled = false;
      };

      const loadAttendanceForDate = async (date) => {
        if (!date) {
          clearTimeInputs();
          return;
        }

        lastRequestedDate = date;
        const { data, error } = await supabase
          .from('attendance_records')
          .select('time_in_1, time_out_1, time_in_2, time_out_2')
          .eq('intern_id', intern.internId)
          .eq('date', date)
          .maybeSingle();

        if (lastRequestedDate !== dateInput.value) return;
        if (error) return;
        if (!data) {
          clearTimeInputs();
          return;
        }

        timeIn1Input.value = toTimeInputValue(data.time_in_1);
        timeOut1Input.value = toTimeInputValue(data.time_out_1);
        timeIn2Input.value = toTimeInputValue(data.time_in_2);
        timeOut2Input.value = toTimeInputValue(data.time_out_2);

        // Check if sessions are marked as "not worked" (both times null)
        const morningNotWorked = !data.time_in_1 && !data.time_out_1;
        const afternoonNotWorked = !data.time_in_2 && !data.time_out_2;

        if (morningNotWorked) {
          const checkbox = el.querySelector('#lph-check-morning-not-worked');
          checkbox.checked = true;
          timeIn1Input.disabled = true;
          timeOut1Input.disabled = true;
          timeIn1Input.style.backgroundColor = '#f3f4f6';
          timeOut1Input.style.backgroundColor = '#f3f4f6';
        }

        if (afternoonNotWorked) {
          const checkbox = el.querySelector('#lph-check-afternoon-not-worked');
          checkbox.checked = true;
          timeIn2Input.disabled = true;
          timeOut2Input.disabled = true;
          timeIn2Input.style.backgroundColor = '#f3f4f6';
          timeOut2Input.style.backgroundColor = '#f3f4f6';
        }
      };

      dateInput.addEventListener('change', async (event) => {
        await loadAttendanceForDate(event.target.value);
      });

      const resolveSupervisorId = async () => {
        const { data } = await supabase
          .from('profiles')
          .select('supervisor_id')
          .eq('id', intern.internId)
          .maybeSingle();
        return data?.supervisor_id || intern.supervisorId || null;
      };

      el.querySelector('#log-past-hours-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const date = el.querySelector('#lph-date').value;
        const morningNotWorked = el.querySelector('#lph-check-morning-not-worked').checked;
        const afternoonNotWorked = el.querySelector('#lph-check-afternoon-not-worked').checked;

        // At least one session must be worked
        if (morningNotWorked && afternoonNotWorked) {
          showToast('At least one session (Morning or Afternoon) must be worked', 'error');
          return;
        }

        let timeIn1 = el.querySelector('#lph-time-in-1').value;
        let timeOut1 = el.querySelector('#lph-time-out-1').value;
        let timeIn2 = el.querySelector('#lph-time-in-2').value;
        let timeOut2 = el.querySelector('#lph-time-out-2').value;

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

        const submitBtn = el.querySelector('#lph-submit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> Saving...';

        try {
          const admin = getCurrentUser();
          const supervisorId = await resolveSupervisorId();
          const ts = (time) => time ? new Date(`${date}T${time}:00`).toISOString() : null;

          const recordData = {
            intern_id: intern.internId,
            date,
            time_in_1: ts(timeIn1),
            time_out_1: ts(timeOut1),
            time_in_2: ts(timeIn2),
            time_out_2: ts(timeOut2),
            status: 'approved',
            approved_at: new Date().toISOString(),
            admin_logged: true,
            admin_logged_by: admin.id,
            supervisor_id: supervisorId,
          };

          // Check for existing record on this date
          const { data: existing } = await supabase
            .from('attendance_records')
            .select('id')
            .eq('intern_id', intern.internId)
            .eq('date', date)
            .maybeSingle();

          let recordId;

          if (existing) {
            // Overwrite existing record
            const { data, error } = await supabase
              .from('attendance_records')
              .update(recordData)
              .eq('id', existing.id)
              .select('id')
              .single();
            if (error) throw error;
            recordId = data.id;
          } else {
            // Insert new record
            const { data, error } = await supabase
              .from('attendance_records')
              .insert(recordData)
              .select('id')
              .single();
            if (error) throw error;
            recordId = data.id;
          }

          await logAudit('attendance.admin_logged', 'attendance', recordId, {
            intern_id: intern.internId,
            intern_name: intern.internName,
            date,
            time_in_1: timeIn1,
            time_out_1: timeOut1,
            time_in_2: timeIn2,
            time_out_2: timeOut2,
            overwrite: !!existing,
          });

          showToast(`Attendance saved for ${intern.internName} on ${formatDate(date)}`, 'success');
          close();

          // Refresh the page to update hours
          renderInternDirectoryPage();
        } catch (err) {
          showToast(err.message || 'Failed to save attendance', 'error');
          submitBtn.disabled = false;
          submitBtn.innerHTML = 'Save Attendance';
        }
      });

      if (dateInput.value) {
        loadAttendanceForDate(dateInput.value);
      }
    });
  }

  async function handlePdfImport(intern, file) {
    showToast('Parsing PDF...', 'info');

    try {
      const rows = await extractTextWithPositions(file);
      const entries = parseDailyActivityReport(rows);

      if (entries.length === 0) {
        showToast('Could not find attendance data in this PDF. Make sure it contains a table with Date and Time columns.', 'error');
        return;
      }

      showToast(`Found ${entries.length} attendance ${entries.length === 1 ? 'entry' : 'entries'}`, 'success');
      await openPdfReviewModal(intern, entries, file.name);
    } catch (err) {
      showToast(err.message || 'Failed to parse PDF', 'error');
    }
  }

  async function openPdfReviewModal(intern, entries, fileName) {
    const today = getTodayDate();
    const minDate = intern.ojtStart || '';

    // Open modal immediately with loading state
    createModal(`Import Attendance — ${intern.internName}`, `
      <div class="flex items-center justify-center py-12">
        <div class="text-center">
          <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
          <p class="text-sm text-neutral-500">Preparing import...</p>
        </div>
      </div>
    `, async (modalEl, close) => {
      // Fetch existing attendance records for this intern to detect conflicts
      const dates = entries.map(e => e.date).filter(Boolean);
      let existingDates = new Set();
      if (dates.length > 0) {
        const { data: existing } = await supabase
          .from('attendance_records')
          .select('date')
          .eq('intern_id', intern.internId)
          .in('date', dates);
        (existing || []).forEach(r => existingDates.add(r.date));
      }

      const tableRows = entries.map((entry, idx) => {
      const hasConflict = existingDates.has(entry.date);
      const isComplete = entry.timeIn1 && entry.timeOut1 && entry.timeIn2 && entry.timeOut2;
      const isValidOrder = !isComplete || (entry.timeIn1 < entry.timeOut1 && entry.timeOut1 < entry.timeIn2 && entry.timeIn2 < entry.timeOut2);
      const isDateValid = entry.date && entry.date <= today && (!minDate || entry.date >= minDate);

      let statusBadge;
      if (!isDateValid) {
        statusBadge = '<span class="badge-danger text-xs">Invalid Date</span>';
      } else if (!isComplete) {
        statusBadge = '<span class="badge-warning text-xs">Incomplete</span>';
      } else if (!isValidOrder) {
        statusBadge = '<span class="badge-danger text-xs">Invalid Order</span>';
      } else if (hasConflict) {
        statusBadge = '<span class="badge-warning text-xs">Overwrite</span>';
      } else {
        statusBadge = '<span class="badge-success text-xs">OK</span>';
      }

      return `<tr data-row-idx="${idx}">
        <td class="text-center"><input type="checkbox" class="pdf-row-check w-4 h-4 accent-primary-500" data-idx="${idx}" ${isComplete && isValidOrder && isDateValid ? 'checked' : ''} /></td>
        <td class="text-center text-xs text-neutral-400">${idx + 1}</td>
        <td><input type="date" class="form-input text-sm pdf-date" data-idx="${idx}" value="${entry.date || ''}" max="${today}" ${minDate ? `min="${minDate}"` : ''} /></td>
        <td><input type="time" class="form-input text-sm pdf-time-in1" data-idx="${idx}" value="${entry.timeIn1 || ''}" /></td>
        <td><input type="time" class="form-input text-sm pdf-time-out1" data-idx="${idx}" value="${entry.timeOut1 || ''}" /></td>
        <td><input type="time" class="form-input text-sm pdf-time-in2" data-idx="${idx}" value="${entry.timeIn2 || ''}" /></td>
        <td><input type="time" class="form-input text-sm pdf-time-out2" data-idx="${idx}" value="${entry.timeOut2 || ''}" /></td>
        <td class="text-center pdf-status" data-idx="${idx}">${statusBadge}</td>
      </tr>`;
    }).join('');

      // Replace loading state with actual content
      modalEl.querySelector('.modal-body').innerHTML = `
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <p class="text-sm text-neutral-500">${icons.narrative} ${fileName} — ${entries.length} ${entries.length === 1 ? 'entry' : 'entries'} found</p>
            <label class="inline-flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" id="pdf-select-all" class="w-4 h-4 accent-primary-500" checked />
              Select All
            </label>
          </div>

          <div class="overflow-x-auto" style="max-height: 400px; overflow-y: auto;">
            <table class="data-table text-sm">
              <thead class="sticky top-0 bg-white z-10">
                <tr>
                  <th class="w-8"></th>
                  <th class="w-8">#</th>
                  <th>Date</th>
                  <th>Morning In</th>
                  <th>Lunch Out</th>
                  <th>Afternoon In</th>
                  <th>End of Day</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>

          <p class="text-xs text-neutral-400">Review and edit the parsed data. Uncheck rows you don't want to import. Rows marked "Overwrite" will replace existing records.</p>

          <div class="flex justify-end gap-3 pt-2">
            <button type="button" id="pdf-cancel" class="btn-secondary">Cancel</button>
            <button type="button" id="pdf-save" class="btn-primary">Save Selected</button>
          </div>
        </div>
      `;

      // Attach event listeners after content is replaced
      modalEl.querySelector('#pdf-cancel').addEventListener('click', close);

      // Update status badges and save button when inputs change
      function updateRowStatus(idx) {
        const row = modalEl.querySelector(`tr[data-row-idx="${idx}"]`);
        if (!row) return;

        const date = row.querySelector('.pdf-date').value;
        const t1 = row.querySelector('.pdf-time-in1').value;
        const t2 = row.querySelector('.pdf-time-out1').value;
        const t3 = row.querySelector('.pdf-time-in2').value;
        const t4 = row.querySelector('.pdf-time-out2').value;
        const statusCell = row.querySelector('.pdf-status');

        const isComplete = t1 && t2 && t3 && t4;
        const isValidOrder = !isComplete || (t1 < t2 && t2 < t3 && t3 < t4);
        const isDateValid = date && date <= today && (!minDate || date >= minDate);
        const hasConflict = existingDates.has(date);

        let badge;
        if (!date || !isDateValid) {
          badge = '<span class="badge-danger text-xs">Invalid Date</span>';
        } else if (!isComplete) {
          badge = '<span class="badge-warning text-xs">Incomplete</span>';
        } else if (!isValidOrder) {
          badge = '<span class="badge-danger text-xs">Invalid Order</span>';
        } else if (hasConflict) {
          badge = '<span class="badge-warning text-xs">Overwrite</span>';
        } else {
          badge = '<span class="badge-success text-xs">OK</span>';
        }
        statusCell.innerHTML = badge;
        updateSaveButton();
      }

      function updateSaveButton() {
        const checked = modalEl.querySelectorAll('.pdf-row-check:checked');
        const saveBtn = modalEl.querySelector('#pdf-save');
        let validCount = 0;

        checked.forEach(cb => {
          const idx = cb.dataset.idx;
          const row = modalEl.querySelector(`tr[data-row-idx="${idx}"]`);
          const date = row.querySelector('.pdf-date').value;
          const t1 = row.querySelector('.pdf-time-in1').value;
          const t2 = row.querySelector('.pdf-time-out1').value;
          const t3 = row.querySelector('.pdf-time-in2').value;
          const t4 = row.querySelector('.pdf-time-out2').value;

          const isComplete = date && t1 && t2 && t3 && t4;
          const isValidOrder = isComplete && t1 < t2 && t2 < t3 && t3 < t4;
          const isDateValid = date && date <= today && (!minDate || date >= minDate);

          if (isComplete && isValidOrder && isDateValid) validCount++;
        });

        saveBtn.disabled = validCount === 0;
        saveBtn.textContent = validCount > 0 ? `Save Selected (${validCount})` : 'Save Selected';
      }

      // Attach input change listeners to all editable fields
      modalEl.querySelectorAll('.pdf-date, .pdf-time-in1, .pdf-time-out1, .pdf-time-in2, .pdf-time-out2').forEach(input => {
        input.addEventListener('change', () => updateRowStatus(input.dataset.idx));
      });

      // Checkbox handlers
      modalEl.querySelectorAll('.pdf-row-check').forEach(cb => {
        cb.addEventListener('change', updateSaveButton);
      });

      // Select All toggle
      modalEl.querySelector('#pdf-select-all').addEventListener('change', (e) => {
        modalEl.querySelectorAll('.pdf-row-check').forEach(cb => { cb.checked = e.target.checked; });
        updateSaveButton();
      });

      // Initial button state
      updateSaveButton();

      // Save handler
      modalEl.querySelector('#pdf-save').addEventListener('click', async () => {
        const saveBtn = modalEl.querySelector('#pdf-save');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="spinner"></span> Saving...';

        try {
          const admin = getCurrentUser();
          const { data: internProfile } = await supabase
            .from('profiles')
            .select('supervisor_id')
            .eq('id', intern.internId)
            .maybeSingle();
          const supervisorId = internProfile?.supervisor_id || intern.supervisorId || null;
          const checkedRows = modalEl.querySelectorAll('.pdf-row-check:checked');
          let saved = 0;
          let skipped = 0;

          for (const cb of checkedRows) {
            const idx = cb.dataset.idx;
            const row = modalEl.querySelector(`tr[data-row-idx="${idx}"]`);
            const date = row.querySelector('.pdf-date').value;
            const timeIn1 = row.querySelector('.pdf-time-in1').value;
            const timeOut1 = row.querySelector('.pdf-time-out1').value;
            const timeIn2 = row.querySelector('.pdf-time-in2').value;
            const timeOut2 = row.querySelector('.pdf-time-out2').value;

            // Skip invalid rows
            const isComplete = date && timeIn1 && timeOut1 && timeIn2 && timeOut2;
            const isValidOrder = isComplete && timeIn1 < timeOut1 && timeOut1 < timeIn2 && timeIn2 < timeOut2;
            const isDateValid = date && date <= today && (!minDate || date >= minDate);

            if (!isComplete || !isValidOrder || !isDateValid) {
              skipped++;
              continue;
            }

            saveBtn.innerHTML = `<span class="spinner"></span> Saving ${saved + 1} of ${checkedRows.length}...`;

            const ts = (time) => new Date(`${date}T${time}:00`).toISOString();
            const recordData = {
              intern_id: intern.internId,
              date,
              time_in_1: ts(timeIn1),
              time_out_1: ts(timeOut1),
              time_in_2: ts(timeIn2),
              time_out_2: ts(timeOut2),
              status: 'approved',
              approved_at: new Date().toISOString(),
              admin_logged: true,
              admin_logged_by: admin.id,
              supervisor_id: supervisorId,
            };

            // Check for existing record on this date
            const { data: existing } = await supabase
              .from('attendance_records')
              .select('id')
              .eq('intern_id', intern.internId)
              .eq('date', date)
              .maybeSingle();

            let recordId;
            if (existing) {
              const { data, error } = await supabase
                .from('attendance_records')
                .update(recordData)
                .eq('id', existing.id)
                .select('id')
                .single();
              if (error) throw error;
              recordId = data.id;
            } else {
              const { data, error } = await supabase
                .from('attendance_records')
                .insert(recordData)
                .select('id')
                .single();
              if (error) throw error;
              recordId = data.id;
            }

            await logAudit('attendance.admin_logged', 'attendance', recordId, {
              intern_id: intern.internId,
              intern_name: intern.internName,
              date,
              time_in_1: timeIn1,
              time_out_1: timeOut1,
              time_in_2: timeIn2,
              time_out_2: timeOut2,
              overwrite: !!existing,
              source: 'pdf_import',
            });

            saved++;
          }

          const msg = skipped > 0
            ? `Imported ${saved} record${saved !== 1 ? 's' : ''} for ${intern.internName} (${skipped} skipped)`
            : `Imported ${saved} attendance record${saved !== 1 ? 's' : ''} for ${intern.internName}`;
          showToast(msg, 'success');
          close();
          renderInternDirectoryPage();
        } catch (err) {
          showToast(err.message || 'Failed to save attendance records', 'error');
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Selected';
        }
      });
    });
  }

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Intern Directory</h1>
      <p class="page-subtitle">All registered interns and their OJT progress</p>
    </div>

    <div class="card mb-6">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex-1 min-w-50">
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">${icons.search}</span>
            <input type="text" id="search-intern" class="form-input pl-10!" placeholder="Search by name, email, school..." />
          </div>
        </div>
        <select id="filter-status" class="form-input w-auto">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <p class="text-sm text-neutral-500" id="intern-count">${(interns || []).length} interns</p>
      </div>
    </div>

    <div id="intern-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
  `, (el) => {
    renderContent(el);

    const debouncedSearch = debounce(() => renderContent(el), 300);
    el.querySelector('#search-intern').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      debouncedSearch();
    });
    el.querySelector('#filter-status').addEventListener('change', (e) => {
      statusFilter = e.target.value;
      renderContent(el);
    });
  }, '/intern-directory');
}
