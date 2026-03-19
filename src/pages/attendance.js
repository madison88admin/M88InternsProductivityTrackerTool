/**
 * Attendance Page (Intern)
 * Allows interns to log daily time-in/time-out (4 punches).
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatTime, formatHoursDisplay, getPublicIP, isLateArrival, isOutsideAllowedHours } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { isHoliday } from '../lib/holidays.js';

const PH_TIMEZONE = 'Asia/Manila';
let phMidnightRefreshTimer = null;

function ipConsistencyBadge(ip_consistent, size = 'normal') {
  if (ip_consistent == null) return '';
  const cls = size === 'sm' ? 'text-xs ml-1' : 'ml-2';
  return ip_consistent
    ? `<span class="badge-approved ${cls}">IP Consistent</span>`
    : `<span class="badge-rejected ${cls}">IP Mismatch</span>`;
}

// Cutoff times in minutes from midnight — punch is locked at or after this time
const PUNCH_CUTOFFS = {
  time_in_1: 10 * 60 + 30,  // 10:30 AM
  time_out_1: 13 * 60,       // 1:00 PM
  time_in_2: 15 * 60,        // 3:00 PM
  time_out_2: 19 * 60 + 30,  // 7:30 PM
};

function getNowInPH() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: PH_TIMEZONE }));
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getTodayDateInPH() {
  return toDateKey(getNowInPH());
}

function getWeekRangeInPH() {
  const nowPH = getNowInPH();
  const day = nowPH.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;

  const monday = new Date(nowPH);
  monday.setDate(nowPH.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return {
    weekStart: toDateKey(monday),
    weekEnd: toDateKey(friday),
  };
}

function schedulePhMidnightRefresh() {
  if (phMidnightRefreshTimer) clearTimeout(phMidnightRefreshTimer);

  const nowPH = getNowInPH();
  const nextMidnightPH = new Date(nowPH);
  nextMidnightPH.setHours(24, 0, 0, 0);

  const msUntilRefresh = Math.max(1000, nextMidnightPH.getTime() - nowPH.getTime() + 500);
  phMidnightRefreshTimer = setTimeout(() => {
    window.location.reload();
  }, msUntilRefresh);
}

function getCurrentMinutes() {
  const now = getNowInPH();
  return now.getHours() * 60 + now.getMinutes();
}

function isPunchLocked(punchType) {
  return getCurrentMinutes() >= PUNCH_CUTOFFS[punchType];
}

export async function renderAttendancePage() {
  const profile = getProfile();
  const today = getTodayDateInPH();
  const holidayInfo = await isHoliday(today);
  const { weekStart, weekEnd } = getWeekRangeInPH();

  schedulePhMidnightRefresh();

  // Fetch today's record
  let { data: todayRecord } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .maybeSingle();

  // Fetch recent records
  const { data: recentRecords } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .order('date', { ascending: false })
    .limit(10);

  const { data: weekRecords } = await supabase
    .from('attendance_records')
    .select('total_hours')
    .eq('intern_id', profile.id)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  const totalHoursThisWeek = (weekRecords || []).reduce((sum, record) => sum + (record.total_hours || 0), 0);

  const nextPunch = getNextPunch(todayRecord);

  // Auto-submit incomplete attendance at 7:30 PM
  let wasAutoSubmitted = false;
  const isPostEndOfDay = getCurrentMinutes() >= PUNCH_CUTOFFS.time_out_2;

  if (isPostEndOfDay && todayRecord && !isAllPunchesComplete(todayRecord)) {
    const hasSomePunches = todayRecord.time_in_1 || todayRecord.time_in_2;
    if (hasSomePunches) {
      const { data: existingApproval } = await supabase
        .from('approvals')
        .select('id')
        .eq('entity_id', todayRecord.id)
        .eq('type', 'attendance')
        .maybeSingle();

      if (!existingApproval && profile.supervisor_id) {
        await supabase.from('approvals').insert({
          type: 'attendance',
          entity_id: todayRecord.id,
          intern_id: profile.id,
          supervisor_id: profile.supervisor_id,
        });

        await supabase.from('notifications').insert({
          user_id: profile.supervisor_id,
          type: 'pending_approval',
          title: 'Attendance Auto-Submitted',
          message: `${profile.full_name}'s attendance for ${formatDate(today)} was auto-submitted with incomplete punches.`,
          entity_type: 'attendance',
          entity_id: todayRecord.id,
        });

        await logAudit('attendance.auto_submitted', 'attendance', todayRecord.id, {
          reason: 'End of day cutoff reached (7:30 PM)',
          missing_punches: ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'].filter(p => !todayRecord[p]),
        });

        wasAutoSubmitted = true;
      } else if (existingApproval) {
        wasAutoSubmitted = true;
      }
    }
  }

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Attendance</h1>
      <p class="page-subtitle">Log your daily time-in and time-out</p>
    </div>

    ${holidayInfo.isHoliday ? `
      <div class="bg-danger-50 border border-danger-300 rounded-xl p-4 mb-6 flex items-center gap-3 animate-fade-in-up">
        ${icons.calendar}
        <div>
          <p class="text-sm font-bold text-danger-700">Holiday: ${holidayInfo.name}</p>
          <p class="text-xs text-danger-600">Today is a holiday. Attendance logging is disabled.</p>
        </div>
      </div>
    ` : ''}

    <!-- Today's Punch Card -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">Today — ${formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric', timeZone: PH_TIMEZONE })}</h3>
        ${todayRecord?.status ? `<span class="badge-${todayRecord.status === 'approved' ? 'approved' : todayRecord.status === 'rejected' ? 'rejected' : 'pending'}">${todayRecord.status}</span>` : ''}
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${renderPunchSlot('Morning In', todayRecord?.time_in_1, 'time_in_1')}
        ${renderPunchSlot('Lunch Out', todayRecord?.time_out_1, 'time_out_1')}
        ${renderPunchSlot('Afternoon In', todayRecord?.time_in_2, 'time_in_2')}
        ${renderPunchSlot('End of Day', todayRecord?.time_out_2, 'time_out_2')}
      </div>

      ${todayRecord?.total_hours ? `
        <div class="flex items-center gap-2 text-sm text-neutral-600 mb-2">
          ${icons.clock}
          <span>Total Hours: <strong>${formatHoursDisplay(todayRecord.total_hours)}</strong></span>
          ${todayRecord.is_late ? '<span class="badge-pending ml-2">Late</span>' : ''}
          ${todayRecord.is_outside_hours ? '<span class="badge-rejected ml-2">Outside Hours</span>' : ''}
        </div>
      ` : ''}

      <div class="flex items-center gap-2 text-sm text-neutral-600 mb-2">
        ${icons.clock}
        <span>Total Hours This Week: <strong>${formatHoursDisplay(totalHoursThisWeek)}</strong></span>
      </div>

      ${todayRecord?.ip_consistent != null ? `
        <div class="flex items-center gap-2 text-sm mb-4">
          ${icons.shield}
          <span class="${todayRecord.ip_consistent ? 'text-success-600' : 'text-danger-600 font-medium'}">${todayRecord.ip_consistent ? 'All punches from the same network' : 'Punches logged from different networks'}</span>
          ${ipConsistencyBadge(todayRecord.ip_consistent)}
        </div>
      ` : ''}

      <div class="flex gap-3">
        ${holidayInfo.isHoliday ? `
          <p class="text-sm text-danger-600 font-medium">Attendance logging is disabled on holidays</p>
        ` : nextPunch ? `
          <button id="punch-btn" class="btn-primary" data-punch="${nextPunch}">
            ${icons.clock}
            <span class="ml-2">${getPunchLabel(nextPunch)}</span>
          </button>
        ` : isAllPunchesComplete(todayRecord) ? `
          <p class="text-sm text-success-600 font-medium">✓ All punches logged for today</p>
        ` : wasAutoSubmitted ? `
          <p class="text-sm text-warning-600 font-medium">Your attendance has been automatically submitted with incomplete punches</p>
        ` : todayRecord ? `
          <p class="text-sm text-warning-600 font-medium">Remaining punches are no longer available. ${!isPunchLocked('time_out_2') ? 'Your attendance will be auto-submitted at 7:30 PM.' : ''}</p>
        ` : `
          <p class="text-sm text-neutral-500">No punches available at this time</p>
        `}
      </div>

      ${!holidayInfo.isHoliday && todayRecord && !isAllPunchesComplete(todayRecord) ? `
        <div class="mt-3">
          <button id="correction-btn" class="btn-secondary">
            ${icons.edit}
            <span class="ml-2">Request Correction</span>
          </button>
        </div>
      ` : ''}

      ${!holidayInfo.isHoliday ? `
        <p class="text-xs text-neutral-400 mt-3">Punch cutoffs: Morning In by 10:30 AM · Lunch Out by 1:00 PM · Afternoon In by 3:00 PM · End of Day by 7:30 PM</p>
      ` : ''}
    </div>

    <!-- Recent Attendance -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">Recent Attendance</h3>
      </div>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Morning In</th>
              <th>Lunch Out</th>
              <th>Afternoon In</th>
              <th>End of Day</th>
              <th>Total Hours</th>
              <th>Status</th>
              <th>Flags</th>
            </tr>
          </thead>
          <tbody>
            ${(recentRecords || []).map(record => `
              <tr>
                <td class="font-medium">${formatDate(record.date)}</td>
                <td>${record.time_in_1 ? formatTime(record.time_in_1) : '—'}</td>
                <td>${record.time_out_1 ? formatTime(record.time_out_1) : '—'}</td>
                <td>${record.time_in_2 ? formatTime(record.time_in_2) : '—'}</td>
                <td>${record.time_out_2 ? formatTime(record.time_out_2) : '—'}</td>
                <td>${record.total_hours ? formatHoursDisplay(record.total_hours) : '—'}</td>
                <td>
                  <span class="badge-${record.status === 'approved' ? 'approved' : record.status === 'rejected' ? 'rejected' : 'pending'}">
                    ${record.status}
                  </span>
                </td>
                <td>
                  ${record.is_late ? '<span class="badge-pending">Late</span>' : ''}
                  ${record.is_outside_hours ? '<span class="badge-rejected">Outside</span>' : ''}
                  ${record.admin_logged ? '<span class="badge-secondary">Admin</span>' : ''}
                  ${ipConsistencyBadge(record.ip_consistent, 'sm')}
                </td>
              </tr>
            `).join('')}
            ${(!recentRecords || recentRecords.length === 0) ? '<tr><td colspan="8" class="text-center text-neutral-400 py-8">No attendance records yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>
    </div>
  `, (el) => {
    // Punch button handler
    const punchBtn = el.querySelector('#punch-btn');
    if (punchBtn) {
      punchBtn.addEventListener('click', async () => {
        const punchType = punchBtn.dataset.punch;
        const punchLabel = getPunchLabel(punchType);

        const shouldLogPunch = window.confirm(`Are you sure you want to log your time for "${punchLabel}"?`);
        if (!shouldLogPunch) return;

        // Re-validate cutoff at click time (guard against race condition)
        if (isPunchLocked(punchType)) {
          showToast('This punch is no longer available. The cutoff time has passed.', 'error');
          renderAttendancePage();
          return;
        }

        punchBtn.disabled = true;
        punchBtn.innerHTML = '<span class="spinner"></span><span class="ml-2">Logging...</span>';

        try {
          const ip = await getPublicIP();
          const now = new Date().toISOString();

          if (!todayRecord) {
            // Create new attendance record
            const { data, error } = await supabase
              .from('attendance_records')
              .insert({
                intern_id: profile.id,
                date: today,
                [punchType]: now,
                [`ip_address_${punchType.replace('time_', '')}`]: ip,
                supervisor_id: profile.supervisor_id,
              })
              .select()
              .single();

            if (error) throw error;
            todayRecord = data;
          } else {
            // Validate IP consistency (use first available IP as reference)
            const firstIP = todayRecord.ip_address_in_1 || todayRecord.ip_address_in_2;
            if (firstIP && ip !== 'unknown' && ip !== firstIP) {
              showToast('Your IP address has changed. All daily punches must come from the same network.', 'error');
              punchBtn.disabled = false;
              punchBtn.innerHTML = `${icons.clock}<span class="ml-2">${getPunchLabel(punchType)}</span>`;
              return;
            }

            const { error } = await supabase
              .from('attendance_records')
              .update({
                [punchType]: now,
                [`ip_address_${punchType.replace('time_', '')}`]: ip,
              })
              .eq('id', todayRecord.id);

            if (error) throw error;
          }

          const flags = [];
          if (punchType === 'time_in_1' && isLateArrival(now)) flags.push('late');
          if (isOutsideAllowedHours(now)) flags.push('outside_hours');

          await logAudit(`attendance.${punchType}`, 'attendance', todayRecord?.id, {
            punch_type: punchType,
            timestamp: now,
            ip_address: ip,
            flags,
          });

          showToast(`${punchLabel} recorded successfully`, 'success');

          // Create approval entry when all 4 punches are done
          if (punchType === 'time_out_2' && profile.supervisor_id) {
            await supabase.from('approvals').insert({
              type: 'attendance',
              entity_id: todayRecord.id,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
            });

            await supabase.from('notifications').insert({
              user_id: profile.supervisor_id,
              type: 'pending_approval',
              title: 'Attendance Pending Review',
              message: `${profile.full_name} has completed attendance for ${formatDate(today)}`,
              entity_type: 'attendance',
              entity_id: todayRecord.id,
            });
          }

          // Re-render the page
          renderAttendancePage();
        } catch (err) {
          showToast(err.message || 'Failed to log attendance', 'error');
          punchBtn.disabled = false;
          punchBtn.innerHTML = `${icons.clock}<span class="ml-2">${punchLabel}</span>`;
        }
      });
    }

    // Correction request button
    const correctionBtn = el.querySelector('#correction-btn');
    if (correctionBtn) {
      correctionBtn.addEventListener('click', () => openCorrectionModal(todayRecord, profile));
    }
  }, '/attendance');
}

function renderPunchSlot(label, timestamp, type) {
  const locked = !timestamp && isPunchLocked(type);
  return `
    <div class="text-center p-4 rounded-xl ${timestamp ? 'bg-primary-50' : locked ? 'bg-neutral-50' : 'bg-neutral-100'}" style="border: 1px solid ${timestamp ? 'rgba(99,102,241,0.15)' : locked ? 'rgba(239,68,68,0.15)' : 'var(--color-neutral-200)'};">
      <p class="text-xs font-semibold uppercase tracking-wider ${timestamp ? 'text-primary-600' : locked ? 'text-danger-500' : 'text-neutral-400'} mb-2">${label}</p>
      <p class="text-lg font-bold ${timestamp ? 'text-neutral-900' : locked ? 'text-danger-300' : 'text-neutral-300'}">
        ${timestamp ? formatTime(timestamp) : locked ? 'Locked' : '--:--'}
      </p>
    </div>
  `;
}

function getNextPunch(record) {
  const currentMinutes = getCurrentMinutes();
  const punchOrder = ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'];

  for (const punch of punchOrder) {
    // Already logged — skip
    if (record && record[punch]) continue;
    // Past cutoff — locked, skip
    if (currentMinutes >= PUNCH_CUTOFFS[punch]) continue;
    // "Out" punches require the matching "In" to be logged first
    if (punch === 'time_out_1' && (!record || !record.time_in_1)) continue;
    if (punch === 'time_out_2' && (!record || !record.time_in_2)) continue;
    return punch;
  }

  return null;
}

function isAllPunchesComplete(record) {
  return record?.time_in_1 && record?.time_out_1 && record?.time_in_2 && record?.time_out_2;
}

function getPunchLabel(type) {
  const labels = {
    time_in_1: 'Morning Time In',
    time_out_1: 'Lunch Time Out',
    time_in_2: 'Afternoon Time In',
    time_out_2: 'End of Day Time Out',
  };
  return labels[type] || 'Log Time';
}

function openCorrectionModal(record, profile) {
  createModal('Request Attendance Correction', `
    <form id="correction-form" class="space-y-4">
      <div>
        <label class="form-label">Which punch needs correction?</label>
        <select id="correction-punch" class="form-input" required>
          <option value="">Select punch type</option>
          ${!record.time_in_1 ? '' : '<option value="time_in_1">Morning Time In</option>'}
          ${!record.time_out_1 ? '' : '<option value="time_out_1">Lunch Time Out</option>'}
          ${!record.time_in_2 ? '' : '<option value="time_in_2">Afternoon Time In</option>'}
          ${!record.time_out_2 ? '' : '<option value="time_out_2">End of Day Time Out</option>'}
          ${!record.time_out_1 && record.time_in_1 ? '<option value="time_out_1">Missed Lunch Out</option>' : ''}
          ${!record.time_in_2 && record.time_out_1 ? '<option value="time_in_2">Missed Afternoon In</option>' : ''}
          ${!record.time_out_2 && record.time_in_2 ? '<option value="time_out_2">Missed End of Day</option>' : ''}
        </select>
      </div>

      <div>
        <label class="form-label">Corrected Time</label>
        <input type="time" id="correction-time" class="form-input" required />
      </div>

      <div>
        <label class="form-label">Reason for Correction</label>
        <textarea id="correction-reason" class="form-input" rows="3" placeholder="Explain why this correction is needed..." required></textarea>
      </div>

      <div class="flex justify-end gap-3">
        <button type="button" id="correction-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="correction-submit" class="btn-primary">Submit Request</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#correction-cancel').addEventListener('click', close);
    const submitBtn = el.querySelector('#correction-submit');
    let isSubmitting = false;

    el.querySelector('#correction-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (isSubmitting) return;

      const punchType = el.querySelector('#correction-punch').value;
      const timeValue = el.querySelector('#correction-time').value;
      const reason = el.querySelector('#correction-reason').value;

      if (!punchType || !timeValue || !reason.trim()) {
        showToast('Please fill all fields', 'error');
        return;
      }

      isSubmitting = true;
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span><span class="ml-2">Submitting...</span>';

      const correctedTimestamp = new Date(`${record.date}T${timeValue}:00`).toISOString();

      try {
        const { data: correctionData, error } = await supabase.from('attendance_corrections').insert({
          attendance_id: record.id,
          intern_id: profile.id,
          punch_type: punchType,
          original_value: record[punchType] || null,
          requested_value: correctedTimestamp,
          reason: reason.trim(),
        }).select().single();

        if (error) throw error;

        const baseNotif = {
          type: 'pending_approval',
          title: 'Attendance Correction Request',
          message: `${profile.full_name} has requested an attendance correction for ${formatDate(record.date)}`,
          entity_type: 'attendance_correction',
          entity_id: correctionData.id,
        };

        // Create approval entry so supervisor/admin can act on it from the Approvals page
        if (profile.supervisor_id) {
          await Promise.all([
            supabase.from('approvals').insert({
              type: 'attendance_correction',
              entity_id: correctionData.id,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
            }),
            supabase.from('notifications').insert({
              user_id: profile.supervisor_id,
              ...baseNotif,
            }),
          ]);
        }

        // Also notify all active admins since only admins can approve corrections
        supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .eq('is_active', true)
          .then(({ data: admins }) => {
            if (!admins || admins.length === 0) return;
            const adminNotifs = admins
              .filter(a => a.id !== profile.supervisor_id)
              .map(a => ({ user_id: a.id, ...baseNotif }));
            if (adminNotifs.length === 0) return;
            return supabase.from('notifications').insert(adminNotifs);
          })
          .catch((adminNotifErr) => {
            console.error('Failed to send admin correction notifications:', adminNotifErr);
          });

        logAudit('attendance.correction_requested', 'attendance_correction', record.id, {
          punch_type: punchType,
          reason,
        }).catch(err => {
          console.error('Failed to write correction audit log:', err);
        });

        showToast('Correction request submitted', 'success');
        close();
      } catch (err) {
        showToast(err.message || 'Failed to submit correction', 'error');
      } finally {
        isSubmitting = false;
        submitBtn.disabled = false;
        submitBtn.innerHTML = 'Submit Request';
      }
    });
  });
}
