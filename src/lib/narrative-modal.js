/**
 * Shared Narrative Modal Library
 * Provides a reusable narrative modal function for both attendance.js and narratives.js
 * Implements database-backed draft storage with localStorage fallback.
 */
import { supabase } from './supabase.js';
import { showToast } from './toast.js';
import { logAudit } from './audit.js';
import { formatDate, formatHoursDisplay, getTodayDate } from './utils.js';
import { createModal } from './component.js';
import { isHoliday } from './holidays.js';
import { sendEmailNotification, getDepartmentSupervisors } from './email-notifications.js';

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

// Pre-load Quill when module is imported
getQuill().catch(() => {});

/**
 * Calculate hours between two timestamps
 */
function calculateSessionHours(timeIn, timeOut) {
  if (!timeIn || !timeOut) return 0;
  const ms = new Date(timeOut) - new Date(timeIn);
  return Math.max(0, ms / (1000 * 60 * 60));
}

/**
 * Fetch attendance record for a specific date
 */
async function fetchAttendanceForDate(internId, date) {
  const { data } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', internId)
    .eq('date', date)
    .maybeSingle();
  return data;
}

/**
 * Fetch existing narratives for a date (excluding drafts by default)
 */
async function fetchExistingNarrativesForDate(internId, date, includeDrafts = false) {
  let query = supabase
    .from('narratives')
    .select('id, session, status')
    .eq('intern_id', internId)
    .eq('date', date);

  if (!includeDrafts) {
    query = query.neq('status', 'draft');
  }

  const { data } = await query;
  return data || [];
}

/**
 * Load draft from localStorage
 */
async function loadDraft(internId, date, session) {
  try {
    const key = `narrative_draft_${internId}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || parsed.version !== 1 || parsed.date !== date) return null;

    const contentKey = session === 'morning' ? 'morningContent' : 'afternoonContent';
    const taskKey = session === 'morning' ? 'morningTaskId' : 'afternoonTaskId';

    if (parsed[contentKey] && parsed[contentKey] !== '<p><br></p>') {
      return {
        source: 'localStorage',
        content: parsed[contentKey],
        taskId: parsed[taskKey],
      };
    }
  } catch {
    // Ignore localStorage errors
  }

  return null;
}

/**
 * Save draft to localStorage only
 */
function saveDraftToLocalStorage(internId, date, session, content, taskId) {
  try {
    const key = `narrative_draft_${internId}`;
    const contentKey = session === 'morning' ? 'morningContent' : 'afternoonContent';
    const taskKey = session === 'morning' ? 'morningTaskId' : 'afternoonTaskId';

    const existing = localStorage.getItem(key);
    const parsed = existing ? JSON.parse(existing) : { version: 1, date };

    parsed[contentKey] = content;
    parsed[taskKey] = taskId;
    parsed.date = date;
    parsed.version = 1;

    localStorage.setItem(key, JSON.stringify(parsed));
  } catch (err) {
    console.error('Failed to save to localStorage:', err);
  }
}

/**
 * Delete draft from localStorage
 */
function clearSessionDraft(internId, date, session) {
  try {
    const key = `narrative_draft_${internId}`;
    const existing = localStorage.getItem(key);
    if (!existing) return;

    const parsed = JSON.parse(existing);
    const contentKey = session === 'morning' ? 'morningContent' : 'afternoonContent';
    const taskKey = session === 'morning' ? 'morningTaskId' : 'afternoonTaskId';

    delete parsed[contentKey];
    delete parsed[taskKey];

    localStorage.setItem(key, JSON.stringify(parsed));
  } catch (err) {
    console.error('Failed to delete localStorage draft:', err);
  }
}

/**
 * Delete all drafts for a date
 */
async function clearDrafts(internId, date) {
  try {
    localStorage.removeItem(`narrative_draft_${internId}`);
  } catch {
    // Ignore
  }
}

/**
 * Fetch system setting for past date narratives
 */
async function getAllowPastDateNarratives() {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'allow_past_date_narratives')
    .maybeSingle();

  return data?.value?.enabled === true;
}

/**
 * Open the narrative modal
 * @param {Object} options - Modal options
 * @param {Array} options.tasks - Available tasks for dropdown
 * @param {Object} options.profile - Current user profile
 * @param {string|null} options.fixedDate - Date to lock (from attendance record)
 * @param {boolean} options.allowDateChange - Whether to show date picker
 * @param {boolean} options.forceSubmission - If true, hide "Cancel" button
 * @param {Function} options.onComplete - Callback after successful submission
 */
export async function openNarrativeModal(options) {
  const {
    tasks,
    profile,
    fixedDate = null,
    allowDateChange = true,
    forceSubmission = false,
    onComplete = () => {},
  } = options;

  const today = getTodayDate();
  const selectedDate = fixedDate || today;

  // Check if admin allows past date selection
  const canSelectPastDates = await getAllowPastDateNarratives();

  const taskOptions = (tasks || []).map(t => {
    const now = new Date();
    let label = t.title;

    if (t.status === 'completed' && t.approved_at) {
      label = `${t.title} (completed)`;
    } else {
      label = `${t.title} (${t.status.replace('_', ' ')})`;
    }

    return `<option value="${t.id}">${label}</option>`;
  }).join('');

  const dateInputHtml = allowDateChange && canSelectPastDates
    ? `<input type="date" id="narrative-date" class="form-input" value="${selectedDate}" max="${today}" required>`
    : `<input type="date" id="narrative-date" class="form-input bg-neutral-100" value="${selectedDate}" readonly>
       <p class="text-xs text-neutral-500 mt-1">Date is set to today based on your time-out.</p>`;

  createModal('Daily Narrative', `
    <form id="narrative-form" class="space-y-4">
      <!-- Important: Draft Preservation Notice
      <div class="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2"> 
        <svg class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4v2m0 4v2M7.08 6.47a9 9 0 1 1 9.84 0"></path>
        </svg>
        <div>
          <p class="text-sm font-semibold text-amber-900 mb-1">Draft Preservation</p>
          <p class="text-xs text-amber-800">
            Your narrative drafts are saved locally in your browser. <strong>Do not clear your browser cache or cookies</strong> or you will lose unsaved drafts. Always submit your narratives before clearing browser data.
          </p>
        </div>
      </div>  -->

      <div>
        <label class="form-label">Date</label>
        ${dateInputHtml}
        <p id="late-warning" class="text-xs text-warning-500 mt-1 hidden">This narrative will be marked as a late submission.</p>
      </div>

      <!-- Session availability info -->
      <div id="session-info" class="hidden">
        <div class="p-3 bg-primary-50 rounded-lg">
          <p id="session-info-text" class="text-sm text-primary-700"></p>
        </div>
      </div>

      <!-- Draft restored indicator -->
      <div id="draft-restored-banner" class="hidden p-3 bg-info-50 border border-info-200 rounded-lg">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-info-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
          </svg>
          <p class="text-sm text-info-700">Draft restored. Your previous work has been loaded.</p>
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
        <div id="morning-draft-saving" class="text-xs text-neutral-400 mt-1 hidden">
          <span class="inline-flex items-center gap-1">
            <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Saving draft...
          </span>
        </div>
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
        <div id="afternoon-draft-saving" class="text-xs text-neutral-400 mt-1 hidden">
          <span class="inline-flex items-center gap-1">
            <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Saving draft...
          </span>
        </div>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        ${forceSubmission ? '' : '<button type="button" id="narrative-cancel" class="btn-secondary">Cancel</button>'}
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

    // Block paste functionality
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

    let currentAttendance = null;
    let morningHours = 0;
    let afternoonHours = 0;
    let existingNarratives = [];

    // Draft save timers
    let morningDraftTimer = null;
    let afternoonDraftTimer = null;

    function hasSelectOption(selectEl, value) {
      return !!selectEl.querySelector(`option[value="${value}"]`);
    }

    // Debounced draft save to localStorage
    async function scheduleMorningSave() {
      if (morningDraftTimer) clearTimeout(morningDraftTimer);
      morningDraftTimer = setTimeout(async () => {
        const savingEl = el.querySelector('#morning-draft-saving');
        if (savingEl) savingEl.classList.remove('hidden');

        try {
          const content = morningQuill.root.innerHTML;
          const taskId = el.querySelector('#morning-task').value;
          const date = el.querySelector('#narrative-date').value;
          const hasContent = morningQuill.getText().trim().length > 0;

          if (hasContent) {
            // Save to localStorage if has content
            saveDraftToLocalStorage(profile.id, date, 'morning', content, taskId);
          } else {
            // Delete draft if content is empty (user deleted everything)
            clearSessionDraft(profile.id, date, 'morning');
          }
        } catch (err) {
          console.error('Failed to save morning draft:', err);
        } finally {
          if (savingEl) savingEl.classList.add('hidden');
        }
      }, 250);
    }

    async function scheduleAfternoonSave() {
      if (afternoonDraftTimer) clearTimeout(afternoonDraftTimer);
      afternoonDraftTimer = setTimeout(async () => {
        const savingEl = el.querySelector('#afternoon-draft-saving');
        if (savingEl) savingEl.classList.remove('hidden');

        try {
          const content = afternoonQuill.root.innerHTML;
          const taskId = el.querySelector('#afternoon-task').value;
          const date = el.querySelector('#narrative-date').value;
          const hasContent = afternoonQuill.getText().trim().length > 0;

          if (hasContent) {
            // Save to localStorage if has content
            saveDraftToLocalStorage(profile.id, date, 'afternoon', content, taskId);
          } else {
            // Delete draft if content is empty (user deleted everything)
            clearSessionDraft(profile.id, date, 'afternoon');
          }
        } catch (err) {
          console.error('Failed to save afternoon draft:', err);
        } finally {
          if (savingEl) savingEl.classList.add('hidden');
        }
      }, 250);
    }

    morningQuill.on('text-change', () => {
      const text = morningQuill.getText();
      if (text.length - 1 > CHAR_LIMIT) {
        morningQuill.deleteText(CHAR_LIMIT, text.length);
      }
      updateCharCount(morningQuill, 'morning-char-count');
      scheduleMorningSave();
    });

    afternoonQuill.on('text-change', () => {
      const text = afternoonQuill.getText();
      if (text.length - 1 > CHAR_LIMIT) {
        afternoonQuill.deleteText(CHAR_LIMIT, text.length);
      }
      updateCharCount(afternoonQuill, 'afternoon-char-count');
      scheduleAfternoonSave();
    });

    // Update session info and hours when date changes
    async function updateSessionInfo() {
      const currentDate = el.querySelector('#narrative-date').value;
      const isLate = currentDate < today;

      // Show/hide late warning
      el.querySelector('#late-warning').classList.toggle('hidden', !isLate);

      // Check if the selected date is a holiday
      const selectedHolidayInfo = await isHoliday(currentDate);
      if (selectedHolidayInfo.isHoliday) {
        const sessionInfo = el.querySelector('#session-info');
        el.querySelector('#session-info-text').textContent = `${formatDate(currentDate)} is a holiday (${selectedHolidayInfo.name}). You cannot submit narratives for this date.`;
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
      currentAttendance = await fetchAttendanceForDate(profile.id, currentDate);

      // Fetch existing narratives for selected date (excluding drafts)
      existingNarratives = await fetchExistingNarrativesForDate(profile.id, currentDate, false);

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

    // Load drafts from database or localStorage
    async function loadDrafts() {
      const currentDate = el.querySelector('#narrative-date').value;
      const morningTaskSelect = el.querySelector('#morning-task');
      const afternoonTaskSelect = el.querySelector('#afternoon-task');

      let draftRestored = false;

      // Load morning draft
      const morningDraft = await loadDraft(profile.id, currentDate, 'morning');
      if (morningDraft && morningDraft.content) {
        morningQuill.root.innerHTML = morningDraft.content;
        if (morningDraft.taskId && hasSelectOption(morningTaskSelect, morningDraft.taskId)) {
          morningTaskSelect.value = morningDraft.taskId;
        }
        updateCharCount(morningQuill, 'morning-char-count');
        draftRestored = true;
      }

      // Load afternoon draft
      const afternoonDraft = await loadDraft(profile.id, currentDate, 'afternoon');
      if (afternoonDraft && afternoonDraft.content) {
        afternoonQuill.root.innerHTML = afternoonDraft.content;
        if (afternoonDraft.taskId && hasSelectOption(afternoonTaskSelect, afternoonDraft.taskId)) {
          afternoonTaskSelect.value = afternoonDraft.taskId;
        }
        updateCharCount(afternoonQuill, 'afternoon-char-count');
        draftRestored = true;
      }

      if (draftRestored) {
        el.querySelector('#draft-restored-banner').classList.remove('hidden');
      }
    }

    // Initialize
    await updateSessionInfo();
    await loadDrafts();

    // Listen for date changes (if date picker is enabled)
    const dateInput = el.querySelector('#narrative-date');
    if (!dateInput.readOnly) {
      dateInput.addEventListener('change', async () => {
        await updateSessionInfo();
        await loadDrafts();
      });
    }

    el.querySelector('#morning-task').addEventListener('change', scheduleMorningSave);
    el.querySelector('#afternoon-task').addEventListener('change', scheduleAfternoonSave);

    if (!forceSubmission) {
      el.querySelector('#narrative-cancel')?.addEventListener('click', close);
    }

    el.querySelector('#narrative-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const morningTaskId = el.querySelector('#morning-task').value;
      const afternoonTaskId = el.querySelector('#afternoon-task').value;
      const currentDate = el.querySelector('#narrative-date').value;
      const isLate = currentDate < today;

      // Holiday guard (defense in depth)
      const submitHolidayCheck = await isHoliday(currentDate);
      if (submitHolidayCheck.isHoliday) {
        showToast(`Cannot submit narrative for ${formatDate(currentDate)} — it is a holiday (${submitHolidayCheck.name})`, 'error');
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
            date: currentDate,
            session: 'morning',
            content: morningContent,
            hours: morningHours,
            is_late_submission: isLate,
            supervisor_id: profile.supervisor_id,
            status: 'pending',
          });
        }

        if (afternoonText.length >= 10) {
          narrativesToInsert.push({
            intern_id: profile.id,
            task_id: afternoonTaskId,
            date: currentDate,
            session: 'afternoon',
            content: afternoonContent,
            hours: afternoonHours,
            is_late_submission: isLate,
            supervisor_id: profile.supervisor_id,
            status: 'pending',
          });
        }

        const { data, error } = await supabase
          .from('narratives')
          .insert(narrativesToInsert)
          .select();

        if (error) throw error;

        // Narrative insert succeeded - now clear the draft
        clearDrafts(profile.id, currentDate);

        // Show success immediately - don't block on notifications/emails
        showToast(`${data.length} narrative${data.length > 1 ? 's' : ''} submitted successfully`, 'success');
        close();
        onComplete();

        // --- Background operations (non-blocking) ---
        // Fire these in background so user doesn't wait
        (async () => {
          try {
            // Batch: Get admins and supervisors once
            const [adminsResult, deptSupervisors] = await Promise.all([
              supabase.from('profiles').select('id').eq('role', 'admin').eq('is_active', true),
              getDepartmentSupervisors(profile.id),
            ]);
            const adminsForNotif = adminsResult.data || [];
            const deptSupervisorIds = deptSupervisors.map(s => s.id);

            // Batch: Collect all approvals to insert at once
            const approvalsToInsert = [];
            const allNotifications = [];

            for (const narrative of data) {
              if (profile.supervisor_id) {
                approvalsToInsert.push({
                  type: 'narrative',
                  entity_id: narrative.id,
                  intern_id: profile.id,
                  supervisor_id: profile.supervisor_id,
                });

                // Supervisor notifications
                if (deptSupervisors.length > 0) {
                  deptSupervisors.forEach(s => {
                    allNotifications.push({
                      user_id: s.id,
                      type: 'pending_approval',
                      title: 'Narrative Pending Review',
                      message: `${profile.full_name} submitted a ${narrative.session} narrative for ${formatDate(currentDate)}${isLate ? ' (late submission)' : ''}`,
                      entity_type: 'narrative',
                      entity_id: narrative.id,
                    });
                  });
                }

                // Admin notifications (exclude supervisors already notified)
                adminsForNotif
                  .filter(a => !deptSupervisorIds.includes(a.id))
                  .forEach(a => {
                    allNotifications.push({
                      user_id: a.id,
                      type: 'pending_approval',
                      title: 'Narrative Pending Review',
                      message: `${profile.full_name} submitted a ${narrative.session} narrative for ${formatDate(currentDate)}${isLate ? ' (late submission)' : ''}`,
                      entity_type: 'narrative',
                      entity_id: narrative.id,
                    });
                  });
              }
            }

            // Batch insert approvals and notifications in parallel
            const dbOps = [];
            if (approvalsToInsert.length > 0) {
              dbOps.push(supabase.from('approvals').insert(approvalsToInsert));
            }
            if (allNotifications.length > 0) {
              dbOps.push(supabase.from('notifications').insert(allNotifications));
            }
            await Promise.all(dbOps);

            // Send emails (fire-and-forget) and audit logs
            for (const narrative of data) {
              // Email to supervisors
              if (deptSupervisors.length > 0) {
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
                          <p><strong>${profile.full_name}</strong> submitted a <strong>${narrative.session === 'morning' ? 'Morning' : 'Afternoon'}</strong> narrative for <strong>${formatDate(currentDate)}</strong>${isLate ? ' <span class="badge late-badge">LATE SUBMISSION</span>' : ''}</p>
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

                deptSupervisors.forEach(supervisor => {
                  if (supervisor?.email) {
                    sendEmailNotification(
                      supervisor.email,
                      `Narrative Pending Review - ${profile.full_name} (${narrative.session === 'morning' ? 'Morning' : 'Afternoon'})`,
                      emailHtml
                    ).catch(err => console.error('Failed to send narrative email:', err));
                  }
                });
              }

              // Audit log (fire-and-forget)
              logAudit('narrative.submitted', 'narrative', narrative.id, {
                task_id: narrative.task_id,
                session: narrative.session,
                is_late: isLate,
              }).catch(err => console.error('Failed to log audit:', err));
            }
          } catch (bgErr) {
            console.error('Background notification error:', bgErr);
          }
        })();
      } catch (err) {
        showToast(err.message || 'Failed to submit narrative', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Narratives';
      }
    });
  }, { dismissible: !forceSubmission });
}

/**
 * Open the narrative prompt modal after time-out
 * @param {Object} options - Modal options
 * @param {string} options.date - The date of the time-out
 * @param {boolean} options.isEndOfDay - Whether this is end-of-day punch
 * @param {Object} options.profile - Current user profile
 * @param {Array} options.tasks - Available tasks
 * @param {Function} options.onComplete - Callback after completion
 */
export async function showNarrativePromptModal(options) {
  const { date, isEndOfDay, profile, tasks, onComplete = () => {} } = options;

  // Check if already submitted today
  const { data: existingNarratives } = await supabase
    .from('narratives')
    .select('session')
    .eq('intern_id', profile.id)
    .eq('date', date)
    .in('status', ['pending', 'approved', 'rejected']);

  const submittedCount = existingNarratives?.length || 0;

  // If both sessions already submitted, don't show prompt
  if (submittedCount >= 2) {
    return;
  }

  const title = isEndOfDay
    ? 'Submit Your Daily Narrative'
    : 'Lunch Break - Narrative Reminder';

  const message = isEndOfDay
    ? 'Before you go, please submit your daily narrative for today.'
    : 'You can fill your morning narrative now, or submit both sessions at the end of the day.';

  const modalContent = `
    <div class="text-center py-4">
      <div class="w-16 h-16 mx-auto mb-4 bg-primary-100 rounded-full flex items-center justify-center">
        <svg class="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
        </svg>
      </div>
      <h3 class="text-lg font-semibold text-neutral-900 mb-2">${title}</h3>
      <p class="text-sm text-neutral-600 mb-6">${message}</p>

      ${submittedCount === 1 ? `
        <p class="text-xs text-info-600 mb-4">Note: You have already submitted one narrative session today.</p>
      ` : ''}

      <div class="flex justify-center gap-3">
        ${isEndOfDay ? '' : `
          <button id="prompt-later" class="btn-secondary">
            Do it Later
          </button>
        `}
        <button id="prompt-now" class="btn-primary">
          Fill Narrative Now
        </button>
      </div>
    </div>
  `;

  createModal('', modalContent, (el, close) => {
    el.querySelector('#prompt-later')?.addEventListener('click', () => {
      showToast('Remember to submit your narrative before the end of the day!', 'info');
      close();
      // Call onComplete to reset button state and re-render page
      onComplete();
    });

    el.querySelector('#prompt-now').addEventListener('click', async () => {
      close();

      // Open the narrative modal
      await openNarrativeModal({
        tasks,
        profile,
        fixedDate: date,
        allowDateChange: false,
        forceSubmission: isEndOfDay,
        onComplete,
      });
    });
  }, { dismissible: false });
}
