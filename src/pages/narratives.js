/**
 * Daily Narratives Page (Intern view)
 * Submit daily narratives with morning/afternoon sessions linked to tasks.
 * Hours are auto-filled from attendance records.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime, formatHoursDisplay, getTodayDate, calculateSessionHours } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { isHoliday } from '../lib/holidays.js';
import { sendEmailNotification, getDepartmentSupervisors } from '../lib/email-notifications.js';
import { openNarrativeModal as openSharedNarrativeModal } from '../lib/narrative-modal.js';
import { markSidebarIndicatorSeen, sidebarIndicatorTypes } from '../lib/sidebar-indicators.js';

// Pre-load Quill to avoid dynamic import delays in modal
let QuillModule = null;
let quillLoadPromise = null;

function getQuill() {
  if (QuillModule) return Promise.resolve(QuillModule);
  if (!quillLoadPromise) {
    quillLoadPromise = import('quill').then(module => {
      QuillModule = module.default;
      return QuillModule;
    });
  }
  return quillLoadPromise;
}

export async function renderNarrativesPage() {
  const profile = getProfile();
  markSidebarIndicatorSeen(profile?.id, sidebarIndicatorTypes.narratives);
  const today = getTodayDate();
  const todayHolidayInfo = await isHoliday(today);

  // Pre-load Quill in background for faster modal opening
  getQuill().catch(() => {});

  // Fetch intern's tasks (in_progress or completed within 48 hours)
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, title, status, pending_status, approved_at')
    .eq('assigned_to', profile.id);

  // Tasks available for narratives:
  // - Tasks that are 'in_progress' (exclude 'not_started')
  // - OR completed tasks that were approved within the last 48 hours
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - (48 * 60 * 60 * 1000));

  const tasks = (allTasks || []).filter(t => {
    // Exclude tasks that haven't been started yet
    if (t.status === 'not_started') {
      return false;
    }

    // Include in-progress tasks
    if (t.status === 'in_progress') {
      return true;
    }

    // For completed tasks, check if approved within last 48 hours
    if (t.status === 'completed' && t.approved_at) {
      const approvedDate = new Date(t.approved_at);
      return approvedDate >= fortyEightHoursAgo;
    }

    // Exclude completed tasks without approval timestamp
    return false;
  });

  // Fetch today's narratives (exclude drafts from display)
  const { data: todayNarratives } = await supabase
    .from('narratives')
    .select('*, task:tasks(title)')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .neq('status', 'draft')
    .order('session', { ascending: true });

  // Fetch today's attendance for the combined view
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .maybeSingle();

  // Fetch recent narratives (past, exclude drafts)
  const { data: recentNarratives } = await supabase
    .from('narratives')
    .select('*, task:tasks(title)')
    .eq('intern_id', profile.id)
    .neq('date', today)
    .neq('status', 'draft')
    .order('date', { ascending: false })
    .limit(30);

  // Group recent narratives by date
  const groupedRecent = {};
  (recentNarratives || []).forEach(n => {
    if (!groupedRecent[n.date]) groupedRecent[n.date] = [];
    groupedRecent[n.date].push(n);
  });

  // Fetch attendance records for all narrative dates to support hours fallback
  const narrativeDates = Object.keys(groupedRecent);
  let attendanceByDate = {};
  if (narrativeDates.length > 0) {
    try {
      const { data: attendanceRecords } = await supabase
        .from('attendance_records')
        .select('date, time_in_1, time_out_1, time_in_2, time_out_2')
        .eq('intern_id', profile.id)
        .in('date', narrativeDates);

      if (attendanceRecords) {
        attendanceRecords.forEach(record => {
          attendanceByDate[record.date] = record;
        });
      }
    } catch (err) {
      console.error('Failed to fetch attendance for narrative hours fallback:', err);
    }
  }

  // Find today's morning/afternoon narratives
  const morningNarrative = (todayNarratives || []).find(n => n.session === 'morning');
  const afternoonNarrative = (todayNarratives || []).find(n => n.session === 'afternoon');

  // Determine the active task for today (from today's narratives)
  const todayTaskId = morningNarrative?.task_id || afternoonNarrative?.task_id || null;
  const todayTask = todayTaskId ? (tasks || []).find(t => t.id === todayTaskId) : null;

  let viewMode = 'today'; // 'today' or 'history'

  function renderTodayLogView() {
    const morningHours = todayAttendance && todayAttendance.time_in_1 && todayAttendance.time_out_1
      ? calculateSessionHours(todayAttendance.time_in_1, todayAttendance.time_out_1) : null;
    const afternoonHours = todayAttendance && todayAttendance.time_in_2 && todayAttendance.time_out_2
      ? calculateSessionHours(todayAttendance.time_in_2, todayAttendance.time_out_2) : null;

    const selectDisplayHours = (storedHours, attendanceHours) => {
      const parsedStored = storedHours !== null && storedHours !== undefined ? Number(storedHours) : null;
      const parsedAttendance = attendanceHours !== null && attendanceHours !== undefined ? Number(attendanceHours) : null;

      if (Number.isFinite(parsedStored) && parsedStored > 0) return parsedStored;
      if (Number.isFinite(parsedAttendance) && parsedAttendance > 0) return parsedAttendance;
      if (Number.isFinite(parsedStored)) return parsedStored;
      if (Number.isFinite(parsedAttendance)) return parsedAttendance;
      return null;
    };

    const morningNarrativeHours = morningNarrative
      ? selectDisplayHours(morningNarrative.hours, morningHours)
      : null;
    const afternoonNarrativeHours = afternoonNarrative
      ? selectDisplayHours(afternoonNarrative.hours, afternoonHours)
      : null;

    return `
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-base font-bold text-neutral-900">Today's Daily Log</h3>
            <p class="text-sm text-neutral-500">${formatDate(today)}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Morning Session -->
          <div class="border border-neutral-200 rounded-lg p-4 ${morningNarrative ? 'bg-primary-50/30' : 'bg-neutral-50'}">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-neutral-700">${icons.clock} Morning Session</span>
              </div>
              ${morningNarrative ? `
                <div class="flex items-center gap-2">
                  <span class="badge-${morningNarrative.status === 'approved' ? 'approved' : morningNarrative.status === 'rejected' ? 'rejected' : 'pending'}">
                    ${morningNarrative.status}
                  </span>
                  ${morningNarrative.edited_at ? '<span class="badge bg-info-100 text-info-700 text-xs">Edited</span>' : ''}
                  ${(morningNarrative.status === 'rejected' || morningNarrative.status === 'pending') ? `
                    <button class="btn-sm btn-secondary edit-narrative-btn" data-narrative-id="${morningNarrative.id}" title="Edit">
                      ${icons.edit}
                    </button>
                  ` : ''}
                </div>
              ` : '<span class="badge bg-neutral-100 text-neutral-500">Not submitted</span>'}
            </div>
            ${morningNarrative?.task ? `<p class="text-xs text-primary-600 font-medium mb-1">Task: ${morningNarrative.task.title}</p>` : ''}
            <p class="text-xs text-neutral-400 mb-2">Time In 1 → Time Out 1 ${morningHours !== null ? `• ${formatHoursDisplay(morningHours)}` : ''}</p>
            ${morningNarrative ? `
              <div class="prose prose-sm text-neutral-700 text-sm">${morningNarrative.content}</div>
              ${morningNarrativeHours !== null && morningNarrativeHours !== undefined ? `<p class="text-xs text-neutral-400 mt-2">Hours: ${formatHoursDisplay(morningNarrativeHours)}</p>` : ''}
              ${morningNarrative.rejection_reason ? `
                <div class="mt-2 p-2 bg-danger-50 rounded">
                  <p class="text-xs text-danger-600"><strong>Rejected:</strong> ${morningNarrative.rejection_reason}</p>
                </div>
              ` : ''}
            ` : `
              <p class="text-sm text-neutral-400 italic">No narrative submitted yet</p>
            `}
          </div>

          <!-- Afternoon Session -->
          <div class="border border-neutral-200 rounded-lg p-4 ${afternoonNarrative ? 'bg-primary-50/30' : 'bg-neutral-50'}">
            <div class="flex items-center justify-between mb-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-neutral-700">${icons.clock} Afternoon Session</span>
              </div>
              ${afternoonNarrative ? `
                <div class="flex items-center gap-2">
                  <span class="badge-${afternoonNarrative.status === 'approved' ? 'approved' : afternoonNarrative.status === 'rejected' ? 'rejected' : 'pending'}">
                    ${afternoonNarrative.status}
                  </span>
                  ${afternoonNarrative.edited_at ? '<span class="badge bg-info-100 text-info-700 text-xs">Edited</span>' : ''}
                  ${(afternoonNarrative.status === 'rejected' || afternoonNarrative.status === 'pending') ? `
                    <button class="btn-sm btn-secondary edit-narrative-btn" data-narrative-id="${afternoonNarrative.id}" title="Edit">
                      ${icons.edit}
                    </button>
                  ` : ''}
                </div>
              ` : '<span class="badge bg-neutral-100 text-neutral-500">Not submitted</span>'}
            </div>
            ${afternoonNarrative?.task ? `<p class="text-xs text-primary-600 font-medium mb-1">Task: ${afternoonNarrative.task.title}</p>` : ''}
            <p class="text-xs text-neutral-400 mb-2">Time In 2 → Time Out 2 ${afternoonHours !== null ? `• ${formatHoursDisplay(afternoonHours)}` : ''}</p>
            ${afternoonNarrative ? `
              <div class="prose prose-sm text-neutral-700 text-sm">${afternoonNarrative.content}</div>
              ${afternoonNarrativeHours !== null && afternoonNarrativeHours !== undefined ? `<p class="text-xs text-neutral-400 mt-2">Hours: ${formatHoursDisplay(afternoonNarrativeHours)}</p>` : ''}
              ${afternoonNarrative.rejection_reason ? `
                <div class="mt-2 p-2 bg-danger-50 rounded">
                  <p class="text-xs text-danger-600"><strong>Rejected:</strong> ${afternoonNarrative.rejection_reason}</p>
                </div>
              ` : ''}
            ` : `
              <p class="text-sm text-neutral-400 italic">No narrative submitted yet</p>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function renderHistoryView() {
    const dates = Object.keys(groupedRecent).sort((a, b) => b.localeCompare(a));

    if (dates.length === 0) {
      return `
        <div class="card">
          <div class="text-center py-8 text-neutral-400">
            <p>No previous narratives</p>
          </div>
        </div>
      `;
    }

    return dates.map(date => {
      const dayNarratives = groupedRecent[date];
      const morning = dayNarratives.find(n => n.session === 'morning');
      const afternoon = dayNarratives.find(n => n.session === 'afternoon');

      return `
        <div class="card mb-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-bold text-neutral-900">${formatDate(date)}</h4>
            <div class="flex items-center gap-2">
              ${dayNarratives.some(n => n.is_late_submission) ? '<span class="badge bg-warning-50 text-warning-600">Late</span>' : ''}
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${renderSessionCard(morning, 'Morning', date)}
            ${renderSessionCard(afternoon, 'Afternoon', date)}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSessionCard(narrative, label, date) {
    if (!narrative) {
      return `
        <div class="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
          <p class="text-xs font-semibold text-neutral-500 mb-1">${label} Session</p>
          <p class="text-sm text-neutral-400 italic">Not submitted</p>
        </div>
      `;
    }

    const canEdit = narrative.status === 'rejected' || narrative.status === 'pending';

    // Calculate fallback hours from attendance data
    let attendanceHours = null;
    const attendanceRecord = attendanceByDate[date];
    
    if (attendanceRecord) {
      if (narrative.session === 'morning' && attendanceRecord.time_in_1 && attendanceRecord.time_out_1) {
        attendanceHours = calculateSessionHours(attendanceRecord.time_in_1, attendanceRecord.time_out_1);
      } else if (narrative.session === 'afternoon' && attendanceRecord.time_in_2 && attendanceRecord.time_out_2) {
        attendanceHours = calculateSessionHours(attendanceRecord.time_in_2, attendanceRecord.time_out_2);
      }
    }

    // Use fallback logic: prefer stored positive hours, otherwise use attendance-derived hours
    const storedHours = narrative.hours !== null && narrative.hours !== undefined ? Number(narrative.hours) : null;
    let displayHours = null;
    
    if (Number.isFinite(storedHours) && storedHours > 0) {
      displayHours = storedHours;
    } else if (Number.isFinite(attendanceHours) && attendanceHours > 0) {
      displayHours = attendanceHours;
    } else if (Number.isFinite(storedHours)) {
      displayHours = storedHours;
    } else if (Number.isFinite(attendanceHours)) {
      displayHours = attendanceHours;
    }

    return `
      <div class="border border-neutral-200 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <p class="text-xs font-semibold text-neutral-500">${label} Session</p>
          <div class="flex items-center gap-2">
            ${displayHours !== null ? `<span class="text-xs text-neutral-400">${formatHoursDisplay(displayHours)}</span>` : ''}
            <span class="badge-${narrative.status === 'approved' ? 'approved' : narrative.status === 'rejected' ? 'rejected' : 'pending'}">${narrative.status}</span>
            ${narrative.edited_at ? '<span class="badge bg-info-100 text-info-700 text-xs">Edited</span>' : ''}
            ${canEdit ? `
              <button class="btn-sm btn-secondary edit-narrative-btn" data-narrative-id="${narrative.id}" title="Edit">
                ${icons.edit}
              </button>
            ` : ''}
          </div>
        </div>
        ${narrative.task ? `<p class="text-xs text-primary-600 font-medium mb-1">Task: ${narrative.task.title}</p>` : ''}
        <div class="prose prose-sm text-neutral-700 text-sm">${narrative.content}</div>
        ${narrative.is_late_submission ? '<p class="text-xs text-warning-500 mt-1">Late submission</p>' : ''}
        ${narrative.rejection_reason ? `
          <div class="mt-2 p-2 bg-danger-50 rounded">
            <p class="text-xs text-danger-600"><strong>Rejected:</strong> ${narrative.rejection_reason}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Check if intern can submit today (needs at least one session without a narrative)
  const canSubmitToday = (!morningNarrative || !afternoonNarrative) && tasks && tasks.length > 0;
  // Check if any existing narrative can be edited
  const hasEditableNarratives = (todayNarratives || []).some(n => n.status === 'rejected' || n.status === 'pending');

  renderLayout(`
    <div class="flex items-center justify-between page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Daily Narratives</h1>
        <p class="page-subtitle">Document your daily activities by session</p>
      </div>
      <button id="add-narrative-btn" class="btn-primary" ${(!tasks || tasks.length === 0 || todayHolidayInfo.isHoliday) ? `disabled title="${todayHolidayInfo.isHoliday ? 'Narrative submission is disabled on holidays' : 'No active tasks available'}"` : ''}>
        ${icons.plus}
        <span class="ml-2">New Narrative</span>
      </button>
    </div>

    ${todayHolidayInfo.isHoliday ? `
      <div class="bg-danger-50 border border-danger-300 rounded-xl p-4 mb-6 flex items-center gap-3 animate-fade-in-up">
        ${icons.calendar}
        <div>
          <p class="text-sm font-bold text-danger-700">Holiday: ${todayHolidayInfo.name}</p>
          <p class="text-xs text-danger-600">Narrative submission is disabled on holidays.</p>
        </div>
      </div>
    ` : ''}

    ${(!tasks || tasks.length === 0) ? `
      <div class="bg-warning-50 border border-warning-500/30 rounded-lg p-4 mb-6">
        <p class="text-sm text-warning-600">
          <strong>Note:</strong> You need at least one active task to submit a narrative.
          Please wait for your supervisor to assign tasks.
        </p>
      </div>
    ` : ''}

    <!-- View Toggle -->
    <div class="filter-tabs mb-6">
      <button class="filter-tab active view-tab" data-view="today">
        ${icons.calendar} Today's Log
      </button>
      <button class="filter-tab view-tab" data-view="history">
        ${icons.narrative} History
      </button>
    </div>

    <!-- View Container -->
    <div id="view-container">
      ${renderTodayLogView()}
    </div>
  `, (el) => {
    // View toggle
    el.querySelectorAll('.view-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        viewMode = tab.dataset.view;

        const container = el.querySelector('#view-container');
        if (viewMode === 'today') {
          container.innerHTML = renderTodayLogView();
          bindEditButtons(container);
        } else {
          container.innerHTML = renderHistoryView();
          bindEditButtons(container);
        }
      });
    });

    // New narrative button - use shared modal library
    el.querySelector('#add-narrative-btn')?.addEventListener('click', async () => {
      await openSharedNarrativeModal({
        tasks,
        profile,
        fixedDate: null,
        allowDateChange: true,
        forceSubmission: false,
        onComplete: renderNarrativesPage,
      });
    });

    // Bind edit buttons for initial view
    bindEditButtons(el);

    function bindEditButtons(container) {
      container.querySelectorAll('.edit-narrative-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const narrativeId = btn.dataset.narrativeId;
          const allNarratives = [...(todayNarratives || []), ...(recentNarratives || [])];
          const narrative = allNarratives.find(n => n.id === narrativeId);
          if (narrative) {
            openEditNarrativeModal(narrative, tasks, profile, attendanceByDate);
          }
        });
      });
    }
  });
}

async function fetchExistingNarrativesForDate(internId, date) {
  const { data } = await supabase
    .from('narratives')
    .select('id, session, status')
    .eq('intern_id', internId)
    .eq('date', date);
  return data || [];
}

function openEditNarrativeModal(narrative, tasks, profile, attendanceByDate = {}) {
  createModal(`Edit ${narrative.session === 'morning' ? 'Morning' : 'Afternoon'} Narrative`, `
    <form id="edit-narrative-form" class="space-y-4">
      <div>
        <label class="form-label">Task</label>
        <p class="text-sm text-neutral-600 font-medium">${narrative.task?.title || 'Unknown'}</p>
      </div>

      <div class="flex items-center gap-4">
        <div>
          <label class="form-label">Date</label>
          <p class="text-sm text-neutral-600">${formatDate(narrative.date)}</p>
        </div>
        <div>
          <label class="form-label">Session</label>
          <p class="text-sm text-neutral-600 capitalize">${narrative.session}</p>
        </div>
        <div>
          <label class="form-label">Hours</label>
          <p id="narrative-hours-display" class="text-sm text-neutral-600">Loading...</p>
        </div>
      </div>

      ${narrative.rejection_reason ? `
        <div class="p-3 bg-danger-50 rounded-lg">
          <p class="text-xs font-medium text-danger-600">Rejection Reason:</p>
          <p class="text-sm text-danger-600">${narrative.rejection_reason}</p>
        </div>
      ` : ''}

      <div>
        <label class="form-label">Narrative <span class="text-danger-500">*</span></label>
        <div id="edit-narrative-editor"></div>
        <p id="edit-char-count" class="text-xs text-neutral-400 mt-1 text-right">0 / 175</p>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-submit" class="btn-primary">Resubmit</button>
      </div>
    </form>
  `, async (el, close) => {
    // Reuse already-fetched attendance data to keep modal hours consistent with history cards.
    let attendanceHours = null;
    const attendanceRecord = attendanceByDate?.[narrative.date] || null;

    if (attendanceRecord) {
      if (narrative.session === 'morning' && attendanceRecord.time_in_1 && attendanceRecord.time_out_1) {
        attendanceHours = calculateSessionHours(attendanceRecord.time_in_1, attendanceRecord.time_out_1);
      } else if (narrative.session === 'afternoon' && attendanceRecord.time_in_2 && attendanceRecord.time_out_2) {
        attendanceHours = calculateSessionHours(attendanceRecord.time_in_2, attendanceRecord.time_out_2);
      }
    }

    // Use fallback logic: prefer stored positive hours, otherwise use attendance-derived hours
    const storedHours = narrative.hours !== null && narrative.hours !== undefined ? Number(narrative.hours) : null;
    let displayHours = null;
    
    if (Number.isFinite(storedHours) && storedHours > 0) {
      displayHours = storedHours;
    } else if (Number.isFinite(attendanceHours) && attendanceHours > 0) {
      displayHours = attendanceHours;
    } else if (Number.isFinite(storedHours)) {
      displayHours = storedHours;
    } else if (Number.isFinite(attendanceHours)) {
      displayHours = attendanceHours;
    }

    // Update the hours display
    const hoursDisplay = el.querySelector('#narrative-hours-display');
    if (hoursDisplay) {
      hoursDisplay.textContent = displayHours !== null ? formatHoursDisplay(displayHours) : '—';
    }

    const Quill = await getQuill();
    const quill = new Quill('#edit-narrative-editor', {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    });
    quill.root.innerHTML = narrative.content;

    const CHAR_LIMIT = 175;
    const blockPasteEdit = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      showToast('Pasting is not allowed. Please type your narrative.', 'error');
    };
    quill.root.addEventListener('paste', blockPasteEdit, true);
    quill.root.addEventListener('drop', blockPasteEdit, true);

    function updateEditCharCount() {
      const len = quill.getText().trim().length;
      const counter = el.querySelector('#edit-char-count');
      if (!counter) return;
      counter.textContent = `${len} / ${CHAR_LIMIT}`;
      counter.classList.toggle('text-danger-500', len > CHAR_LIMIT);
      counter.classList.toggle('text-neutral-400', len <= CHAR_LIMIT);
    }

    quill.on('text-change', () => {
      const text = quill.getText();
      if (text.length - 1 > CHAR_LIMIT) {
        quill.deleteText(CHAR_LIMIT, text.length);
      }
      updateEditCharCount();
    });

    // Initialize counter with existing content
    updateEditCharCount();

    el.querySelector('#edit-cancel').addEventListener('click', close);

    el.querySelector('#edit-narrative-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = quill.root.innerHTML;

      if (quill.getText().trim().length < 10) {
        showToast('Narrative must be at least 10 characters', 'error');
        return;
      }

      const submitBtn = el.querySelector('#edit-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resubmitting...';

      try {
        const { error } = await supabase
          .from('narratives')
          .update({
            content,
            status: 'pending',
            rejection_reason: null,
            edited_at: new Date().toISOString(),
          })
          .eq('id', narrative.id);

        if (error) throw error;

        // Create new approval entry
        if (profile.supervisor_id) {
          await supabase.from('approvals').insert({
            type: 'narrative',
            entity_id: narrative.id,
            intern_id: profile.id,
            supervisor_id: profile.supervisor_id,
            comments: narrative.status === 'rejected' ? 'Resubmitted after rejection' : 'Edited while pending',
          });
        }

        // Notify all department supervisors
        const deptSupervisors = await getDepartmentSupervisors(profile.id);
        const wasRejected = narrative.status === 'rejected';
        const notifTitle = wasRejected ? 'Narrative Resubmitted' : 'Narrative Edited';
        const notifMessage = wasRejected
          ? `${profile.full_name} resubmitted a ${narrative.session} narrative for ${formatDate(narrative.date)}`
          : `${profile.full_name} edited their ${narrative.session} narrative for ${formatDate(narrative.date)}`;

        if (deptSupervisors.length > 0) {
          const supervisorNotifs = deptSupervisors.map(sup => ({
            user_id: sup.id,
            type: 'pending_approval',
            title: notifTitle,
            message: notifMessage,
            entity_type: 'narrative',
            entity_id: narrative.id,
          }));
          await supabase.from('notifications').insert(supervisorNotifs);
        }

        // Also notify all active admins (exclude supervisors already notified)
        const { data: adminsForResubmit } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .eq('is_active', true);

        if (adminsForResubmit && adminsForResubmit.length > 0) {
          const supervisorIds = deptSupervisors.map(s => s.id);
          const adminNotifs = adminsForResubmit
            .filter(a => !supervisorIds.includes(a.id))
            .map(a => ({
              user_id: a.id,
              type: 'pending_approval',
              title: notifTitle,
              message: notifMessage,
              entity_type: 'narrative',
              entity_id: narrative.id,
            }));
          if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);
        }

        await logAudit('narrative.resubmitted', 'narrative', narrative.id, {
          previous_status: narrative.status,
          session: narrative.session,
        });

        showToast('Narrative resubmitted successfully', 'success');
        close();
        renderNarrativesPage();
      } catch (err) {
        showToast(err.message || 'Failed to resubmit', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Resubmit';
      }
    });
  });
}
