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

export async function renderNarrativesPage() {
  const profile = getProfile();
  const today = getTodayDate();

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
                <span class="badge-${morningNarrative.status === 'approved' ? 'approved' : morningNarrative.status === 'rejected' ? 'rejected' : 'pending'}">
                  ${morningNarrative.status}
                </span>
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
                <span class="badge-${afternoonNarrative.status === 'approved' ? 'approved' : afternoonNarrative.status === 'rejected' ? 'rejected' : 'pending'}">
                  ${afternoonNarrative.status}
                </span>
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

    const canEdit = narrative.status === 'rejected' || (narrative.status === 'pending' && narrative.date === today);

    return `
      <div class="border border-neutral-200 rounded-lg p-3">
        <div class="flex items-center justify-between mb-1">
          <p class="text-xs font-semibold text-neutral-500">${label} Session</p>
          <div class="flex items-center gap-2">
            ${narrative.hours ? `<span class="text-xs text-neutral-400">${formatHoursDisplay(narrative.hours)}</span>` : ''}
            <span class="badge-${narrative.status === 'approved' ? 'approved' : narrative.status === 'rejected' ? 'rejected' : 'pending'}">${narrative.status}</span>
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
      <button id="add-narrative-btn" class="btn-primary" ${(!tasks || tasks.length === 0) ? 'disabled title="No active tasks available"' : ''}>
        ${icons.plus}
        <span class="ml-2">New Narrative</span>
      </button>
    </div>

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
    // Initialize Quill editors
    const Quill = (await import('quill')).default;

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

    let currentAttendance = null;
    let morningHours = 0;
    let afternoonHours = 0;
    let existingNarratives = [];

    // Update session info and hours when date changes
    async function updateSessionInfo() {
      const selectedDate = el.querySelector('#narrative-date').value;
      const isLate = selectedDate < today;

      // Show/hide late warning
      el.querySelector('#late-warning').classList.toggle('hidden', !isLate);

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

    // Initialize session info
    await updateSessionInfo();

    // Listen for date changes
    el.querySelector('#narrative-date').addEventListener('change', updateSessionInfo);

    el.querySelector('#narrative-cancel').addEventListener('click', close);

    el.querySelector('#narrative-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const morningTaskId = el.querySelector('#morning-task').value;
      const afternoonTaskId = el.querySelector('#afternoon-task').value;
      const selectedDate = el.querySelector('#narrative-date').value;
      const isLate = selectedDate < today;

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

            await supabase.from('notifications').insert({
              user_id: profile.supervisor_id,
              type: 'pending_approval',
              title: 'Narrative Pending Review',
              message: `${profile.full_name} submitted a ${narrative.session} narrative for ${formatDate(selectedDate)}${isLate ? ' (late submission)' : ''}`,
              entity_type: 'narrative',
              entity_id: narrative.id,
            });
          }

          // Also notify all active admins
          if (adminsForNotif && adminsForNotif.length > 0) {
            const adminNotifs = adminsForNotif
              .filter(a => a.id !== profile.supervisor_id)
              .map(a => ({
                user_id: a.id,
                type: 'pending_approval',
                title: 'Narrative Pending Review',
                message: `${profile.full_name} submitted a ${narrative.session} narrative for ${formatDate(selectedDate)}${isLate ? ' (late submission)' : ''}`,
                entity_type: 'narrative',
                entity_id: narrative.id,
              }));
            if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);
          }

          await logAudit('narrative.submitted', 'narrative', narrative.id, {
            task_id: narrative.task_id,
            session: narrative.session,
            is_late: isLate,
          });
        }

        showToast(`${data.length} narrative${data.length > 1 ? 's' : ''} submitted successfully`, 'success');
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
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-submit" class="btn-primary">Resubmit</button>
      </div>
    </form>
  `, async (el, close) => {
    const Quill = (await import('quill')).default;
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
            comments: 'Resubmitted after rejection',
          });

          await supabase.from('notifications').insert({
            user_id: profile.supervisor_id,
            type: 'pending_approval',
            title: 'Narrative Resubmitted',
            message: `${profile.full_name} resubmitted a ${narrative.session} narrative for ${formatDate(narrative.date)}`,
            entity_type: 'narrative',
            entity_id: narrative.id,
          });
        }

        // Also notify all active admins
        const { data: adminsForResubmit } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .eq('is_active', true);

        if (adminsForResubmit && adminsForResubmit.length > 0) {
          const adminNotifs = adminsForResubmit
            .filter(a => a.id !== profile.supervisor_id)
            .map(a => ({
              user_id: a.id,
              type: 'pending_approval',
              title: 'Narrative Resubmitted',
              message: `${profile.full_name} resubmitted a ${narrative.session} narrative for ${formatDate(narrative.date)}`,
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
