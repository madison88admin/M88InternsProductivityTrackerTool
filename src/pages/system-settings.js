/**
 * System Settings Page (Admin)
 * Manage global system configuration.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';

export async function renderSystemSettingsPage() {
  const profile = getProfile();

  const { data: settings } = await supabase
    .from('system_settings')
    .select('*')
    .order('key');

  const settingsMap = {};
  (settings || []).forEach(s => { settingsMap[s.key] = s; });

  const workHours = settingsMap.work_hours?.value || {};
  const workStart = workHours.start || '08:00';
  const workEnd = workHours.end || '17:00';

  const attendanceRules = settingsMap.attendance_rules?.value || {};
  const lateThreshold = attendanceRules.late_threshold_minutes ?? 15;
  const requiredPunches = attendanceRules.required_punches ?? 4;

  // escalation_hours and data_retention_months may be stored as plain numbers (JSONB primitives)
  // or as objects { hours: N } / { months: N } — handle both.
  const escalationRaw = settingsMap.escalation_hours?.value;
  const escalationHours = (escalationRaw !== null && typeof escalationRaw === 'object')
    ? (escalationRaw.hours ?? 24)
    : (escalationRaw ?? 24);

  const retentionRaw = settingsMap.data_retention_months?.value;
  const retentionMonths = (retentionRaw !== null && typeof retentionRaw === 'object')
    ? (retentionRaw.months ?? 36)
    : (retentionRaw ?? 36);

  const internTaskSubmission = settingsMap.intern_task_submission?.value || {};
  const taskSubmissionEnabled = internTaskSubmission.enabled === true;

  // Security settings
  const forgotPasswordSettings = settingsMap.enable_forgot_password?.value || {};
  const forgotPasswordEnabled = forgotPasswordSettings.enabled !== false;

  const adminAccountSettings = settingsMap.enable_admin_account_creation?.value || {};
  const adminAccountEnabled = adminAccountSettings.enabled !== false;

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">System Settings</h1>
      <p class="page-subtitle">Configure global system parameters</p>
    </div>

    <form id="settings-form" class="space-y-6">
      <!-- Work Hours -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">${icons.clock} Work Hours</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Start Time</label>
            <input type="time" id="work-start" class="form-input" value="${workStart}" />
          </div>
          <div>
            <label class="form-label">End Time</label>
            <input type="time" id="work-end" class="form-input" value="${workEnd}" />
          </div>
        </div>
      </div>

      <!-- Attendance Rules -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">${icons.approval} Attendance Rules</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Late Threshold (minutes)</label>
            <input type="number" id="late-threshold" class="form-input" min="1" max="120" value="${lateThreshold}" />
            <p class="text-xs text-neutral-400 mt-1">Grace period after start time before marking as late</p>
          </div>
          <div>
            <label class="form-label">Required Punches Per Day</label>
            <input type="number" id="required-punches" class="form-input" min="2" max="4" value="${requiredPunches}" />
          </div>
        </div>
      </div>

      <!-- Escalation -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">${icons.alert} Approval Escalation</h3>
        <div>
          <label class="form-label">Escalate to Admin after (hours)</label>
          <input type="number" id="escalation-hours" class="form-input" min="1" max="168" value="${escalationHours}" />
          <p class="text-xs text-neutral-400 mt-1">Pending approvals older than this will trigger an Admin notification</p>
        </div>
      </div>

      <!-- Data Retention -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">${icons.calendar} Data Retention</h3>
        <div>
          <label class="form-label">Retention Period (months)</label>
          <input type="number" id="retention-months" class="form-input" min="6" max="120" value="${retentionMonths}" />
          <p class="text-xs text-neutral-400 mt-1">How long to keep historical records</p>
        </div>
      </div>

      <!-- Task Submission -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">${icons.tasks} Task Submission</h3>
        <label class="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" id="intern-task-submission" ${taskSubmissionEnabled ? 'checked' : ''} />
          <div>
            <p class="text-sm font-medium text-neutral-800">Allow interns to submit their own tasks</p>
            <p class="text-xs text-neutral-400 mt-0.5">Interns can submit tasks they completed for supervisor review and approval. Approved tasks become active and can be used in narratives.</p>
          </div>
        </label>
      </div>

      <!-- Security Features -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4 flex items-center gap-2">${icons.alert} Security Features</h3>
        <div class="space-y-4">
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="enable-forgot-password" ${forgotPasswordEnabled ? 'checked' : ''} />
            <div>
              <p class="text-sm font-medium text-neutral-800">Enable Forgot Password</p>
              <p class="text-xs text-neutral-400 mt-0.5">Allow users to access the forgot password link on the login page.</p>
            </div>
          </label>
          <label class="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" id="enable-admin-account-creation" ${adminAccountEnabled ? 'checked' : ''} />
            <div>
              <p class="text-sm font-medium text-neutral-800">Enable Admin Account Creation</p>
              <p class="text-xs text-neutral-400 mt-0.5">Allow users to access the admin setup page from the login page.</p>
            </div>
          </label>
        </div>
      </div>

      <div class="flex justify-end">
        <button type="submit" class="btn-primary">
          ${icons.check}
          <span class="ml-2">Save Settings</span>
        </button>
      </div>
    </form>
  `, (el) => {
    el.querySelector('#settings-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = el.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        const updates = [
          {
            key: 'work_hours',
            value: {
              start: el.querySelector('#work-start').value || workStart,
              end: el.querySelector('#work-end').value || workEnd,
            },
          },
          {
            key: 'attendance_rules',
            value: {
              late_threshold_minutes: parseInt(el.querySelector('#late-threshold').value),
              required_punches: parseInt(el.querySelector('#required-punches').value),
            },
          },
          {
            key: 'escalation_hours',
            value: { hours: parseInt(el.querySelector('#escalation-hours').value) || escalationHours },
          },
          {
            key: 'data_retention_months',
            value: { months: parseInt(el.querySelector('#retention-months').value) || retentionMonths },
          },
          {
            key: 'intern_task_submission',
            value: { enabled: el.querySelector('#intern-task-submission').checked },
          },
          {
            key: 'enable_forgot_password',
            value: { enabled: el.querySelector('#enable-forgot-password').checked },
          },
          {
            key: 'enable_admin_account_creation',
            value: { enabled: el.querySelector('#enable-admin-account-creation').checked },
          },
        ];

        for (const update of updates) {
          await supabase
            .from('system_settings')
            .upsert({ key: update.key, value: update.value, updated_by: profile.id }, { onConflict: 'key' });
        }

        await logAudit('settings.updated', 'system_settings', null);
        showToast('Settings saved', 'success');
      } catch (err) {
        showToast('Failed to save settings', 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }, '/system-settings');
}
