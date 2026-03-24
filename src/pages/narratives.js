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
import { formatDate, formatDateTime, formatHoursDisplay, getTodayDate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { isHoliday } from '../lib/holidays.js';
import { sendEmailNotification, getDepartmentSupervisors } from '../lib/email-notifications.js';

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
  const today = getTodayDate();
  const todayHolidayInfo = await isHoliday(today);

  // Pre-load Quill in background for faster modal opening
  getQuill().catch(() => {});

  // Fetch intern's active tasks (not completed, or completed but not yet approved by supervisor)
  const { data: allTasks } = await supabase
    .from('tasks')
    .select('id, title, status, pending_status')
    .eq('assigned_to', profile.id);

  // Tasks available for narratives: not completed (or pending completion but not approved yet)
  const tasks = (allTasks || []).filter(t => t.status !== 'completed');

  // Fetch today's narratives
  const { data: todayNarratives } = await supabase
    .from('narratives')
    .select('*, task:tasks(title)')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .order('session', { ascending: true });

  // Fetch today's attendance for the combined view
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .maybeSingle();

  // Fetch recent narratives (past)
  const { data: recentNarratives } = await supabase
    .from('narratives')
    .select('*, task:tasks(title)')
    .eq('intern_id', profile.id)
    .neq('date', today)
    .order('date', { ascending: false })
    .limit(30);

  // Group recent narratives by date
  const groupedRecent = {};
  (recentNarratives || []).forEach(n => {
    if (!groupedRecent[n.date]) groupedRecent[n.date] = [];
    groupedRecent[n.date].push(n);
  });

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

    return `
      <div class="card mb-6">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-base font-bold text-neutral-900">Today's Daily Log</h3>
            <p class="text-sm text-neutral-500">${formatDate(today)}</p>
          </div>
          ${todayTask ? `<span class="badge-info">Task: ${todayTask.title}</span>` : ''}
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
            <p class="text-xs text-neutral-400 mb-2">Time In 1 → Time Out 1 ${morningHours !== null ? `• ${formatHoursDisplay(morningHours)}` : ''}</p>
            ${morningNarrative ? `
              <div class="prose prose-sm text-neutral-700 text-sm">${morningNarrative.content}</div>
              ${morningNarrative.hours ? `<p class="text-xs text-neutral-400 mt-2">Hours: ${formatHoursDisplay(morningNarrative.hours)}</p>` : ''}
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
            <p class="text-xs text-neutral-400 mb-2">Time In 2 → Time Out 2 ${afternoonHours !== null ? `• ${formatHoursDisplay(afternoonHours)}` : ''}</p>
            ${afternoonNarrative ? `
              <div class="prose prose-sm text-neutral-700 text-sm">${afternoonNarrative.content}</div>
              ${afternoonNarrative.hours ? `<p class="text-xs text-neutral-400 mt-2">Hours: ${formatHoursDisplay(afternoonNarrative.hours)}</p>` : ''}
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
              ${dayNarratives[0]?.task?.title ? `<span class="badge-info">${dayNarratives[0].task.title}</span>` : ''}
              ${dayNarratives.some(n => n.is_late_submission) ? '<span class="badge bg-warning-50 text-warning-600">Late</span>' : ''}
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${renderSessionCard(morning, 'Morning')}
            ${renderSessionCard(afternoon, 'Afternoon')}
          </div>
        </div>
      `;
    }).join('');
  }

  function renderSessionCard(narrative, label) {
    if (!narrative) {
      return `
        <div class="border border-neutral-200 rounded-lg p-3 bg-neutral-50">
          <p class="text-xs font-semibold text-neutral-500 mb-1">${label} Session</p>
          <p class="text-sm text-neutral-400 italic">Not submitted</p>
        </div>
      `;
    }

    const canEdit = narrative.status === 'rejected' || narrative.status === 'pending';

    return `
      <div class="border border-neutral-200 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <p class="text-xs font-semibold text-neutral-500">${label} Session</p>
          <div class="flex items-center gap-2">
            ${narrative.hours ? `<span class="text-xs text-neutral-400">${formatHoursDisplay(narrative.hours)}</span>` : ''}
            <span class="badge-${narrative.status === 'approved' ? 'approved' : narrative.status === 'rejected' ? 'rejected' : 'pending'}">${narrative.status}</span>
            ${narrative.edited_at ? '<span class="badge bg-info-100 text-info-700 text-xs">Edited</span>' : ''}
            ${canEdit ? `
              <button class="btn-sm btn-secondary edit-narrative-btn" data-narrative-id="${narrative.id}" title="Edit">
                ${icons.edit}
              </button>
            ` : ''}
          </div>
        </div>
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

    // New narrative button
    el.querySelector('#add-narrative-btn')?.addEventListener('click', () => {
      openNarrativeModal(tasks, profile, today);
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
            openEditNarrativeModal(narrative, tasks, profile);
          }
        });
      });
    }
  });
}

function calculateSessionHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const ms = new Date(timeOut) - new Date(timeIn);
  return Math.max(0, ms / (1000 * 60 * 60));
}

async function fetchAttendanceForDate(internId, date) {
  const { data } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', internId)
    .eq('date', date)
    .maybeSingle();
  return data;
}

async function fetchExistingNarrativesForDate(internId, date) {
  const { data } = await supabase
    .from('narratives')
    .select('id, session, status')
    .eq('intern_id', internId)
    .eq('date', date);
  return data || [];
}

function openNarrativeModal(tasks, profile, today) {
  const taskOptions = (tasks || []).map(t => `<option value="${t.id}">${t.title} (${t.status.replace('_', ' ')})</option>`).join('');

  createModal('New Daily Narrative', `
    <form id="narrative-form" class="space-y-4">
      <div>
        <label class="form-label">Date</label>
        <input type="date" id="narrative-date" class="form-input" value="${today}" max="${today}" required>
        <p id="late-warning" class="text-xs text-warning-500 mt-1 hidden">This narrative will be marked as a late submission.</p>
      </div>

      <!-- Session availability info -->
      <div id="session-info" class="hidden">
        <div class="p-3 bg-primary-50 rounded-lg">
          <p id="session-info-text" class="text-sm text-primary-700"></p>
        </div>
      </div>

      <!-- Morning Session -->
      <div id="morning-section" class="border border-neutral-200 rounded-lg p-4">
        <h4 class="text-sm font-semibold text-neutral-700 mb-3">Morning Session (Time In 1 → Time Out 1)
          <span id="morning-hours-badge" class="ml-2 text-xs font-normal text-neutral-400"></span>
        </h4>
        <div class="space-y-3">
          <div>
            <label class="form-label">Task</label>
            <select id="morning-task" class="form-input">
              <option value="">Choose a task...</option>
              ${taskOptions}
            </select>
          </div>
          <div>
            <label class="form-label">Narrative</label>
            <div id="morning-editor"></div>
            <p id="morning-char-count" class="text-xs text-neutral-400 mt-1 text-right">0 / 250</p>
          </div>
        </div>
        <p id="morning-existing" class="text-xs text-neutral-400 mt-2 hidden"></p>
      </div>

      <!-- Afternoon Session -->
      <div id="afternoon-section" class="border border-neutral-200 rounded-lg p-4">
        <h4 class="text-sm font-semibold text-neutral-700 mb-3">Afternoon Session (Time In 2 → Time Out 2)
          <span id="afternoon-hours-badge" class="ml-2 text-xs font-normal text-neutral-400"></span>
        </h4>
        <div class="space-y-3">
          <div>
            <label class="form-label">Task</label>
            <select id="afternoon-task" class="form-input">
              <option value="">Choose a task...</option>
              ${taskOptions}
            </select>
          </div>
          <div>
            <label class="form-label">Narrative</label>
            <div id="afternoon-editor"></div>
            <p id="afternoon-char-count" class="text-xs text-neutral-400 mt-1 text-right">0 / 250</p>
          </div>
        </div>
        <p id="afternoon-existing" class="text-xs text-neutral-400 mt-2 hidden"></p>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="narrative-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="narrative-submit" class="btn-primary">Submit Narratives</button>
      </div>
    </form>
  `, async (el, close) => {
    // Use pre-loaded Quill module
    const Quill = await getQuill();

    const quillConfig = {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    };

    const morningQuill = new Quill('#morning-editor', {
      ...quillConfig,
      placeholder: 'Describe your morning activities...',
    });

    const afternoonQuill = new Quill('#afternoon-editor', {
      ...quillConfig,
      placeholder: 'Describe your afternoon activities...',
    });

    const blockPaste = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      showToast('Pasting is not allowed. Please type your narrative.', 'error');
    };
    morningQuill.root.addEventListener('paste', blockPaste, true);
    afternoonQuill.root.addEventListener('paste', blockPaste, true);
    morningQuill.root.addEventListener('drop', blockPaste, true);
    afternoonQuill.root.addEventListener('drop', blockPaste, true);

    const CHAR_LIMIT = 250;

    function updateCharCount(quillInstance, counterId) {
      const len = quillInstance.getText().trim().length;
      const counter = el.querySelector(`#${counterId}`);
      if (!counter) return;
      counter.textContent = `${len} / ${CHAR_LIMIT}`;
      counter.classList.toggle('text-danger-500', len > CHAR_LIMIT);
      counter.classList.toggle('text-neutral-400', len <= CHAR_LIMIT);
    }

    morningQuill.on('text-change', () => {
      const text = morningQuill.getText();
      if (text.length - 1 > CHAR_LIMIT) {
        morningQuill.deleteText(CHAR_LIMIT, text.length);
      }
      updateCharCount(morningQuill, 'morning-char-count');
      scheduleDraftSave();
    });

    afternoonQuill.on('text-change', () => {
      const text = afternoonQuill.getText();
      if (text.length - 1 > CHAR_LIMIT) {
        afternoonQuill.deleteText(CHAR_LIMIT, text.length);
      }
      updateCharCount(afternoonQuill, 'afternoon-char-count');
      scheduleDraftSave();
    });

    let currentAttendance = null;
    let morningHours = 0;
    let afternoonHours = 0;
    let existingNarratives = [];
    const draftStorageKey = `narrative_draft_${profile.id}`;
    const draftVersion = 1;
    let draftSaveTimer = null;

    function hasSelectOption(selectEl, value) {
      return !!selectEl.querySelector(`option[value="${value}"]`);
    }

    function getDraftPayload() {
      return {
        version: draftVersion,
        date: el.querySelector('#narrative-date').value,
        morningTaskId: el.querySelector('#morning-task').value || null,
        afternoonTaskId: el.querySelector('#afternoon-task').value || null,
        morningContent: morningQuill.root.innerHTML,
        afternoonContent: afternoonQuill.root.innerHTML,
      };
    }

    function saveDraft() {
      try {
        localStorage.setItem(draftStorageKey, JSON.stringify(getDraftPayload()));
      } catch {
        // Ignore storage errors (e.g. browser storage blocked/full)
      }
    }

    function scheduleDraftSave() {
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(saveDraft, 250);
    }

    function readDraft() {
      try {
        const raw = localStorage.getItem(draftStorageKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.version !== draftVersion) return null;
        return parsed;
      } catch {
        return null;
      }
    }

    function clearDraft() {
      if (draftSaveTimer) clearTimeout(draftSaveTimer);
      localStorage.removeItem(draftStorageKey);
    }

    function restoreDraft() {
      const draft = readDraft();
      if (!draft) return false;

      const dateInput = el.querySelector('#narrative-date');
      const morningTaskSelect = el.querySelector('#morning-task');
      const afternoonTaskSelect = el.querySelector('#afternoon-task');
      const restoredDate = draft.date && draft.date <= today ? draft.date : today;

      dateInput.value = restoredDate;

      if (draft.morningTaskId && hasSelectOption(morningTaskSelect, draft.morningTaskId)) {
        morningTaskSelect.value = draft.morningTaskId;
      }

      if (draft.afternoonTaskId && hasSelectOption(afternoonTaskSelect, draft.afternoonTaskId)) {
        afternoonTaskSelect.value = draft.afternoonTaskId;
      }

      if (typeof draft.morningContent === 'string') {
        morningQuill.root.innerHTML = draft.morningContent;
      }

      if (typeof draft.afternoonContent === 'string') {
        afternoonQuill.root.innerHTML = draft.afternoonContent;
      }

      updateCharCount(morningQuill, 'morning-char-count');
      updateCharCount(afternoonQuill, 'afternoon-char-count');

      return true;
    }

    // Update session info and hours when date changes
    async function updateSessionInfo() {
      const selectedDate = el.querySelector('#narrative-date').value;
      const isLate = selectedDate < today;

      // Show/hide late warning
      el.querySelector('#late-warning').classList.toggle('hidden', !isLate);

      // Check if the selected date is a holiday
      const selectedHolidayInfo = await isHoliday(selectedDate);
      if (selectedHolidayInfo.isHoliday) {
        const sessionInfo = el.querySelector('#session-info');
        el.querySelector('#session-info-text').textContent = `${formatDate(selectedDate)} is a holiday (${selectedHolidayInfo.name}). You cannot submit narratives for this date.`;
        sessionInfo.classList.remove('hidden');
        el.querySelector('#narrative-submit').disabled = true;

        // Disable both session editors
        morningQuill.enable(false);
        afternoonQuill.enable(false);
        el.querySelector('#morning-task').disabled = true;
        el.querySelector('#afternoon-task').disabled = true;
        el.querySelector('#morning-section').classList.add('opacity-50');
        el.querySelector('#afternoon-section').classList.add('opacity-50');
        return;
      }

      // Fetch attendance for selected date
      currentAttendance = await fetchAttendanceForDate(profile.id, selectedDate);

      // Fetch existing narratives for selected date
      existingNarratives = await fetchExistingNarrativesForDate(profile.id, selectedDate);

      // Calculate session hours
      morningHours = 0;
      afternoonHours = 0;

      if (currentAttendance) {
        if (currentAttendance.time_in_1 && currentAttendance.time_out_1) {
          morningHours = calculateSessionHours(currentAttendance.time_in_1, currentAttendance.time_out_1);
        }
        if (currentAttendance.time_in_2 && currentAttendance.time_out_2) {
          afternoonHours = calculateSessionHours(currentAttendance.time_in_2, currentAttendance.time_out_2);
        }
      }

      // Update hours badges
      el.querySelector('#morning-hours-badge').textContent = morningHours > 0
        ? `(${formatHoursDisplay(morningHours)})`
        : '(No attendance recorded)';

      el.querySelector('#afternoon-hours-badge').textContent = afternoonHours > 0
        ? `(${formatHoursDisplay(afternoonHours)})`
        : '(No attendance recorded)';

      // Check existing narratives and disable already-submitted sessions
      const hasMorning = existingNarratives.some(n => n.session === 'morning');
      const hasAfternoon = existingNarratives.some(n => n.session === 'afternoon');

      const morningSection = el.querySelector('#morning-section');
      const afternoonSection = el.querySelector('#afternoon-section');
      const morningExisting = el.querySelector('#morning-existing');
      const afternoonExisting = el.querySelector('#afternoon-existing');

      const morningTaskSelect = el.querySelector('#morning-task');
      const afternoonTaskSelect = el.querySelector('#afternoon-task');

      if (hasMorning) {
        morningQuill.enable(false);
        morningTaskSelect.disabled = true;
        morningExisting.textContent = 'Morning narrative already submitted for this date.';
        morningExisting.classList.remove('hidden');
        morningSection.classList.add('opacity-50');
      } else {
        morningQuill.enable(true);
        morningTaskSelect.disabled = false;
        morningExisting.classList.add('hidden');
        morningSection.classList.remove('opacity-50');
      }

      if (hasAfternoon) {
        afternoonQuill.enable(false);
        afternoonTaskSelect.disabled = true;
        afternoonExisting.textContent = 'Afternoon narrative already submitted for this date.';
        afternoonExisting.classList.remove('hidden');
        afternoonSection.classList.add('opacity-50');
      } else {
        afternoonQuill.enable(true);
        afternoonTaskSelect.disabled = false;
        afternoonExisting.classList.add('hidden');
        afternoonSection.classList.remove('opacity-50');
      }

      // Show info if both sessions are already submitted
      const sessionInfo = el.querySelector('#session-info');
      if (hasMorning && hasAfternoon) {
        el.querySelector('#session-info-text').textContent = 'Both sessions already have narratives for this date. Choose a different date.';
        sessionInfo.classList.remove('hidden');
        el.querySelector('#narrative-submit').disabled = true;
      } else {
        sessionInfo.classList.add('hidden');
        el.querySelector('#narrative-submit').disabled = false;
      }
    }

    // Restore any saved draft first, then update session availability state
    const draftRestored = restoreDraft();

    // Initialize session info
    await updateSessionInfo();
    if (draftRestored) {
      showToast('Draft restored. You can continue editing your narrative.', 'info');
    }

    // Listen for date changes
    el.querySelector('#narrative-date').addEventListener('change', async () => {
      await updateSessionInfo();
      scheduleDraftSave();
    });
    el.querySelector('#morning-task').addEventListener('change', scheduleDraftSave);
    el.querySelector('#afternoon-task').addEventListener('change', scheduleDraftSave);

    el.querySelector('#narrative-cancel').addEventListener('click', close);

    el.querySelector('#narrative-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const morningTaskId = el.querySelector('#morning-task').value;
      const afternoonTaskId = el.querySelector('#afternoon-task').value;
      const selectedDate = el.querySelector('#narrative-date').value;
      const isLate = selectedDate < today;

      // Holiday guard (defense in depth)
      const submitHolidayCheck = await isHoliday(selectedDate);
      if (submitHolidayCheck.isHoliday) {
        showToast(`Cannot submit narrative for ${formatDate(selectedDate)} — it is a holiday (${submitHolidayCheck.name})`, 'error');
        return;
      }

      const hasMorning = existingNarratives.some(n => n.session === 'morning');
      const hasAfternoon = existingNarratives.some(n => n.session === 'afternoon');

      const morningContent = !hasMorning ? morningQuill.root.innerHTML : null;
      const afternoonContent = !hasAfternoon ? afternoonQuill.root.innerHTML : null;

      const morningText = !hasMorning ? morningQuill.getText().trim() : '';
      const afternoonText = !hasAfternoon ? afternoonQuill.getText().trim() : '';

      // Validate at least one session has content
      if (morningText.length === 0 && afternoonText.length === 0) {
        showToast('Please fill in at least one session narrative', 'error');
        return;
      }

      // Validate task selection for sessions that have content
      if (morningText.length > 0 && !morningTaskId) {
        showToast('Please select a task for the morning session', 'error');
        return;
      }
      if (afternoonText.length > 0 && !afternoonTaskId) {
        showToast('Please select a task for the afternoon session', 'error');
        return;
      }

      // Validate minimum length
      if (morningText.length > 0 && morningText.length < 10) {
        showToast('Morning narrative must be at least 10 characters', 'error');
        return;
      }
      if (afternoonText.length > 0 && afternoonText.length < 10) {
        showToast('Afternoon narrative must be at least 10 characters', 'error');
        return;
      }

      const submitBtn = el.querySelector('#narrative-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const narrativesToInsert = [];

        if (morningText.length >= 10) {
          narrativesToInsert.push({
            intern_id: profile.id,
            task_id: morningTaskId,
            date: selectedDate,
            session: 'morning',
            content: morningContent,
            hours: morningHours,
            is_late_submission: isLate,
            supervisor_id: profile.supervisor_id,
          });
        }

        if (afternoonText.length >= 10) {
          narrativesToInsert.push({
            intern_id: profile.id,
            task_id: afternoonTaskId,
            date: selectedDate,
            session: 'afternoon',
            content: afternoonContent,
            hours: afternoonHours,
            is_late_submission: isLate,
            supervisor_id: profile.supervisor_id,
          });
        }

        const { data, error } = await supabase
          .from('narratives')
          .insert(narrativesToInsert)
          .select();

        if (error) throw error;

        // Create approval entries and notifications for each narrative
        // Fetch admins once for bulk notification
        const { data: adminsForNotif } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .eq('is_active', true);

        for (const narrative of data) {
          if (profile.supervisor_id) {
            await supabase.from('approvals').insert({
              type: 'narrative',
              entity_id: narrative.id,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
            });

            // Get all supervisors in the intern's department for multi-supervisor notifications
            const deptSupervisors = await getDepartmentSupervisors(profile.id);
            const deptSupervisorIds = deptSupervisors.map(s => s.id);

            // Notify all department supervisors
            if (deptSupervisors && deptSupervisors.length > 0) {
              // Create notification records for all department supervisors
              const supervisorNotifs = deptSupervisors.map(s => ({
                user_id: s.id,
                type: 'pending_approval',
                title: 'Narrative Pending Review',
                message: `${profile.full_name} submitted a ${narrative.session} narrative for ${formatDate(selectedDate)}${isLate ? ' (late submission)' : ''}`,
                entity_type: 'narrative',
                entity_id: narrative.id,
              }));
              await supabase.from('notifications').insert(supervisorNotifs);

              // Email template
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                      .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                      .badge { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-left: 8px; }
                      .late-badge { background: #ef4444; }
                      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>Narrative Pending Review</h1>
                      </div>
                      <div class="content">
                        <p><strong>${profile.full_name}</strong> submitted a <strong>${narrative.session === 'morning' ? 'Morning' : 'Afternoon'}</strong> narrative for <strong>${formatDate(selectedDate)}</strong>${isLate ? ' <span class="badge late-badge">LATE SUBMISSION</span>' : ''}</p>
                        <p>The narrative is awaiting your review and approval.</p>
                        <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                      </div>
                      <div class="footer">
                        <p>This is an automated notification. Please do not reply to this email.</p>
                      </div>
                    </div>
                  </body>
                </html>
              `;

              // Send email to each supervisor
              deptSupervisors.forEach(supervisor => {
                if (supervisor?.email) {
                  sendEmailNotification(
                    supervisor.email,
                    `Narrative Pending Review - ${profile.full_name} (${narrative.session === 'morning' ? 'Morning' : 'Afternoon'})`,
                    emailHtml
                  ).catch(err => console.error('Failed to send narrative email to ' + supervisor.email + ':', err));
                }
              });
            }

            // Also notify all active admins (exclude department supervisors to avoid duplicates)
            if (adminsForNotif && adminsForNotif.length > 0) {
              const adminNotifs = adminsForNotif
                .filter(a => !deptSupervisorIds.includes(a.id))  // Exclude department supervisors
                .map(a => ({
                  user_id: a.id,
                  type: 'pending_approval',
                  title: 'Narrative Pending Review',
                  message: `${profile.full_name} submitted a ${narrative.session} narrative for ${formatDate(selectedDate)}${isLate ? ' (late submission)' : ''}`,
                  entity_type: 'narrative',
                  entity_id: narrative.id,
                }));
              if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);

              // Send email notifications to admins (exclude department supervisors)
              for (const admin of adminsForNotif) {
                if (!deptSupervisorIds.includes(admin.id)) {  // Exclude department supervisors
                  const { data: adminProfile } = await supabase
                    .from('profiles')
                    .select('full_name, email')
                    .eq('id', admin.id)
                    .single();

                  if (adminProfile?.email) {
                    const emailHtml = `
                      <!DOCTYPE html>
                      <html>
                        <head>
                          <style>
                            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                            .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                            .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                            .badge { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-left: 8px; }
                            .late-badge { background: #ef4444; }
                            .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                          </style>
                        </head>
                        <body>
                          <div class="container">
                            <div class="header">
                              <h1>Narrative Pending Review</h1>
                            </div>
                            <div class="content">
                              <p><strong>${profile.full_name}</strong> submitted a <strong>${narrative.session === 'morning' ? 'Morning' : 'Afternoon'}</strong> narrative for <strong>${formatDate(selectedDate)}</strong>${isLate ? ' <span class="badge late-badge">LATE SUBMISSION</span>' : ''}</p>
                              <p>The narrative is awaiting review and approval.</p>
                              <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                            </div>
                            <div class="footer">
                              <p>This is an automated notification. Please do not reply to this email.</p>
                            </div>
                          </div>
                        </body>
                      </html>
                    `;
                    sendEmailNotification(
                      adminProfile.email,
                      `Narrative Pending Review - ${profile.full_name} (${narrative.session === 'morning' ? 'Morning' : 'Afternoon'})`,
                      emailHtml
                    ).catch(err => console.error('Failed to send admin narrative email to ' + adminProfile.email + ':', err));
                  }
                }
              }
            }

          await logAudit('narrative.submitted', 'narrative', narrative.id, {
            task_id: narrative.task_id,
            session: narrative.session,
            is_late: isLate,
          });
          }
        }

        showToast(`${data.length} narrative${data.length > 1 ? 's' : ''} submitted successfully`, 'success');
        clearDraft();
        close();
        renderNarrativesPage();
      } catch (err) {
        showToast(err.message || 'Failed to submit narrative', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Narratives';
      }
    });
  }, '/narratives');
}

function openEditNarrativeModal(narrative, tasks, profile) {
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
        ${narrative.hours ? `
          <div>
            <label class="form-label">Hours</label>
            <p class="text-sm text-neutral-600">${formatHoursDisplay(narrative.hours)}</p>
          </div>
        ` : ''}
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
        <p id="edit-char-count" class="text-xs text-neutral-400 mt-1 text-right">0 / 250</p>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-submit" class="btn-primary">Resubmit</button>
      </div>
    </form>
  `, async (el, close) => {
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

    const CHAR_LIMIT = 250;
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
