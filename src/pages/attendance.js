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
import { formatDate, formatTime, formatHoursDisplay, getTodayDate, getPublicIP, isLateArrival, isOutsideAllowedHours } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderAttendancePage() {
  const profile = getProfile();
  const today = getTodayDate();

  // Fetch today's record
  let { data: todayRecord } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .single();

  // Fetch recent records
  const { data: recentRecords } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .order('date', { ascending: false })
    .limit(10);

  const nextPunch = getNextPunch(todayRecord);

  renderLayout(`
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">Attendance</h1>
      <p class="text-neutral-500 mt-1">Log your daily time-in and time-out</p>
    </div>

    <!-- Today's Punch Card -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Today — ${formatDate(new Date(), { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        ${todayRecord?.status ? `<span class="badge-${todayRecord.status === 'approved' ? 'approved' : todayRecord.status === 'rejected' ? 'rejected' : 'pending'}">${todayRecord.status}</span>` : ''}
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${renderPunchSlot('Morning In', todayRecord?.time_in_1, 'time_in_1')}
        ${renderPunchSlot('Lunch Out', todayRecord?.time_out_1, 'time_out_1')}
        ${renderPunchSlot('Afternoon In', todayRecord?.time_in_2, 'time_in_2')}
        ${renderPunchSlot('End of Day', todayRecord?.time_out_2, 'time_out_2')}
      </div>

      ${todayRecord?.total_hours ? `
        <div class="flex items-center gap-2 text-sm text-neutral-600 mb-4">
          ${icons.clock}
          <span>Total Hours: <strong>${formatHoursDisplay(todayRecord.total_hours)}</strong></span>
          ${todayRecord.is_late ? '<span class="badge-pending ml-2">Late</span>' : ''}
          ${todayRecord.is_outside_hours ? '<span class="badge-rejected ml-2">Outside Hours</span>' : ''}
        </div>
      ` : ''}

      <div class="flex gap-3">
        ${nextPunch ? `
          <button id="punch-btn" class="btn-primary" data-punch="${nextPunch}">
            ${icons.clock}
            <span class="ml-2">${getPunchLabel(nextPunch)}</span>
          </button>
        ` : `
          <p class="text-sm text-success-600 font-medium">✓ All punches logged for today</p>
        `}
        
        ${todayRecord && !isAllPunchesComplete(todayRecord) ? `
          <button id="correction-btn" class="btn-secondary">
            ${icons.edit}
            <span class="ml-2">Request Correction</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Recent Attendance -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Recent Attendance</h3>
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
            // Validate IP consistency
            const firstIP = todayRecord.ip_address_in_1;
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

          showToast(`${getPunchLabel(punchType)} recorded successfully`, 'success');

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
          punchBtn.innerHTML = `${icons.clock}<span class="ml-2">${getPunchLabel(punchType)}</span>`;
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
  return `
    <div class="text-center p-3 bg-neutral-50 rounded-lg">
      <p class="text-xs text-neutral-500 mb-1">${label}</p>
      <p class="text-lg font-semibold ${timestamp ? 'text-neutral-800' : 'text-neutral-300'}">
        ${timestamp ? formatTime(timestamp) : '--:--'}
      </p>
    </div>
  `;
}

function getNextPunch(record) {
  if (!record) return 'time_in_1';
  if (!record.time_in_1) return 'time_in_1';
  if (!record.time_out_1) return 'time_out_1';
  if (!record.time_in_2) return 'time_in_2';
  if (!record.time_out_2) return 'time_out_2';
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
        <button type="submit" class="btn-primary">Submit Request</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#correction-cancel').addEventListener('click', close);

    el.querySelector('#correction-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const punchType = el.querySelector('#correction-punch').value;
      const timeValue = el.querySelector('#correction-time').value;
      const reason = el.querySelector('#correction-reason').value;

      if (!punchType || !timeValue || !reason.trim()) {
        showToast('Please fill all fields', 'error');
        return;
      }

      const correctedTimestamp = new Date(`${record.date}T${timeValue}:00`).toISOString();

      try {
        const { error } = await supabase.from('attendance_corrections').insert({
          attendance_id: record.id,
          intern_id: profile.id,
          punch_type: punchType,
          original_value: record[punchType] || null,
          requested_value: correctedTimestamp,
          reason: reason.trim(),
        });

        if (error) throw error;

        // Notify supervisor
        if (profile.supervisor_id) {
          await supabase.from('notifications').insert({
            user_id: profile.supervisor_id,
            type: 'pending_approval',
            title: 'Attendance Correction Request',
            message: `${profile.full_name} has requested an attendance correction for ${formatDate(record.date)}`,
            entity_type: 'attendance_correction',
            entity_id: record.id,
          });
        }

        await logAudit('attendance.correction_requested', 'attendance_correction', record.id, {
          punch_type: punchType,
          reason,
        });

        showToast('Correction request submitted', 'success');
        close();
      } catch (err) {
        showToast(err.message || 'Failed to submit correction', 'error');
      }
    });
  });
}
