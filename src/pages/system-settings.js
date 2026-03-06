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

  const workHours = settingsMap.work_hours?.value || { start: '08:00', end: '17:00' };
  const attendanceRules = settingsMap.attendance_rules?.value || { late_threshold_minutes: 15, required_punches: 4 };
  const escalation = settingsMap.escalation_hours?.value || { hours: 24 };
  const retention = settingsMap.data_retention_months?.value || { months: 36 };

  renderLayout(`
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">System Settings</h1>
      <p class="text-neutral-500 mt-1">Configure global system parameters</p>
    </div>

    <form id="settings-form" class="space-y-6">
      <!-- Work Hours -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">${icons.clock} Work Hours</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Start Time</label>
            <input type="time" id="work-start" class="form-input" value="${workHours.start}" />
          </div>
          <div>
            <label class="form-label">End Time</label>
            <input type="time" id="work-end" class="form-input" value="${workHours.end}" />
          </div>
        </div>
      </div>

      <!-- Attendance Rules -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">${icons.approval} Attendance Rules</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="form-label">Late Threshold (minutes)</label>
            <input type="number" id="late-threshold" class="form-input" min="1" max="120" value="${attendanceRules.late_threshold_minutes}" />
            <p class="text-xs text-neutral-400 mt-1">Grace period after start time before marking as late</p>
          </div>
          <div>
            <label class="form-label">Required Punches Per Day</label>
            <input type="number" id="required-punches" class="form-input" min="2" max="4" value="${attendanceRules.required_punches}" />
          </div>
        </div>
      </div>

      <!-- Escalation -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">${icons.alert} Approval Escalation</h3>
        <div>
          <label class="form-label">Escalate to HR after (hours)</label>
          <input type="number" id="escalation-hours" class="form-input" min="1" max="168" value="${escalation.hours}" />
          <p class="text-xs text-neutral-400 mt-1">Pending approvals older than this will trigger HR notification</p>
        </div>
      </div>

      <!-- Data Retention -->
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">${icons.calendar} Data Retention</h3>
        <div>
          <label class="form-label">Retention Period (months)</label>
          <input type="number" id="retention-months" class="form-input" min="6" max="120" value="${retention.months}" />
          <p class="text-xs text-neutral-400 mt-1">How long to keep historical records</p>
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
              start: el.querySelector('#work-start').value,
              end: el.querySelector('#work-end').value,
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
            value: { hours: parseInt(el.querySelector('#escalation-hours').value) },
          },
          {
            key: 'data_retention_months',
            value: { months: parseInt(el.querySelector('#retention-months').value) },
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
  });
}
