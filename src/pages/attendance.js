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
import { formatDate, formatTime, formatHoursDisplay, getPublicIP, isLateArrival, isOutsideAllowedHours, getTrackingWeekStart, getTrackingWeekEnd } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { isHoliday } from '../lib/holidays.js';
import { sendEmailNotification, getDepartmentSupervisors } from '../lib/email-notifications.js';
import { showNarrativePromptModal } from '../lib/narrative-modal.js';

const PH_TIMEZONE = 'Asia/Manila';
const RECENT_ATTENDANCE_PAGE_SIZE = 10;
let phMidnightRefreshTimer = null;
let recentAttendancePage = 1;

function ipConsistencyBadge(ip_consistent, size = 'normal') {
  if (ip_consistent == null) return '';
  const cls = size === 'sm' ? 'text-xs ml-1' : 'ml-2';
  return ip_consistent
    ? `<span class="badge-approved ${cls}">IP Consistent</span>`
    : `<span class="badge-rejected ${cls}">IP Mismatch</span>`;
}

// Time periods for flexible punch availability
const TIME_PERIODS = {
  morning: {
    start: 7 * 60,      // 7:00 AM
    end: 12 * 60,       // 12:00 PM (noon)
  },
  afternoon: {
    start: 12 * 60,     // 12:00 PM
    end: 19 * 60,       // 7:00 PM
  },
  endOfDay: 19 * 60,   // 7:00 PM (auto-submit cutoff)
};

// Punch type to time period mapping
const PUNCH_PERIODS = {
  time_in_1: 'morning',
  time_out_1: 'morning',
  time_in_2: 'afternoon',
  time_out_2: 'afternoon',
};

function sanitizeIpForInet(value) {
  if (!value || value === 'unknown') return null;
  return value;
}

function getAttendanceErrorMessage(err) {
  const rawMessage = err?.message || '';
  if (/invalid input syntax for type inet/i.test(rawMessage)) {
    return 'Unable to record attendance right now due to a network identity issue. Please try again.';
  }
  return rawMessage || 'Failed to log attendance';
}

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
  const weekStartDate = getTrackingWeekStart(nowPH);
  const weekEndDate = getTrackingWeekEnd(nowPH);

  return {
    weekStart: toDateKey(weekStartDate),
    weekEnd: toDateKey(weekEndDate),
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

function getCurrentTimePeriod() {
  const currentMinutes = getCurrentMinutes();
  
  if (currentMinutes >= TIME_PERIODS.morning.start && currentMinutes < TIME_PERIODS.morning.end) {
    return 'morning';
  } else if (currentMinutes >= TIME_PERIODS.afternoon.start && currentMinutes < TIME_PERIODS.afternoon.end) {
    return 'afternoon';
  }
  return 'outside_hours';
}

function isPunchLocked(punchType) {
  const currentMinutes = getCurrentMinutes();
  const period = PUNCH_PERIODS[punchType];
  
  if (!period) return true;
  
  // Allow flexible timing for lunch out (time_out_1)
  if (punchType === 'time_out_1') {
    return false;
  }
  
  // Check if current time is past the period's end time
  if (currentMinutes >= TIME_PERIODS[period].end) {
    return true;
  }
  
  // Special case: end of day punch has additional auto-submit cutoff
  if (punchType === 'time_out_2' && currentMinutes >= TIME_PERIODS.endOfDay) {
    return true;
  }
  
  return false;
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

  // Check for AM half-day attendance that needs approval (morning complete, afternoon window closed)
  if (todayRecord && todayRecord.time_in_1 && todayRecord.time_out_1 && !todayRecord.time_in_2 && 
      isPunchLocked('time_in_2') && profile.supervisor_id) {
    const { data: existingApproval } = await supabase
      .from('approvals')
      .select('id')
      .eq('entity_id', todayRecord.id)
      .eq('type', 'attendance')
      .maybeSingle();

    if (!existingApproval) {
      // Create approval for AM half-day attendance
      await supabase.from('approvals').insert({
        type: 'attendance',
        entity_id: todayRecord.id,
        intern_id: profile.id,
        supervisor_id: profile.supervisor_id,
      });

      // Notify supervisors
      const deptSupervisors = await getDepartmentSupervisors(profile.id);
      if (deptSupervisors.length > 0) {
        const notifPayload = deptSupervisors.map(sup => ({
          user_id: sup.id,
          type: 'pending_approval',
          title: 'Attendance Pending Review',
          message: `${profile.full_name} has submitted AM half-day attendance for ${formatDate(today)}`,
          entity_type: 'attendance',
          entity_id: todayRecord.id,
        }));
        await supabase.from('notifications').insert(notifPayload);

        // Send email notification
        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                .badge-half { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Attendance Pending Review</h1>
                </div>
                <div class="content">
                  <p><strong>${profile.full_name}</strong> has submitted AM half-day attendance for <strong>${formatDate(today)}</strong> <span class="badge-half">AM HALF-DAY</span></p>
                  <p>Morning punches have been recorded and the afternoon window has closed. This attendance is awaiting your review and approval.</p>
                  <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                </div>
                <div class="footer">
                  <p>This is an automated notification. Please do not reply to this email.</p>
                </div>
              </div>
            </body>
          </html>
        `;

        for (const sup of deptSupervisors) {
          if (sup.email) {
            sendEmailNotification(sup.email, 'AM Half-Day Attendance Pending Review', emailHtml).catch(err => console.error('Failed to send attendance email to', sup.email, err));
          }
        }
      }

      await logAudit('attendance.am_half_day_submitted', 'attendance', todayRecord.id, {
        reason: 'Afternoon window closed with morning punches complete',
      });
    }
  }

  // Check for PM half-day attendance that needs approval (afternoon complete, morning missed)
  if (todayRecord && !todayRecord.time_in_1 && !todayRecord.time_out_1 && todayRecord.time_in_2 && todayRecord.time_out_2 && 
      profile.supervisor_id) {
    const { data: existingApproval } = await supabase
      .from('approvals')
      .select('id')
      .eq('entity_id', todayRecord.id)
      .eq('type', 'attendance')
      .maybeSingle();

    if (!existingApproval) {
      // Create approval for PM half-day attendance
      await supabase.from('approvals').insert({
        type: 'attendance',
        entity_id: todayRecord.id,
        intern_id: profile.id,
        supervisor_id: profile.supervisor_id,
      });

      // Notify supervisors
      const deptSupervisors = await getDepartmentSupervisors(profile.id);
      if (deptSupervisors.length > 0) {
        const notifPayload = deptSupervisors.map(sup => ({
          user_id: sup.id,
          type: 'pending_approval',
          title: 'Attendance Pending Review',
          message: `${profile.full_name} has submitted PM half-day attendance for ${formatDate(today)}`,
          entity_type: 'attendance',
          entity_id: todayRecord.id,
        }));
        await supabase.from('notifications').insert(notifPayload);

        // Send email notification
        const emailHtml = `
          <!DOCTYPE html>
          <html>
            <head>
              <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                .badge-half { display: inline-block; background: #ef4444; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
              </style>
            </head>
            <body>
              <div class="container">
                <div class="header">
                  <h1>Attendance Pending Review</h1>
                </div>
                <div class="content">
                  <p><strong>${profile.full_name}</strong> has submitted PM half-day attendance for <strong>${formatDate(today)}</strong> <span class="badge-half">PM HALF-DAY</span></p>
                  <p>Afternoon punches have been recorded and the morning shift was missed. This attendance is awaiting your review and approval.</p>
                  <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                </div>
                <div class="footer">
                  <p>This is an automated notification. Please do not reply to this email.</p>
                </div>
              </div>
            </body>
          </html>
        `;

        for (const sup of deptSupervisors) {
          if (sup.email) {
            sendEmailNotification(sup.email, 'PM Half-Day Attendance Pending Review', emailHtml).catch(err => console.error('Failed to send attendance email to', sup.email, err));
          }
        }
      }

      await logAudit('attendance.pm_half_day_submitted', 'attendance', todayRecord.id, {
        reason: 'Afternoon punches completed with morning punches missed',
      });
    }
  }

  // Check if end-of-day punch exists without narrative submission (prevent refresh bypass)
  if (todayRecord && todayRecord.time_out_2) {
    const { data: existingNarratives } = await supabase
      .from('narratives')
      .select('id')
      .eq('intern_id', profile.id)
      .eq('date', today)
      .in('status', ['pending', 'approved', 'rejected']);

    const submittedCount = existingNarratives?.length || 0;

    // If end-of-day punch exists but no narratives submitted, force modal
    if (submittedCount < 2) {
      // Fetch intern's tasks
      const { data: allTasks } = await supabase
        .from('tasks')
        .select('id, title, status, pending_status, approved_at')
        .eq('assigned_to', profile.id);

      const nowDate = new Date();
      const fortyEightHoursAgo = new Date(nowDate.getTime() - (48 * 60 * 60 * 1000));

      const tasks = (allTasks || []).filter(t => {
        if (t.status === 'not_started') return false;
        if (t.status === 'in_progress') return true;
        if (t.status === 'completed' && t.approved_at) {
          const approvedDate = new Date(t.approved_at);
          return approvedDate >= fortyEightHoursAgo;
        }
        return false;
      });

      if (tasks.length > 0) {
        // Show blocking modal immediately (before rendering the page)
        await showNarrativePromptModal({
          date: today,
          isEndOfDay: true,
          profile,
          tasks,
          onComplete: renderAttendancePage,
        });
        return; // Don't render page yet, wait for narrative submission
      }
    }
  }

  // Fetch recent records
  const { data: recentRecords } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .order('date', { ascending: false })
    .limit(200);

  const { data: weekRecords } = await supabase
    .from('attendance_records')
    .select('total_hours')
    .eq('intern_id', profile.id)
    .gte('date', weekStart)
    .lte('date', weekEnd);

  const totalHoursThisWeek = (weekRecords || []).reduce((sum, record) => sum + (record.total_hours || 0), 0);

  const nextPunch = getNextPunch(todayRecord);
  const recentAttendanceRecords = recentRecords || [];
  const totalRecentAttendancePages = Math.max(1, Math.ceil(recentAttendanceRecords.length / RECENT_ATTENDANCE_PAGE_SIZE));
  recentAttendancePage = Math.min(recentAttendancePage, totalRecentAttendancePages);
  const recentAttendanceStartIndex = (recentAttendancePage - 1) * RECENT_ATTENDANCE_PAGE_SIZE;
  const recentAttendancePageRecords = recentAttendanceRecords.slice(recentAttendanceStartIndex, recentAttendanceStartIndex + RECENT_ATTENDANCE_PAGE_SIZE);
  const recentAttendanceStartNumber = recentAttendanceRecords.length === 0 ? 0 : recentAttendanceStartIndex + 1;
  const recentAttendanceEndNumber = Math.min(recentAttendanceStartIndex + RECENT_ATTENDANCE_PAGE_SIZE, recentAttendanceRecords.length);

  // Auto-submit incomplete attendance at 7:30 PM
  let wasAutoSubmitted = false;
  const isPostEndOfDay = getCurrentMinutes() >= TIME_PERIODS.endOfDay;

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
        // Get all supervisors in the intern's department for multi-supervisor notifications
        const deptSupervisors = await getDepartmentSupervisors(profile.id);

        // Create approval record with primary supervisor (maintains backward compatibility)
        await supabase.from('approvals').insert({
          type: 'attendance',
          entity_id: todayRecord.id,
          intern_id: profile.id,
          supervisor_id: profile.supervisor_id,
        });

        // Notify all department supervisors
        if (deptSupervisors && deptSupervisors.length > 0) {
          // Create notification records for all supervisors
          const notifs = deptSupervisors.map(s => ({
            user_id: s.id,
            type: 'pending_approval',
            title: 'Attendance Auto-Submitted',
            message: `${profile.full_name}'s attendance for ${formatDate(today)} was auto-submitted with incomplete punches.`,
            entity_type: 'attendance',
            entity_id: todayRecord.id,
          }));
          await supabase.from('notifications').insert(notifs);

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
                  .badge { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                  .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                </style>
              </head>
              <body>
                <div class="container">
                  <div class="header">
                    <h1>Attendance Pending Review</h1>
                  </div>
                  <div class="content">
                    <p><strong>${profile.full_name}</strong> has submitted attendance for <strong>${formatDate(today)}</strong> <span class="badge">AUTO-SUBMITTED</span></p>
                    <p>The attendance was auto-submitted at end of day due to incomplete punches. Please review and approve or reject.</p>
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
              sendEmailNotification(supervisor.email, 'Attendance Auto-Submitted - Review Required', emailHtml)
                .catch(err => console.error('Failed to send attendance email to ' + supervisor.email + ':', err));
            }
          });
        }


        await logAudit('attendance.auto_submitted', 'attendance', todayRecord.id, {
          reason: 'End of day cutoff reached (7:00 PM)',
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
          ${todayRecord.is_outside_hours ? '<span class="badge-rejected ml-2">Overtime</span>' : ''}
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
        <p class="text-xs text-neutral-400 mt-3">Flexible timing: Morning punches available until noon · Afternoon punches available until 7:00 PM · Auto-submit at 7:00 PM</p>
      ` : ''}
    </div>

    <!-- Recent Attendance -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">Recent Attendance</h3>
        <p class="text-xs text-neutral-500">
          ${recentAttendanceRecords.length ? `Showing ${recentAttendanceStartNumber}–${recentAttendanceEndNumber} of ${recentAttendanceRecords.length}` : 'No records yet'}
        </p>
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
            ${recentAttendancePageRecords.map(record => `
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
                  ${record.is_outside_hours ? '<span class="badge-rejected">Overtime</span>' : ''}
                  ${record.admin_logged ? '<span class="badge-secondary">Admin</span>' : ''}
                  ${ipConsistencyBadge(record.ip_consistent, 'sm')}
                </td>
              </tr>
            `).join('')}
            ${(!recentAttendanceRecords.length) ? '<tr><td colspan="8" class="text-center text-neutral-400 py-8">No attendance records yet</td></tr>' : ''}
          </tbody>
        </table>
      </div>

      ${recentAttendanceRecords.length > RECENT_ATTENDANCE_PAGE_SIZE ? `
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-4 pt-4 border-t border-neutral-100">
          <p class="text-sm text-neutral-500">
            Page <strong class="text-neutral-700">${recentAttendancePage}</strong> of <strong class="text-neutral-700">${totalRecentAttendancePages}</strong>
          </p>
          <div class="flex items-center gap-2">
            <button id="recent-prev-page" class="btn-secondary" ${recentAttendancePage === 1 ? 'disabled' : ''}>← Previous</button>
            <button id="recent-next-page" class="btn-secondary" ${recentAttendancePage === totalRecentAttendancePages ? 'disabled' : ''}>Next →</button>
          </div>
        </div>
      ` : ''}
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
          const ipForDb = sanitizeIpForInet(ip);
          const { data, error } = await supabase.rpc('log_attendance_punch', {
            p_punch_type: punchType,
            p_ip_address: ipForDb,
          });

          if (error) throw error;
          todayRecord = Array.isArray(data) ? data[0] : data;

          if (!todayRecord?.id) {
            throw new Error('Attendance punch did not return a saved record');
          }

          const now = todayRecord[punchType] || new Date().toISOString();
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

          // Create approval entry for complete day or half-day attendance
          const shouldCreateApproval = 
            (punchType === 'time_out_2' && profile.supervisor_id) || // Complete day
            (punchType === 'time_out_1' && profile.supervisor_id && isPunchLocked('time_in_2')) || // AM half-day (morning complete, afternoon window closed)
            (punchType === 'time_out_2' && profile.supervisor_id && !todayRecord.time_in_1 && !todayRecord.time_out_1); // PM half-day (afternoon complete, morning missed)
          
          if (shouldCreateApproval) {
            await supabase.from('approvals').insert({
              type: 'attendance',
              entity_id: todayRecord.id,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
            });

            // Notify all supervisors in the same department
            const deptSupervisors = await getDepartmentSupervisors(profile.id);
            if (deptSupervisors.length > 0) {
              const isHalfDay = punchType === 'time_out_1' || (punchType === 'time_out_2' && !todayRecord.time_in_1 && !todayRecord.time_out_1);
            const isPMHalfDay = punchType === 'time_out_2' && !todayRecord.time_in_1 && !todayRecord.time_out_1;
              const notifPayload = deptSupervisors.map(sup => ({
                user_id: sup.id,
                type: 'pending_approval',
                title: 'Attendance Pending Review',
                message: `${profile.full_name} has submitted ${isPMHalfDay ? 'PM half-day' : isHalfDay ? 'AM half-day' : 'full-day'} attendance for ${formatDate(today)}`,
                entity_type: 'attendance',
                entity_id: todayRecord.id,
              }));
              await supabase.from('notifications').insert(notifPayload);

              // Send email notification to all department supervisors
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                      .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                      .badge { display: inline-block; background: #10b981; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                      .badge-half { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>Attendance Pending Review</h1>
                      </div>
                      <div class="content">
                        <p><strong>${profile.full_name}</strong> has submitted ${isPMHalfDay ? 'PM half-day' : isHalfDay ? 'AM half-day' : 'full-day'} attendance for <strong>${formatDate(today)}</strong> <span class="${isPMHalfDay || isHalfDay ? 'badge-half' : 'badge'}">${isPMHalfDay ? 'PM HALF-DAY' : isHalfDay ? 'AM HALF-DAY' : 'PENDING'}</span></p>
                        <p>${isPMHalfDay ? 'Afternoon punches have been recorded and the intern missed the morning shift.' : isHalfDay ? 'Morning punches have been recorded and the intern did not return for the afternoon shift.' : 'All punches have been recorded'} and are awaiting your review and approval.</p>
                        <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                      </div>
                      <div class="footer">
                        <p>This is an automated notification. Please do not reply to this email.</p>
                      </div>
                    </div>
                  </body>
                </html>
              `;
              for (const sup of deptSupervisors) {
                if (sup.email) {
                  sendEmailNotification(sup.email, 'Attendance Pending Review', emailHtml).catch(err => console.error('Failed to send attendance email to', sup.email, err));
                }
              }
            }
          }

          // Show narrative prompt for time-out punches
          if (punchType === 'time_out_1' || punchType === 'time_out_2') {
            // Check if narrative already submitted today
            const { data: existingNarratives } = await supabase
              .from('narratives')
              .select('session')
              .eq('intern_id', profile.id)
              .eq('date', today)
              .in('status', ['pending', 'approved', 'rejected']);

            const submittedCount = existingNarratives?.length || 0;

            // Only show prompt if not all narratives submitted
            if (submittedCount < 2) {
              // Fetch intern's tasks
              const { data: allTasks } = await supabase
                .from('tasks')
                .select('id, title, status, pending_status, approved_at')
                .eq('assigned_to', profile.id);

              const nowDate = new Date();
              const fortyEightHoursAgo = new Date(nowDate.getTime() - (48 * 60 * 60 * 1000));

              const tasks = (allTasks || []).filter(t => {
                if (t.status === 'not_started') return false;
                if (t.status === 'in_progress') return true;
                if (t.status === 'completed' && t.approved_at) {
                  const approvedDate = new Date(t.approved_at);
                  return approvedDate >= fortyEightHoursAgo;
                }
                return false;
              });

              if (tasks.length > 0) {
                await showNarrativePromptModal({
                  date: today,
                  isEndOfDay: punchType === 'time_out_2',
                  profile,
                  tasks,
                  onComplete: renderAttendancePage,
                });
                return; // Don't re-render page yet, prompt modal will handle it
              }
            }
          }

          // Re-render the page
          renderAttendancePage();
        } catch (err) {
          showToast(getAttendanceErrorMessage(err), 'error');
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

    const recentPrevBtn = el.querySelector('#recent-prev-page');
    const recentNextBtn = el.querySelector('#recent-next-page');

    recentPrevBtn?.addEventListener('click', async () => {
      if (recentAttendancePage > 1) {
        recentAttendancePage--;
        await renderAttendancePage();
      }
    });

    recentNextBtn?.addEventListener('click', async () => {
      if (recentAttendancePage < totalRecentAttendancePages) {
        recentAttendancePage++;
        await renderAttendancePage();
      }
    });
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
  const currentPeriod = getCurrentTimePeriod();
  const punchOrder = ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'];

  for (const punch of punchOrder) {
    // Already logged — skip
    if (record && record[punch]) continue;
    
    // Check if punch is locked based on flexible time logic
    if (isPunchLocked(punch)) continue;
    
    // Check if current time period allows this punch type
    const punchPeriod = PUNCH_PERIODS[punch];
    if (currentPeriod === 'morning' && punchPeriod !== 'morning') continue;
    if (currentPeriod === 'afternoon' && punchPeriod === 'morning') continue;
    
    // Special handling for PM half-day scenarios
    if (punch === 'time_in_2') {
      // Allow time_in_2 if no record exists (PM half-day start) OR if morning is complete
      if (record && record.time_in_1 && !record.time_out_1) continue; // Morning incomplete
      // Otherwise allow (either no record, or morning complete, or PM half-day in progress)
    }
    
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
          await supabase.from('approvals').insert({
            type: 'attendance_correction',
            entity_id: correctionData.id,
            intern_id: profile.id,
            supervisor_id: profile.supervisor_id,
          });
        }

        // Notify all department supervisors
        const deptSupervisors = await getDepartmentSupervisors(profile.id);
        if (deptSupervisors.length > 0) {
          const supervisorNotifs = deptSupervisors.map(sup => ({ user_id: sup.id, ...baseNotif }));
          await supabase.from('notifications').insert(supervisorNotifs);
        }

        // Also notify all active admins since only admins can approve corrections
        supabase
          .from('profiles')
          .select('id')
          .eq('role', 'admin')
          .eq('is_active', true)
          .then(({ data: admins }) => {
            if (!admins || admins.length === 0) return;
            // Filter out supervisors we already notified
            const supervisorIds = deptSupervisors.map(s => s.id);
            const adminNotifs = admins
              .filter(a => !supervisorIds.includes(a.id))
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
