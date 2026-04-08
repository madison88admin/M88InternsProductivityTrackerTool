/**
 * Login Briefing Modal
 * Displays important information for interns on first login:
 * - Pending approvals (attendance, narratives, tasks)
 * - Overdue tasks
 * - Action items
 *
 * Features:
 * - Checkbox to dismiss permanently (stored in localStorage)
 * - Quick action links to relevant pages
 */

import { supabase } from './supabase.js';
import { icons } from './icons.js';
import { createModal } from './component.js';
import { getTodayDate } from './utils.js';

/**
 * Check if briefing should be shown for this user
 * @param {string} userId
 * @returns {boolean}
 */
export function shouldShowBriefing(userId) {
  const dismissKey = `briefing_dismissed_${userId}`;
  return !localStorage.getItem(dismissKey);
}

/**
 * Mark briefing as dismissed for this user
 * @param {string} userId
 */
function dismissBriefing(userId) {
  const dismissKey = `briefing_dismissed_${userId}`;
  localStorage.setItem(dismissKey, JSON.stringify({
    dismissed: true,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Reset briefing dismissal (for testing or admin features)
 * @param {string} userId
 */
export function resetBriefingPreference(userId) {
  const dismissKey = `briefing_dismissed_${userId}`;
  localStorage.removeItem(dismissKey);
}

/**
 * Fetch briefing data for an intern
 * @param {string} internId
 * @returns {Promise<Object>}
 */
async function fetchBriefingData(internId) {
  const today = getTodayDate();

  const [
    pendingAttRes,
    pendingNarrRes,
    pendingTasksRes,
    overdueTasksRes,
  ] = await Promise.all([
    // Pending attendance approvals
    supabase
      .from('attendance_records')
      .select('id, date')
      .eq('intern_id', internId)
      .eq('status', 'pending')
      .order('date', { ascending: false })
      .limit(5),

    // Pending narrative approvals
    supabase
      .from('narratives')
      .select('id, date, session')
      .eq('intern_id', internId)
      .eq('status', 'pending')
      .order('date', { ascending: false })
      .limit(5),

    // Not started tasks (newly assigned)
    supabase
      .from('tasks')
      .select('id, title, due_date')
      .eq('assigned_to', internId)
      .eq('status', 'not_started')
      .eq('is_archived', false)
      .order('due_date', { ascending: true })
      .limit(5),

    // Overdue tasks
    supabase
      .from('tasks')
      .select('id, title, due_date')
      .eq('assigned_to', internId)
      .neq('status', 'completed')
      .eq('is_archived', false)
      .lt('due_date', today)
      .order('due_date', { ascending: true })
      .limit(5),
  ]);

  return {
    pendingAttendance: pendingAttRes.data || [],
    pendingNarratives: pendingNarrRes.data || [],
    notStartedTasks: pendingTasksRes.data || [],
    overdueTasks: overdueTasksRes.data || [],
  };
}

/**
 * Open the login briefing modal
 * @param {string} internId
 * @param {string} internName
 */
export async function openLoginBriefingModal(internId, internName) {
  try {
    const briefingData = await fetchBriefingData(internId);

    let hasAlerts = false;
    const alerts = [];

    // Check each data category for alerts
    if (briefingData.pendingAttendance.length > 0) {
      alerts.push({
        type: 'attendance',
        count: briefingData.pendingAttendance.count || briefingData.pendingAttendance.length,
        label: `${briefingData.pendingAttendance.length} pending attendance record${briefingData.pendingAttendance.length !== 1 ? 's' : ''}`,
        link: '/attendance',
        icon: icons.clock,
      });
      hasAlerts = true;
    }

    if (briefingData.pendingNarratives.length > 0) {
      alerts.push({
        type: 'narrative',
        count: briefingData.pendingNarratives.length,
        label: `${briefingData.pendingNarratives.length} pending narrative${briefingData.pendingNarratives.length !== 1 ? 's' : ''}`,
        link: '/narratives',
        icon: icons.narrative,
      });
      hasAlerts = true;
    }

    if (briefingData.overdueTasks.length > 0) {
      alerts.push({
        type: 'overdue',
        count: briefingData.overdueTasks.length,
        label: `${briefingData.overdueTasks.length} overdue task${briefingData.overdueTasks.length !== 1 ? 's' : ''}`,
        link: '/my-tasks',
        icon: icons.tasks,
        severity: 'high',
      });
      hasAlerts = true;
    }

    if (briefingData.notStartedTasks.length > 0) {
      alerts.push({
        type: 'new-tasks',
        count: briefingData.notStartedTasks.length,
        label: `${briefingData.notStartedTasks.length} new task${briefingData.notStartedTasks.length !== 1 ? 's' : ''} to start`,
        link: '/my-tasks',
        icon: icons.tasks,
      });
      hasAlerts = true;
    }

    // Build modal content
    const modalBody = `
      <div class="space-y-6">
        <!-- Greeting -->
        <div class="space-y-2">
          <h4 class="text-base font-bold text-neutral-900">Good day, ${internName || 'Intern'}!</h4>
          <p class="text-sm text-neutral-600">Here are your latest updates:</p>
        </div>

        <!-- Alerts Section -->
        ${hasAlerts ? `
          <div class="space-y-2.5">
            <p class="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Items Requiring Attention</p>
            <div class="space-y-2">
              ${alerts.map(alert => `
                <button type="button" class="briefing-nav w-full text-left flex items-start gap-3 p-3 rounded-lg transition-all hover:bg-neutral-50" style="border: 1px solid var(--color-neutral-100); cursor: pointer;" data-route="${alert.link}">
                  <div class="w-8 h-8 rounded-md flex items-center justify-center shrink-0" style="background: ${
                    alert.severity === 'high'
                      ? 'var(--color-danger-50); color: var(--color-danger-600);'
                      : 'var(--color-primary-50); color: var(--color-primary-600);'
                  }">
                    ${alert.icon}
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-neutral-900">${alert.label}</p>
                    <p class="text-xs text-neutral-500 mt-0.5">Click to review</p>
                  </div>
                  <div class="text-lg font-bold ${
                    alert.severity === 'high'
                      ? 'text-danger-600'
                      : 'text-primary-600'
                  } shrink-0">${alert.count}</div>
                </button>
              `).join('')}
            </div>
          </div>
        ` : `
          <div class="p-4 rounded-lg" style="background: var(--color-success-50); border: 1px solid var(--color-success-200);">
            <div class="flex items-start gap-3">
              <div class="text-2xl" style="color: var(--color-success-600);">✓</div>
              <div>
                <p class="text-sm font-semibold text-neutral-900">All caught up!</p>
                <p class="text-xs text-neutral-600 mt-1">You have no pending items. Keep up the great work!</p>
              </div>
            </div>
          </div>
        `}

        <!-- Quick Links Section -->
        <div class="space-y-2.5">
          <p class="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Quick Actions</p>
          <div class="grid grid-cols-2 gap-2">
            <button type="button" class="briefing-nav text-left p-3 rounded-lg border transition-all hover:bg-neutral-50" style="border-color: var(--color-neutral-100);" data-route="/my-tasks">
              <div style="color: var(--color-warning-600); margin-bottom: 0.5rem;">${icons.tasks}</div>
              <p class="text-xs font-semibold text-neutral-900">My Tasks</p>
            </button>
            <button type="button" class="briefing-nav text-left p-3 rounded-lg border transition-all hover:bg-neutral-50" style="border-color: var(--color-neutral-100);" data-route="/narratives">
              <div style="color: var(--color-success-600); margin-bottom: 0.5rem;">${icons.narrative}</div>
              <p class="text-xs font-semibold text-neutral-900">Narratives</p>
            </button>
            <button type="button" class="briefing-nav text-left p-3 rounded-lg border transition-all hover:bg-neutral-50" style="border-color: var(--color-neutral-100);" data-route="/attendance">
              <div style="color: var(--color-primary-600); margin-bottom: 0.5rem;">${icons.clock}</div>
              <p class="text-xs font-semibold text-neutral-900">Attendance</p>
            </button>
            <button type="button" class="briefing-nav text-left p-3 rounded-lg border transition-all hover:bg-neutral-50" style="border-color: var(--color-neutral-100);" data-route="/my-allowance">
              <div style="color: var(--color-primary-600); margin-bottom: 0.5rem;">${icons.money}</div>
              <p class="text-xs font-semibold text-neutral-900">Allowance</p>
            </button>
          </div>
        </div>

        <!-- Checkbox Section -->
        <div class="space-y-3 pt-3" style="border-top: 1px solid var(--color-neutral-100);">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="briefing-dismiss-checkbox" class="w-4 h-4 rounded border-neutral-300 transition-colors">
            <span class="text-xs text-neutral-600 leading-tight">Don't show this briefing again on next login.</span>
          </label>
        </div>
      </div>
    `;

    createModal(
      '📋 System Updates for you',
      modalBody,
      (backdrop, closeModal) => {
        const dismissCheckbox = backdrop.querySelector('#briefing-dismiss-checkbox');
        const closeBtn = backdrop.querySelector('#modal-close');
        const navButtons = backdrop.querySelectorAll('.briefing-nav');

        // Persist preference immediately when the checkbox changes.
        dismissCheckbox?.addEventListener('change', () => {
          if (dismissCheckbox.checked) {
            dismissBriefing(internId);
          } else {
            resetBriefingPreference(internId);
          }
        });

        // Handle close button click
        if (closeBtn) {
          closeBtn.addEventListener('click', () => {
            if (dismissCheckbox?.checked) {
              dismissBriefing(internId);
            }
            closeModal();
          });
        }

        // Close modal before navigating so backdrop blur never gets stuck.
        navButtons.forEach((btn) => {
          btn.addEventListener('click', () => {
            const route = btn.getAttribute('data-route');
            if (!route) return;
            closeModal();
            window.location.hash = `#${route}`;
          });
        });

        // Handle any close (backdrop click)
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) {
            if (dismissCheckbox?.checked) {
              dismissBriefing(internId);
            }
            closeModal();
          }
        });
      },
      { dismissible: true }
    );

  } catch (err) {
    console.error('Failed to open login briefing modal:', err);
  }
}
