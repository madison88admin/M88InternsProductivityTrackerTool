/**
 * Dashboard Page
 * Renders role-specific dashboard content.
 */
import { getUserRole, getProfile, refreshProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateKey, formatHoursDisplay, getTodayDate, computeEstimatedEndDate, renderAvatar, getMonday, getTrackingWeekStart, getTrackingWeekEnd, PH_TIMEZONE } from '../lib/utils.js';
import { isHoliday } from '../lib/holidays.js';
import { openOjtCompletionModal } from '../lib/ojt-completion.js';

export async function renderDashboard() {
  const role = getUserRole();
  const profile = getProfile();

  let content = '';

  switch (role) {
    case 'intern':
      content = await buildInternDashboard(profile);
      break;
    case 'supervisor':
      content = await buildSupervisorDashboard(profile);
      break;
    case 'admin':
      content = await buildAdminDashboard(profile);
      break;
    default:
      content = '<p>Unknown role. Contact your administrator.</p>';
  }

  renderLayout(content, (el) => {
    initDashboardCharts(role, el);

    // OJT completion review buttons (admin dashboard)
    el.querySelectorAll('.ojt-review-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        openOjtCompletionModal(btn.dataset.internId, renderDashboard);
      });
    });

    // Performance panel week filter (intern dashboard only)
    if (role === 'intern' && _internDashData) {
      let weekOffset = null; // null = All Time | 0 = this week | -1 = last week | …

      const weekLabel = el.querySelector('#perf-week-label');
      const prevBtn   = el.querySelector('#perf-prev');
      const nextBtn   = el.querySelector('#perf-next');
      const grid      = el.querySelector('#performance-kpi-grid');
      if (!grid) return;

      const refresh = async () => {
        let att, tasks, narr, ws;
        if (weekOffset === null) {
          att   = _internDashData.allAttendance;
          tasks = _internDashData.allTasks;
          narr  = _internDashData.allNarratives;
          ws    = getTrackingWeekStart(new Date());
          weekLabel.textContent = 'All Time';
        } else {
          const startDate = getTrackingWeekStart(new Date());
          startDate.setDate(startDate.getDate() + weekOffset * 7);
          const endDate = getTrackingWeekEnd(startDate);
          const start = formatDateKey(startDate);
          const end   = formatDateKey(endDate);
          att   = _internDashData.allAttendance.filter(r => r.date >= start && r.date <= end);
          tasks = _internDashData.allTasks.filter(t => t.due_date && t.due_date >= start && t.due_date <= end);
          narr  = _internDashData.allNarratives.filter(n => n.date >= start && n.date <= end);
          ws    = startDate;
          weekLabel.textContent = `${formatDate(startDate, { month: 'short', day: 'numeric', year: 'numeric' })} – ${formatDate(endDate, { month: 'short', day: 'numeric', year: 'numeric' })}`;
        }
        const dayEntries = getPerformanceWeekDayEntries(ws);
        const holidayMap = await buildHolidayMap(dayEntries.map(entry => entry.dateStr));
        nextBtn.disabled = weekOffset === null;
        grid.innerHTML = buildPerformanceKPIGrid(att, tasks, narr, ws, _internDashData.today, holidayMap);
      };

      // ← go back one week (or from All Time → this week)
      prevBtn.addEventListener('click', () => {
        weekOffset = weekOffset === null ? 0 : weekOffset - 1;
        nextBtn.disabled = false;
        refresh();
      });

      // → go forward one week (from this week → All Time)
      nextBtn.addEventListener('click', () => {
        if (weekOffset === null) return;
        weekOffset = weekOffset >= 0 ? null : weekOffset + 1;
        nextBtn.disabled = weekOffset === null;
        refresh();
      });
    }
  }, '/dashboard');
}

/** Cached intern KPI data — populated by buildAdminDashboard, consumed by initDashboardCharts */
let _internKPIData = [];

/** Raw data for the intern performance panel — used by the week filter */
let _internDashData = null;

function getPerformanceWeekDayEntries(weekStartDate) {
  const weekDays = [
    { label: 'Fri', offset: 0 },
    { label: 'Mon', offset: 3 },
    { label: 'Tue', offset: 4 },
    { label: 'Wed', offset: 5 },
    { label: 'Thu', offset: 6 },
  ];

  return weekDays.map(({ label, offset }) => {
    const d = new Date(weekStartDate);
    d.setDate(d.getDate() + offset);
    return { label, dateStr: d.toLocaleDateString('en-CA') };
  });
}

async function buildHolidayMap(dateStrings) {
  const entries = await Promise.all(dateStrings.map(async dateStr => [dateStr, await isHoliday(dateStr)]));
  return new Map(entries);
}

function escapeHtmlAttr(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const DASHBOARD_PUNCH_CUTOFFS = {
  time_in_1: 10 * 60 + 30,
  time_out_1: 13 * 60,
  time_in_2: 15 * 60,
  time_out_2: 19 * 60 + 30,
};

function getNowInPH() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: PH_TIMEZONE }));
}

function getCurrentMinutesInPH() {
  const now = getNowInPH();
  return now.getHours() * 60 + now.getMinutes();
}

function getDashboardPunchLabel(type) {
  const labels = {
    time_in_1: 'Morning In',
    time_out_1: 'Lunch Out',
    time_in_2: 'Afternoon In',
    time_out_2: 'End Day Out',
  };
  return labels[type] || 'Log Attendance';
}

function getNextDashboardPunch(record) {
  const currentMinutes = getCurrentMinutesInPH();
  const punchOrder = ['time_in_1', 'time_out_1', 'time_in_2', 'time_out_2'];

  for (const punch of punchOrder) {
    if (record?.[punch]) continue;
    if (currentMinutes >= DASHBOARD_PUNCH_CUTOFFS[punch]) continue;
    if (punch === 'time_out_1' && !record?.time_in_1) continue;
    if (punch === 'time_out_2' && !record?.time_in_2) continue;
    return punch;
  }

  return null;
}

function getInternAttendanceStatus(record) {
  if (record?.time_out_2) {
    return {
      label: 'Complete',
      colorClass: 'text-success-600',
    };
  }

  const nextPunch = getNextDashboardPunch(record);
  if (nextPunch) {
    return {
      label: `Next: ${getDashboardPunchLabel(nextPunch)}`,
      colorClass: 'text-primary-600',
    };
  }

  const hasSomePunches = !!(record?.time_in_1 || record?.time_out_1 || record?.time_in_2);
  if (hasSomePunches) {
    return {
      label: 'Auto-Submit Pending',
      colorClass: 'text-warning-600',
    };
  }

  return {
    label: 'No Punch Available',
    colorClass: 'text-neutral-500',
  };
}

async function buildInternDashboard(profile) {
  await refreshProfile();
  profile = getProfile();

  const today = getTodayDate();
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const dateFrom = ninetyDaysAgo.toLocaleDateString('en-CA');

  // ── Parallel data fetch (optimized with limits) ──────────────────────────
  const [attTodayRes, allAttRes, allTasksRes, allNarrativesRes, notifsRes] = await Promise.all([
    supabase.from('attendance_records').select('*').eq('intern_id', profile.id).eq('date', today).maybeSingle(),
    supabase.from('attendance_records').select('total_hours, is_late, status, date').eq('intern_id', profile.id).gte('date', dateFrom).order('date', { ascending: false }).limit(200),
    supabase.from('tasks').select('status, due_date, is_archived').eq('assigned_to', profile.id).order('created_at', { ascending: false }).limit(100),
    supabase.from('narratives').select('status, date').eq('intern_id', profile.id).neq('status', 'draft').gte('date', dateFrom).order('date', { ascending: false }).limit(150),
    supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', profile.id).eq('is_read', false),
  ]);

  const todayAttendance = attTodayRes.data;
  const allAttendance   = allAttRes.data || [];
  const allTasks        = (allTasksRes.data || []).filter(t => !t.is_archived);
  const allNarratives   = allNarrativesRes.data || [];
  const unreadNotifs    = notifsRes.count || 0;

  // Store for the week-filter re-render
  _internDashData = { allAttendance, allTasks, allNarratives, today };

  // ── OJT progress ──────────────────────────────────────────────────────────
  const approvedAtt   = allAttendance.filter(r => r.status === 'approved');
  const hoursRendered = approvedAtt.reduce((s, r) => s + (r.total_hours || 0), 0);
  const daysWorked    = approvedAtt.length;
  const hoursRequired = profile.hours_required || 0;
  const progress      = hoursRequired > 0 ? Math.min(100, (hoursRendered / hoursRequired) * 100) : 0;
  const estimatedEnd  = computeEstimatedEndDate(hoursRequired, hoursRendered, daysWorked);
  const avgDailyHours = daysWorked > 0 ? hoursRendered / daysWorked : 8;
  const remainingHours   = Math.max(0, hoursRequired - hoursRendered);
  const weekdaysRemaining = avgDailyHours > 0 ? Math.ceil(remainingHours / avgDailyHours) : 0;

  // ── Attendance KPIs ───────────────────────────────────────────────────────
  const lateCount      = approvedAtt.filter(r => r.is_late).length;
  const onTimeCount    = daysWorked - lateCount;
  const onTimeRate     = daysWorked > 0 ? Math.round((onTimeCount / daysWorked) * 100) : null;
  const pendingAttCount  = allAttendance.filter(r => r.status === 'pending').length;
  const rejectedAttCount = allAttendance.filter(r => r.status === 'rejected').length;

  // This-week day status dots (Fri, Mon-Thu)
  const thisWeekStart = getTrackingWeekStart(new Date());
  const thisWeekEntries = getPerformanceWeekDayEntries(thisWeekStart);
  const thisWeekHolidayMap = await buildHolidayMap(thisWeekEntries.map(entry => entry.dateStr));
  const thisWeekDotsHtml = thisWeekEntries.map(({ label, dateStr }) => {
    const isFuture = dateStr > today;
    const isToday  = dateStr === today;
    const rec = allAttendance.find(r => r.date === dateStr);
    const holidayInfo = thisWeekHolidayMap.get(dateStr);
    let dotStyle, symbol, tooltipText;
    if (holidayInfo?.isHoliday) {
      dotStyle = 'background:var(--color-warning-100);color:var(--color-warning-700);';
      symbol = icons.calendar;
      tooltipText = `${label}: Holiday${holidayInfo.name ? ` - ${holidayInfo.name}` : ''}`;
    } else if (isFuture) {
      dotStyle = 'background:var(--color-neutral-100);color:var(--color-neutral-300);';
      symbol = '·';
      tooltipText = `${label}: Future date`;
    } else if (rec?.status === 'approved') {
      dotStyle = rec.is_late
        ? 'background:var(--color-warning-100);color:var(--color-warning-700);'
        : 'background:var(--color-success-100);color:var(--color-success-700);';
      symbol = rec.is_late ? '!' : '✓';
      tooltipText = rec.is_late
        ? `${label}: Approved - Late arrival`
        : `${label}: Approved attendance`;
    } else if (rec?.status === 'pending') {
      dotStyle = 'background:var(--color-primary-50);color:var(--color-primary-600);';
      symbol = '~';
      tooltipText = `${label}: Pending approval`;
    } else {
      dotStyle = 'background:var(--color-danger-50);color:var(--color-danger-400);';
      symbol = '✗';
      tooltipText = `${label}: No attendance record`;
    }
    return `
      <div class="flex flex-col items-center gap-1">
        <div class="performance-day-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isToday ? 'ring-2 ring-offset-1 ring-primary-400' : ''}" style="${dotStyle}" data-tooltip="${escapeHtmlAttr(tooltipText)}" aria-label="${escapeHtmlAttr(tooltipText)}">${symbol}</div>
        <span class="text-xs font-medium ${isToday ? 'text-primary-600' : 'text-neutral-400'}">${label}</span>
      </div>`;
  }).join('');

  // ── Task KPIs ─────────────────────────────────────────────────────────────
  const completedTasks  = allTasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = allTasks.filter(t => t.status === 'in_progress').length;
  const notStartedTasks = allTasks.filter(t => t.status === 'not_started').length;
  const totalTasks      = allTasks.length;
  const activeTasks     = inProgressTasks + notStartedTasks;
  const taskRate        = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;
  const overdueTasks    = allTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed').length;

  // ── Narrative KPIs ────────────────────────────────────────────────────────
  const approvedNarr  = allNarratives.filter(n => n.status === 'approved').length;
  const pendingNarr   = allNarratives.filter(n => n.status === 'pending').length;
  const rejectedNarr  = allNarratives.filter(n => n.status === 'rejected').length;
  const totalNarr     = allNarratives.length;
  const reviewedNarr  = approvedNarr + rejectedNarr;
  const narrativeRate = reviewedNarr > 0 ? Math.round((approvedNarr / reviewedNarr) * 100) : null;

  // ── Today's attendance status ─────────────────────────────────────────────
  const attendanceState = getInternAttendanceStatus(todayAttendance);
  const attendanceStatus = attendanceState.label;
  const attendanceColor = attendanceState.colorClass;

  // ── KPI score helpers ─────────────────────────────────────────────────────
  // Returns color class + bar hex based on rate value (null = no data)
  const kpiScore = (rate) => {
    if (rate === null) return { textClass: 'text-neutral-400', barColor: '#e2e8f0', label: '—' };
    if (rate >= 90)    return { textClass: 'text-success-600', barColor: '#22c55e', label: rate + '%' };
    if (rate >= 70)    return { textClass: 'text-warning-600', barColor: '#f59e0b', label: rate + '%' };
    return               { textClass: 'text-danger-600',  barColor: '#ef4444', label: rate + '%' };
  };

  const attScore  = kpiScore(onTimeRate);
  const taskScr   = kpiScore(taskRate);
  const narrScore = kpiScore(narrativeRate);

  // Stat row helper used inside each KPI card
  const statRow = (label, value, valueClass = 'text-neutral-800') =>
    `<div class="flex justify-between items-center py-1.5" style="border-bottom:1px solid var(--color-neutral-50);">
       <span class="text-xs text-neutral-500">${label}</span>
       <span class="text-xs font-bold ${valueClass}">${value}</span>
     </div>`;

  return `
    <div class="page-header animate-fade-in-up">
      <p class="text-sm font-medium text-primary-600 mb-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <h1 class="page-title">Welcome back, ${profile.full_name?.split(' ')[0] || 'Intern'}!</h1>
      <p class="page-subtitle">Here's an overview of your OJT progress and activities today.</p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 stagger-children">
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Today's Status</p>
            <p class="text-xl font-bold mt-2 ${attendanceColor}">${attendanceStatus}</p>
          </div>
          <div class="action-icon bg-primary-50 text-primary-600">${icons.clock}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Active Tasks</p>
            <p class="text-xl font-bold mt-2 ${activeTasks > 0 ? 'text-warning-600' : 'text-neutral-900'}">${activeTasks}</p>
          </div>
          <div class="action-icon bg-warning-50 text-warning-600">${icons.tasks}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Pending Narratives</p>
            <p class="text-xl font-bold mt-2 ${pendingNarr > 0 ? 'text-primary-600' : 'text-neutral-900'}">${pendingNarr}</p>
          </div>
          <div class="action-icon bg-success-50 text-success-600">${icons.narrative}</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Notifications</p>
            <p class="text-xl font-bold mt-2 ${unreadNotifs > 0 ? 'text-danger-600' : 'text-neutral-900'}">${unreadNotifs}</p>
          </div>
          <div class="action-icon bg-danger-50 text-danger-600">${icons.bell}</div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 stagger-children" style="animation-delay: 500ms;">
      <a href="#/attendance" class="action-card">
        <div class="action-icon bg-primary-50 text-primary-600">${icons.clock}</div>
        <div>
          <p class="font-semibold text-neutral-900">Log Attendance</p>
          <p class="text-sm text-neutral-500 mt-0.5">Record time-in / time-out</p>
        </div>
      </a>
      <a href="#/my-tasks" class="action-card">
        <div class="action-icon bg-warning-50 text-warning-600">${icons.tasks}</div>
        <div>
          <p class="font-semibold text-neutral-900">View Tasks</p>
          <p class="text-sm text-neutral-500 mt-0.5">Check your assignments</p>
        </div>
      </a>
      <a href="#/narratives" class="action-card">
        <div class="action-icon bg-success-50 text-success-600">${icons.narrative}</div>
        <div>
          <p class="font-semibold text-neutral-900">Submit Narrative</p>
          <p class="text-sm text-neutral-500 mt-0.5">Write daily activity report</p>
        </div>
      </a>
    </div>

    <!-- ═══════════════ PERFORMANCE KPI PANEL ═══════════════ -->
    <div class="card animate-fade-in-up" style="animation-delay: 750ms;">
      <div class="flex items-start justify-between mb-6">
        <div>
          <h3 class="text-base font-bold text-neutral-900">My Performance Overview</h3>
          <p class="text-sm text-neutral-500 mt-0.5">A breakdown across all areas</p>
        </div>
        <div class="flex items-center gap-1.5">
          <button id="perf-prev" class="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors border border-neutral-200" title="Previous week">&#8249;</button>
          <span id="perf-week-label" class="text-xs font-semibold text-neutral-600 min-w-32.5 text-center px-1">All Time</span>
          <button id="perf-next" class="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-500 hover:bg-neutral-100 transition-colors border border-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed" disabled title="Next week">&#8250;</button>
        </div>
      </div>

      <div id="performance-kpi-grid" class="grid grid-cols-1 md:grid-cols-3 gap-5">

        <!-- ▸ Attendance KPI ─────────────────────────────────────────────── -->
        <div class="rounded-xl p-4" style="border: 1px solid var(--color-neutral-100);">
          <!-- Header -->
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-primary-50 text-primary-600">${icons.clock}</div>
            <p class="text-sm font-bold text-neutral-800">Attendance</p>
          </div>

          <!-- Primary rate -->
          <div class="flex items-end justify-between mb-2">
            <div>
              <p class="text-3xl font-bold ${attScore.textClass}">${attScore.label}</p>
              <p class="text-xs text-neutral-400 mt-0.5">on-time rate</p>
            </div>
            ${onTimeRate !== null ? `
              <div class="text-right">
                <p class="text-xs font-semibold text-neutral-500">${onTimeCount} on-time</p>
                <p class="text-xs text-neutral-400">${lateCount} late</p>
              </div>
            ` : ''}
          </div>
          <div class="h-1.5 rounded-full mb-4 overflow-hidden" style="background: var(--color-neutral-100);">
            <div class="h-full rounded-full transition-all" style="width: ${onTimeRate ?? 0}%; background: ${attScore.barColor};"></div>
          </div>

          <!-- This-week tracker -->
          <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">This Week</p>
          <div class="flex items-center justify-between mb-4">
            ${thisWeekDotsHtml}
          </div>

          <!-- Stat rows -->
          <div class="space-y-0">
            ${statRow('Approved Days', daysWorked)}
            ${statRow('Late Arrivals', lateCount, lateCount > 3 ? 'text-warning-600' : 'text-neutral-800')}
            ${statRow('Pending Approval', pendingAttCount, pendingAttCount > 0 ? 'text-primary-600' : 'text-neutral-800')}
            ${statRow('Rejected', rejectedAttCount, rejectedAttCount > 0 ? 'text-danger-600' : 'text-neutral-800')}
          </div>
        </div>

        <!-- ▸ Tasks KPI ───────────────────────────────────────────────────── -->
        <div class="rounded-xl p-4" style="border: 1px solid var(--color-neutral-100);">
          <!-- Header -->
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-warning-50 text-warning-600">${icons.tasks}</div>
            <p class="text-sm font-bold text-neutral-800">Tasks</p>
          </div>

          <!-- Primary rate -->
          <div class="flex items-end justify-between mb-2">
            <div>
              <p class="text-3xl font-bold ${taskScr.textClass}">${taskScr.label}</p>
              <p class="text-xs text-neutral-400 mt-0.5">completion rate</p>
            </div>
            ${totalTasks > 0 ? `
              <div class="text-right">
                <p class="text-xs font-semibold text-neutral-500">${completedTasks}/${totalTasks} done</p>
                ${overdueTasks > 0 ? `<p class="text-xs font-semibold text-danger-500">${overdueTasks} overdue</p>` : '<p class="text-xs text-neutral-400">0 overdue</p>'}
              </div>
            ` : ''}
          </div>
          <div class="h-1.5 rounded-full mb-4 overflow-hidden" style="background: var(--color-neutral-100);">
            <div class="h-full rounded-full transition-all" style="width: ${taskRate ?? 0}%; background: ${taskScr.barColor};"></div>
          </div>

          <!-- Status breakdown mini bars -->
          ${totalTasks > 0 ? `
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Breakdown</p>
            <div class="space-y-2 mb-4">
              ${[
                { label: 'Completed',    count: completedTasks,  color: '#22c55e' },
                { label: 'In Progress',  count: inProgressTasks, color: '#6366f1' },
                { label: 'Not Started',  count: notStartedTasks, color: '#94a3b8' },
              ].map(item => `
                <div class="flex items-center gap-2">
                  <span class="text-xs text-neutral-500 w-20 shrink-0">${item.label}</span>
                  <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--color-neutral-100);">
                    <div class="h-full rounded-full" style="width: ${totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0}%; background: ${item.color};"></div>
                  </div>
                  <span class="text-xs font-bold text-neutral-600 w-4 text-right shrink-0">${item.count}</span>
                </div>
              `).join('')}
            </div>
          ` : `<p class="text-xs text-neutral-400 mb-4">No tasks assigned yet.</p>`}

          <!-- Stat rows -->
          <div class="space-y-0">
            ${statRow('Total Tasks', totalTasks)}
            ${statRow('Active (pending work)', activeTasks, activeTasks > 0 ? 'text-warning-600' : 'text-neutral-800')}
            ${statRow('Overdue', overdueTasks, overdueTasks > 0 ? 'text-danger-600' : 'text-neutral-800')}
          </div>
        </div>

        <!-- ▸ Narratives KPI ─────────────────────────────────────────────── -->
        <div class="rounded-xl p-4" style="border: 1px solid var(--color-neutral-100);">
          <!-- Header -->
          <div class="flex items-center gap-2 mb-4">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-success-50 text-success-600">${icons.narrative}</div>
            <p class="text-sm font-bold text-neutral-800">Narratives</p>
          </div>

          <!-- Primary rate -->
          <div class="flex items-end justify-between mb-2">
            <div>
              <p class="text-3xl font-bold ${narrScore.textClass}">${narrScore.label}</p>
              <p class="text-xs text-neutral-400 mt-0.5">approval rate</p>
            </div>
            ${totalNarr > 0 ? `
              <div class="text-right">
                <p class="text-xs font-semibold text-neutral-500">${approvedNarr} approved</p>
                <p class="text-xs text-neutral-400">${totalNarr} total</p>
              </div>
            ` : ''}
          </div>
          <div class="h-1.5 rounded-full mb-4 overflow-hidden" style="background: var(--color-neutral-100);">
            <div class="h-full rounded-full transition-all" style="width: ${narrativeRate ?? 0}%; background: ${narrScore.barColor};"></div>
          </div>

          <!-- Status breakdown mini bars -->
          ${totalNarr > 0 ? `
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Breakdown</p>
            <div class="space-y-2 mb-4">
              ${[
                { label: 'Approved',  count: approvedNarr, color: '#22c55e' },
                { label: 'Pending',   count: pendingNarr,  color: '#6366f1' },
                { label: 'Rejected',  count: rejectedNarr, color: '#ef4444' },
              ].map(item => `
                <div class="flex items-center gap-2">
                  <span class="text-xs text-neutral-500 w-20 shrink-0">${item.label}</span>
                  <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--color-neutral-100);">
                    <div class="h-full rounded-full" style="width: ${totalNarr > 0 ? Math.round((item.count / totalNarr) * 100) : 0}%; background: ${item.color};"></div>
                  </div>
                  <span class="text-xs font-bold text-neutral-600 w-4 text-right shrink-0">${item.count}</span>
                </div>
              `).join('')}
            </div>
          ` : `<p class="text-xs text-neutral-400 mb-4">No narratives submitted yet.</p>`}

          <!-- Stat rows -->
          <div class="space-y-0">
            ${statRow('Total Submitted', totalNarr)}
            ${statRow('Approved', approvedNarr, approvedNarr > 0 ? 'text-success-600' : 'text-neutral-800')}
            ${statRow('Pending Review', pendingNarr, pendingNarr > 0 ? 'text-primary-600' : 'text-neutral-800')}
            ${statRow('Rejected', rejectedNarr, rejectedNarr > 0 ? 'text-danger-600' : 'text-neutral-800')}
          </div>
        </div>

      </div>
    </div>

    <br>

    <!-- OJT Progress -->
    <div class="card mb-8 animate-fade-in-up" style="animation-delay: 1000ms;">
      <div class="flex items-center justify-between mb-5">
        <div>
          <h3 class="text-base font-bold text-neutral-900">OJT Progress</h3>
          <p class="text-sm text-neutral-500 mt-0.5">Track your on-the-job training completion</p>
        </div>
        <span class="text-2xl font-bold text-primary-600">${progress.toFixed(1)}%</span>
      </div>
      <div class="progress-bar-track mb-4">
        <div class="progress-bar-fill" style="width: ${progress.toFixed(1)}%"></div>
      </div>
      <div class="flex justify-between text-sm">
        <span class="text-neutral-500"><span class="font-semibold text-neutral-700">${formatHoursDisplay(hoursRendered)}</span> rendered</span>
        <span class="text-neutral-500"><span class="font-semibold text-neutral-700">${formatHoursDisplay(hoursRequired)}</span> required</span>
      </div>
      ${hoursRequired > 0 && hoursRendered < hoursRequired && estimatedEnd ? `
        <div class="flex items-center justify-between mt-4 pt-4" style="border-top: 1px solid var(--color-neutral-100);">
          <div>
            <p class="text-sm font-semibold text-neutral-700">${icons.calendar} Estimated Completion</p>
            <p class="text-xs text-neutral-400 mt-0.5">~${weekdaysRemaining} weekdays remaining · ${avgDailyHours.toFixed(1)} hrs/day avg</p>
          </div>
          <p class="text-sm font-bold text-primary-600">${formatDate(estimatedEnd)}</p>
        </div>
      ` : hoursRendered >= hoursRequired && hoursRequired > 0 ? `
        <p class="text-sm font-semibold text-success-600 mt-4">OJT Hours Completed!</p>
      ` : ''}
    </div>

    <!-- Weekly Hours Chart -->
    <div class="card mb-6 animate-fade-in-up" style="animation-delay: 1250ms;">
      <h3 class="text-base font-bold text-neutral-900 mb-1">This Week's Hours</h3>
      <p class="text-sm text-neutral-500 mb-4">Your daily attendance log for the current week</p>
      <div class="flex items-center gap-2 text-sm text-neutral-600 mb-4">
        ${icons.clock}
        <span>Total Hours This Week: <strong id="weekly-hours-total">0h</strong></span>
      </div>
      <div style="position: relative; height: 220px;">
        <canvas id="weekly-hours-chart"></canvas>
      </div>
    </div>
  `;
}

/**
 * Build the 3-column performance KPI grid HTML.
 * Called on initial render (via buildInternDashboard) and on every week filter change.
 * @param {Array}  att       Attendance records to include (filtered or full)
 * @param {Array}  tasks     Tasks to include (filtered or full)
 * @param {Array}  narr      Narratives to include (filtered or full)
 * @param {Date}   weekStart Friday of the week used for the attendance day-dots
 * @param {string} today     YYYY-MM-DD string for "today"
 * @param {Map}    holidayMap Map of date string to holiday info
 */
function buildPerformanceKPIGrid(att, tasks, narr, weekStart, today, holidayMap = new Map()) {
  // ── Attendance KPIs ──────────────────────────────────────────────────────
  const approvedAtt      = att.filter(r => r.status === 'approved');
  const daysWorked       = approvedAtt.length;
  const lateCount        = approvedAtt.filter(r => r.is_late).length;
  const onTimeCount      = daysWorked - lateCount;
  const onTimeRate       = daysWorked > 0 ? Math.round((onTimeCount / daysWorked) * 100) : null;
  const pendingAttCount  = att.filter(r => r.status === 'pending').length;
  const rejectedAttCount = att.filter(r => r.status === 'rejected').length;

  // ── Task KPIs ─────────────────────────────────────────────────────────────
  const completedTasks  = tasks.filter(t => t.status === 'completed').length;
  const inProgressTasks = tasks.filter(t => t.status === 'in_progress').length;
  const notStartedTasks = tasks.filter(t => t.status === 'not_started').length;
  const totalTasks      = tasks.length;
  const activeTasks     = inProgressTasks + notStartedTasks;
  const taskRate        = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null;
  const overdueTasks    = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed').length;

  // ── Narrative KPIs ────────────────────────────────────────────────────────
  const approvedNarr  = narr.filter(n => n.status === 'approved').length;
  const pendingNarr   = narr.filter(n => n.status === 'pending').length;
  const rejectedNarr  = narr.filter(n => n.status === 'rejected').length;
  const totalNarr     = narr.length;
  const reviewedNarr  = approvedNarr + rejectedNarr;
  const narrativeRate = reviewedNarr > 0 ? Math.round((approvedNarr / reviewedNarr) * 100) : null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const kpiScore = rate => {
    if (rate === null) return { textClass: 'text-neutral-400', barColor: '#e2e8f0', label: '—' };
    if (rate >= 90)    return { textClass: 'text-success-600', barColor: '#22c55e', label: rate + '%' };
    if (rate >= 70)    return { textClass: 'text-warning-600', barColor: '#f59e0b', label: rate + '%' };
    return               { textClass: 'text-danger-600',  barColor: '#ef4444', label: rate + '%' };
  };
  const attScore  = kpiScore(onTimeRate);
  const taskScr   = kpiScore(taskRate);
  const narrScore = kpiScore(narrativeRate);
  const statRow = (label, value, valueClass = 'text-neutral-800') =>
    `<div class="flex justify-between items-center py-1.5" style="border-bottom:1px solid var(--color-neutral-50);">
       <span class="text-xs text-neutral-500">${label}</span>
       <span class="text-xs font-bold ${valueClass}">${value}</span>
     </div>`;

  // ── Week day-dots (Fri, Mon–Thu of the given weekStart) ──────────────────
  const weekDays = [
    { label: 'Fri', offset: 0 },
    { label: 'Mon', offset: 3 },
    { label: 'Tue', offset: 4 },
    { label: 'Wed', offset: 5 },
    { label: 'Thu', offset: 6 },
  ];
  const thisWeekDotsHtml = weekDays.map(({ label, offset }) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + offset);
    const dateStr  = d.toLocaleDateString('en-CA');
    const isFuture = dateStr > today;
    const isToday  = dateStr === today;
    const rec = att.find(r => r.date === dateStr);
    const holidayInfo = holidayMap.get(dateStr);
    let dotStyle, symbol, tooltipText;
    if (holidayInfo?.isHoliday) {
      dotStyle = 'background:var(--color-warning-100);color:var(--color-warning-700);';
      symbol = icons.calendar;
      tooltipText = `${label}: Holiday${holidayInfo.name ? ` - ${holidayInfo.name}` : ''}`;
    } else if (isFuture) {
      dotStyle = 'background:var(--color-neutral-100);color:var(--color-neutral-300);';
      symbol = '·';
      tooltipText = `${label}: Future date`;
    } else if (rec?.status === 'approved') {
      dotStyle = rec.is_late
        ? 'background:var(--color-warning-100);color:var(--color-warning-700);'
        : 'background:var(--color-success-100);color:var(--color-success-700);';
      symbol = rec.is_late ? '!' : '✓';
      tooltipText = rec.is_late
        ? `${label}: Approved - Late arrival`
        : `${label}: Approved attendance`;
    } else if (rec?.status === 'pending') {
      dotStyle = 'background:var(--color-primary-50);color:var(--color-primary-600);';
      symbol = '~';
      tooltipText = `${label}: Pending approval`;
    } else {
      dotStyle = 'background:var(--color-danger-50);color:var(--color-danger-400);';
      symbol = '✗';
      tooltipText = `${label}: No attendance record`;
    }
    return `
      <div class="flex flex-col items-center gap-1">
        <div class="performance-day-dot w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${isToday ? 'ring-2 ring-offset-1 ring-primary-400' : ''}" style="${dotStyle}" data-tooltip="${escapeHtmlAttr(tooltipText)}" aria-label="${escapeHtmlAttr(tooltipText)}">${symbol}</div>
        <span class="text-xs font-medium ${isToday ? 'text-primary-600' : 'text-neutral-400'}">${label}</span>
      </div>`;
  }).join('');

  return `
    <!-- ▸ Attendance KPI ─────────────────────────────────────────────── -->
    <div class="rounded-xl p-4" style="border: 1px solid var(--color-neutral-100);">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-primary-50 text-primary-600">${icons.clock}</div>
        <p class="text-sm font-bold text-neutral-800">Attendance</p>
      </div>
      <div class="flex items-end justify-between mb-2">
        <div>
          <p class="text-3xl font-bold ${attScore.textClass}">${attScore.label}</p>
          <p class="text-xs text-neutral-400 mt-0.5">on-time rate</p>
        </div>
        ${onTimeRate !== null ? `
          <div class="text-right">
            <p class="text-xs font-semibold text-neutral-500">${onTimeCount} on-time</p>
            <p class="text-xs text-neutral-400">${lateCount} late</p>
          </div>
        ` : ''}
      </div>
      <div class="h-1.5 rounded-full mb-4 overflow-hidden" style="background: var(--color-neutral-100);">
        <div class="h-full rounded-full transition-all" style="width: ${onTimeRate ?? 0}%; background: ${attScore.barColor};"></div>
      </div>
      <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">This Week</p>
      <div class="flex items-center justify-between mb-4">
        ${thisWeekDotsHtml}
      </div>
      <div class="space-y-0">
        ${statRow('Approved Days', daysWorked)}
        ${statRow('Late Arrivals', lateCount, lateCount > 3 ? 'text-warning-600' : 'text-neutral-800')}
        ${statRow('Pending Approval', pendingAttCount, pendingAttCount > 0 ? 'text-primary-600' : 'text-neutral-800')}
        ${statRow('Rejected', rejectedAttCount, rejectedAttCount > 0 ? 'text-danger-600' : 'text-neutral-800')}
      </div>
    </div>

    <!-- ▸ Tasks KPI ───────────────────────────────────────────────────── -->
    <div class="rounded-xl p-4" style="border: 1px solid var(--color-neutral-100);">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-warning-50 text-warning-600">${icons.tasks}</div>
        <p class="text-sm font-bold text-neutral-800">Tasks</p>
      </div>
      <div class="flex items-end justify-between mb-2">
        <div>
          <p class="text-3xl font-bold ${taskScr.textClass}">${taskScr.label}</p>
          <p class="text-xs text-neutral-400 mt-0.5">completion rate</p>
        </div>
        ${totalTasks > 0 ? `
          <div class="text-right">
            <p class="text-xs font-semibold text-neutral-500">${completedTasks}/${totalTasks} done</p>
            ${overdueTasks > 0 ? `<p class="text-xs font-semibold text-danger-500">${overdueTasks} overdue</p>` : '<p class="text-xs text-neutral-400">0 overdue</p>'}
          </div>
        ` : ''}
      </div>
      <div class="h-1.5 rounded-full mb-4 overflow-hidden" style="background: var(--color-neutral-100);">
        <div class="h-full rounded-full transition-all" style="width: ${taskRate ?? 0}%; background: ${taskScr.barColor};"></div>
      </div>
      ${totalTasks > 0 ? `
        <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Breakdown</p>
        <div class="space-y-2 mb-4">
          ${[
            { label: 'Completed',    count: completedTasks,  color: '#22c55e' },
            { label: 'In Progress',  count: inProgressTasks, color: '#6366f1' },
            { label: 'Not Started',  count: notStartedTasks, color: '#94a3b8' },
          ].map(item => `
            <div class="flex items-center gap-2">
              <span class="text-xs text-neutral-500 w-20 shrink-0">${item.label}</span>
              <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--color-neutral-100);">
                <div class="h-full rounded-full" style="width: ${totalTasks > 0 ? Math.round((item.count / totalTasks) * 100) : 0}%; background: ${item.color};"></div>
              </div>
              <span class="text-xs font-bold text-neutral-600 w-4 text-right shrink-0">${item.count}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-xs text-neutral-400 mb-4">No tasks assigned yet.</p>`}
      <div class="space-y-0">
        ${statRow('Total Tasks', totalTasks)}
        ${statRow('Active (pending work)', activeTasks, activeTasks > 0 ? 'text-warning-600' : 'text-neutral-800')}
        ${statRow('Overdue', overdueTasks, overdueTasks > 0 ? 'text-danger-600' : 'text-neutral-800')}
      </div>
    </div>

    <!-- ▸ Narratives KPI ─────────────────────────────────────────────── -->
    <div class="rounded-xl p-4" style="border: 1px solid var(--color-neutral-100);">
      <div class="flex items-center gap-2 mb-4">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center bg-success-50 text-success-600">${icons.narrative}</div>
        <p class="text-sm font-bold text-neutral-800">Narratives</p>
      </div>
      <div class="flex items-end justify-between mb-2">
        <div>
          <p class="text-3xl font-bold ${narrScore.textClass}">${narrScore.label}</p>
          <p class="text-xs text-neutral-400 mt-0.5">approval rate</p>
        </div>
        ${totalNarr > 0 ? `
          <div class="text-right">
            <p class="text-xs font-semibold text-neutral-500">${approvedNarr} approved</p>
            <p class="text-xs text-neutral-400">${totalNarr} total</p>
          </div>
        ` : ''}
      </div>
      <div class="h-1.5 rounded-full mb-4 overflow-hidden" style="background: var(--color-neutral-100);">
        <div class="h-full rounded-full transition-all" style="width: ${narrativeRate ?? 0}%; background: ${narrScore.barColor};"></div>
      </div>
      ${totalNarr > 0 ? `
        <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">Breakdown</p>
        <div class="space-y-2 mb-4">
          ${[
            { label: 'Approved',  count: approvedNarr, color: '#22c55e' },
            { label: 'Pending',   count: pendingNarr,  color: '#6366f1' },
            { label: 'Rejected',  count: rejectedNarr, color: '#ef4444' },
          ].map(item => `
            <div class="flex items-center gap-2">
              <span class="text-xs text-neutral-500 w-20 shrink-0">${item.label}</span>
              <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--color-neutral-100);">
                <div class="h-full rounded-full" style="width: ${totalNarr > 0 ? Math.round((item.count / totalNarr) * 100) : 0}%; background: ${item.color};"></div>
              </div>
              <span class="text-xs font-bold text-neutral-600 w-4 text-right shrink-0">${item.count}</span>
            </div>
          `).join('')}
        </div>
      ` : `<p class="text-xs text-neutral-400 mb-4">No narratives submitted yet.</p>`}
      <div class="space-y-0">
        ${statRow('Total Submitted', totalNarr)}
        ${statRow('Approved', approvedNarr, approvedNarr > 0 ? 'text-success-600' : 'text-neutral-800')}
        ${statRow('Pending Review', pendingNarr, pendingNarr > 0 ? 'text-primary-600' : 'text-neutral-800')}
        ${statRow('Rejected', rejectedNarr, rejectedNarr > 0 ? 'text-danger-600' : 'text-neutral-800')}
      </div>
    </div>
  `;
}

async function buildSupervisorDashboard(profile) {
  const today = getTodayDate();

  // ── Resolve department-level supervisor IDs for shared-dept visibility ───────
  let deptSupervisorIds = [profile.id];
  if (profile.department_id) {
    const { data: deptSups } = await supabase
      .from('profiles')
      .select('id')
      .eq('department_id', profile.department_id)
      .eq('role', 'supervisor');
    deptSupervisorIds = (deptSups || []).map(s => s.id);
    if (!deptSupervisorIds.includes(profile.id)) deptSupervisorIds.push(profile.id);
  }
  const hasDept = !!profile.department_id;

  // ── Stats + intern list in parallel ─────────────────────────────────────────
  let approvalsQuery = supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  let tasksQuery = supabase.from('tasks').select('*', { count: 'exact', head: true }).in('status', ['not_started', 'in_progress']);
  let internsQuery = supabase.from('profiles')
    .select('id, full_name, avatar_url, hours_required, hours_rendered, ojt_start_date, is_voluntary, department:departments(name)')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  if (hasDept) {
    approvalsQuery = approvalsQuery.in('supervisor_id', deptSupervisorIds);
    tasksQuery = tasksQuery.in('created_by', deptSupervisorIds);
    internsQuery = internsQuery.eq('department_id', profile.department_id);
  } else {
    approvalsQuery = approvalsQuery.eq('supervisor_id', profile.id);
    tasksQuery = tasksQuery.eq('created_by', profile.id);
    internsQuery = internsQuery.eq('supervisor_id', profile.id);
  }

  const [
    { count: pendingApprovals },
    { count: activeTasks },
    { data: interns },
  ] = await Promise.all([approvalsQuery, tasksQuery, internsQuery]);

  const teamSize = (interns || []).length;
  const internIds = (interns || []).map(i => i.id);
  let allAttendance = [];
  let allTasks = [];

  if (internIds.length > 0) {
    const [attRes, taskRes] = await Promise.all([
      supabase.from('attendance_records').select('intern_id, total_hours, is_late').in('intern_id', internIds).eq('status', 'approved'),
      supabase.from('tasks').select('assigned_to, status, due_date, is_archived').in('assigned_to', internIds),
    ]);
    allAttendance = attRes.data || [];
    allTasks = taskRes.data || [];
  }

  // Compute per-intern KPIs
  const internKPIs = (interns || []).map(intern => {
    const attendance = allAttendance.filter(a => a.intern_id === intern.id);
    const tasks = allTasks.filter(t => t.assigned_to === intern.id && !t.is_archived);

    const hoursRendered = intern.hours_rendered || attendance.reduce((s, a) => s + (a.total_hours || 0), 0);
    const hoursRequired = intern.hours_required || 0;
    const daysWorked = attendance.length;
    const lateCount = attendance.filter(a => a.is_late).length;
    const avgDailyHours = daysWorked > 0 ? hoursRendered / daysWorked : 8;
    const progress = hoursRequired > 0 ? Math.min(100, (hoursRendered / hoursRequired) * 100) : 0;
    const estimatedEnd = computeEstimatedEndDate(hoursRequired, hoursRendered, daysWorked);
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed').length;

    return {
      ...intern,
      hoursRendered, hoursRequired, daysWorked, lateCount,
      avgDailyHours, progress, estimatedEnd,
      completedTasks, totalTasks, overdueTasks,
      taskRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null,
    };
  });

  // Aggregate stats
  const activeCount = internKPIs.length;
  const avgProgress = activeCount > 0 ? internKPIs.reduce((s, i) => s + i.progress, 0) / activeCount : 0;
  const finishingSoon = internKPIs.filter(i => {
    if (i.progress >= 100 || !i.estimatedEnd) return false;
    return Math.ceil((i.estimatedEnd - new Date()) / (1000 * 60 * 60 * 24)) <= 30;
  }).length;
  const completedCount = internKPIs.filter(i => i.progress >= 100).length;
  const workingInterns = internKPIs.filter(i => i.daysWorked > 0);
  const avgDailyAll = workingInterns.length > 0
    ? workingInterns.reduce((s, i) => s + i.avgDailyHours, 0) / workingInterns.length : 0;

  // Sort: soonest estimated finish first, completed last
  const sortedInterns = [...internKPIs].sort((a, b) => {
    if (a.progress >= 100 && b.progress < 100) return 1;
    if (b.progress >= 100 && a.progress < 100) return -1;
    if (!a.estimatedEnd && !b.estimatedEnd) return 0;
    if (!a.estimatedEnd) return 1;
    if (!b.estimatedEnd) return -1;
    return a.estimatedEnd - b.estimatedEnd;
  });

  const progressColor = p => p >= 75 ? '#22c55e' : p >= 50 ? '#6366f1' : p >= 25 ? '#f59e0b' : '#ef4444';

  const internRows = sortedInterns.length > 0 ? sortedInterns.map(intern => {
    let estEndCell;
    if (intern.progress >= 100) {
      estEndCell = `<span class="inline-flex items-center gap-1 text-xs font-semibold text-success-600">${icons.check} Completed</span>`;
    } else if (!intern.estimatedEnd) {
      estEndCell = `<span class="text-xs text-neutral-400">—</span>`;
    } else {
      const daysLeft = Math.ceil((intern.estimatedEnd - new Date()) / (1000 * 60 * 60 * 24));
      const colorClass = daysLeft <= 14 ? 'text-success-600' : daysLeft <= 60 ? 'text-primary-600' : 'text-neutral-600';
      estEndCell = `<div><p class="text-xs font-semibold ${colorClass}">${formatDate(intern.estimatedEnd)}</p><p class="text-xs text-neutral-400">${daysLeft}d away</p></div>`;
    }
    return `
    <tr class="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
      <td class="py-3 pr-4">
        <div class="flex items-center gap-2.5">
          ${renderAvatar(intern, 'w-8 h-8', 'text-xs')}
          <div>
            <p class="font-semibold text-neutral-900 text-sm leading-tight">${intern.full_name}</p>
            <p class="text-xs text-neutral-400 mt-0.5">${intern.department?.name || 'No Department'}</p>
          </div>
        </div>
      </td>
      <td class="py-3 pr-6" style="min-width: 180px;">
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--color-neutral-100);">
            <div class="h-full rounded-full transition-all" style="width: ${intern.progress.toFixed(1)}%; background: ${progressColor(intern.progress)};"></div>
          </div>
          <span class="text-xs font-bold text-neutral-700 w-9 text-right shrink-0">${intern.progress.toFixed(0)}%</span>
        </div>
      </td>
      <td class="text-right py-3 pr-4">
        <p class="text-xs font-semibold text-neutral-700">${formatHoursDisplay(intern.hoursRendered)}</p>
        <p class="text-xs text-neutral-400">of ${formatHoursDisplay(intern.hoursRequired)}</p>
      </td>
      <td class="text-center py-3 px-3">
        <p class="text-xs font-semibold text-neutral-700">${intern.avgDailyHours > 0 ? intern.avgDailyHours.toFixed(1) + 'h' : '—'}</p>
        <p class="text-xs text-neutral-400">${intern.daysWorked}d worked</p>
      </td>
      <td class="text-center py-3 px-3">
        ${intern.totalTasks > 0 ? `
          <p class="text-xs font-semibold ${intern.taskRate >= 80 ? 'text-success-600' : intern.taskRate >= 50 ? 'text-warning-600' : 'text-neutral-500'}">${intern.completedTasks}/${intern.totalTasks}</p>
          ${intern.overdueTasks > 0 ? `<p class="text-xs text-danger-500">${intern.overdueTasks} overdue</p>` : '<p class="text-xs text-neutral-400">&nbsp;</p>'}
        ` : '<span class="text-xs text-neutral-400">—</span>'}
      </td>
      <td class="text-center py-3 px-3">
        <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${intern.lateCount > 5 ? 'bg-danger-50 text-danger-600' : intern.lateCount > 0 ? 'bg-warning-50 text-warning-600' : 'bg-success-50 text-success-600'}">${intern.lateCount}x</span>
      </td>
      <td class="text-right py-3 pl-3">${estEndCell}</td>
    </tr>`;
  }).join('') : `
    <tr>
      <td colspan="7" class="text-center py-10 text-sm text-neutral-400">No active interns on your team.</td>
    </tr>
  `;

  return `
    <div class="page-header animate-fade-in-up">
      <p class="text-sm font-medium text-primary-600 mb-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <h1 class="page-title">Supervisor Dashboard</h1>
      <p class="page-subtitle">Manage your team's performance and approvals</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 stagger-children">
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Pending Approvals</p>
            <p class="text-xl font-bold mt-2 ${(pendingApprovals || 0) > 0 ? 'text-warning-600' : 'text-neutral-900'}">${pendingApprovals || 0}</p>
          </div>
          <div class="action-icon bg-warning-50 text-warning-600">
            ${icons.approval}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Team Size</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${teamSize}</p>
          </div>
          <div class="action-icon bg-primary-50 text-primary-600">
            ${icons.users}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Active Tasks</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${activeTasks || 0}</p>
          </div>
          <div class="action-icon bg-success-50 text-success-600">
            ${icons.tasks}
          </div>
        </div>
      </div>

      <a href="#/approvals" class="action-card">
        <div class="action-icon bg-primary-50 text-primary-600">
          ${icons.approval}
        </div>
        <div>
          <p class="font-semibold text-neutral-900">Review Approvals</p>
          <p class="text-sm text-neutral-500">Go to approvals →</p>
        </div>
      </a>
    </div>

    <!-- ═══════════════ INTERN KPI PANEL ═══════════════ -->
    <div class="card animate-fade-in-up mt-6 mb-6" style="animation-delay: 300ms;">
      <div class="flex items-start justify-between mb-5">
        <div>
          <h3 class="text-base font-bold text-neutral-900">Intern Performance Overview</h3>
          <p class="text-sm text-neutral-500 mt-0.5">Real-time KPIs across all active interns</p>
        </div>
      </div>

      <!-- Aggregate metric chips -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="rounded-xl p-4" style="background: var(--color-primary-50);">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-primary-600);">Active Interns</p>
          <p class="text-2xl font-bold mt-1" style="color: var(--color-primary-700);">${activeCount}</p>
          ${completedCount > 0 ? `<p class="text-xs mt-0.5" style="color: var(--color-primary-500);">${completedCount} completed</p>` : ''}
        </div>
        <div class="rounded-xl p-4" style="background: var(--color-neutral-100);">
          <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Avg OJT Progress</p>
          <p class="text-2xl font-bold mt-1 text-neutral-800">${avgProgress.toFixed(1)}%</p>
          <p class="text-xs text-neutral-400 mt-0.5">across all interns</p>
        </div>
        <div class="rounded-xl p-4" style="background: var(--color-success-50);">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-success-600);">Finishing Soon</p>
          <p class="text-2xl font-bold mt-1" style="color: var(--color-success-600);">${finishingSoon}</p>
          <p class="text-xs mt-0.5" style="color: var(--color-success-500);">within 30 days</p>
        </div>
        <div class="rounded-xl p-4" style="background: var(--color-warning-50);">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-warning-600);">Avg Daily Hours</p>
          <p class="text-2xl font-bold mt-1" style="color: var(--color-warning-600);">${avgDailyAll > 0 ? avgDailyAll.toFixed(1) + 'h' : '—'}</p>
          <p class="text-xs mt-0.5" style="color: var(--color-warning-500);">per working day</p>
        </div>
      </div>

      <!-- Per-intern KPI table -->
      <div class="overflow-x-auto -mx-6 px-6">
        <table class="w-full text-sm" style="min-width: 680px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--color-neutral-100);">
              <th class="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pr-4">Intern</th>
              <th class="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pr-6" style="min-width: 180px;">OJT Progress</th>
              <th class="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pr-4">Hours</th>
              <th class="text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 px-3">Avg / Day</th>
              <th class="text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 px-3">Tasks</th>
              <th class="text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 px-3">Late Days</th>
              <th class="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pl-3">Est. Finish</th>
            </tr>
          </thead>
          <tbody>
            ${internRows}
          </tbody>
        </table>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children" style="animation-delay: 1000ms;">
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-1">Team Attendance Today</h3>
        <p class="text-sm text-neutral-500 mb-4">Overview of your team's check-in status</p>
        <div style="position: relative; height: 220px;">
          <canvas id="team-attendance-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-1">Task Status Overview</h3>
        <p class="text-sm text-neutral-500 mb-4">Distribution of tasks by current status</p>
        <div style="position: relative; height: 220px;">
          <canvas id="task-status-chart"></canvas>
        </div>
      </div>
    </div>
  `;
}

async function buildAdminDashboard(profile) {
  const today = getTodayDate();
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const dateFilter = sixtyDaysAgo.toLocaleDateString('en-CA');

  // ── System-level stats (parallelized) ───────────────────────────────────────
  const [
    { count: totalUsers },
    { count: totalLocations },
    { count: totalDepartments },
    { count: pendingApprovals },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('locations').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('departments').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('approvals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);

  // ── Intern KPI data (optimized with parallel fetch) ────────────────────────
  const { data: interns } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, school, hours_required, hours_rendered, ojt_start_date, status, is_voluntary, department:departments(name)')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  const internIds = (interns || []).map(i => i.id);
  let allAttendance = [];
  let allTasks = [];

  if (internIds.length > 0) {
    const [attRes, taskRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('intern_id, total_hours, is_late')
        .in('intern_id', internIds)
        .eq('status', 'approved')
        .gte('date', dateFilter)
        .limit(1000),
      supabase
        .from('tasks')
        .select('assigned_to, status, due_date, is_archived')
        .in('assigned_to', internIds)
        .limit(500),
    ]);
    allAttendance = attRes.data || [];
    allTasks = taskRes.data || [];
  }

  // Compute per-intern KPIs and store for chart use
  _internKPIData = (interns || []).map(intern => {
    const attendance = allAttendance.filter(a => a.intern_id === intern.id);
    const tasks = allTasks.filter(t => t.assigned_to === intern.id && !t.is_archived);

    const hoursRendered = intern.hours_rendered || attendance.reduce((s, a) => s + (a.total_hours || 0), 0);
    const hoursRequired = intern.hours_required || 0;
    const daysWorked = attendance.length;
    const lateCount = attendance.filter(a => a.is_late).length;
    const avgDailyHours = daysWorked > 0 ? hoursRendered / daysWorked : 8;
    const progress = hoursRequired > 0 ? Math.min(100, (hoursRendered / hoursRequired) * 100) : 0;
    const estimatedEnd = computeEstimatedEndDate(hoursRequired, hoursRendered, daysWorked);

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date < today && t.status !== 'completed').length;

    return {
      ...intern,
      hoursRendered, hoursRequired, daysWorked, lateCount,
      avgDailyHours, progress, estimatedEnd,
      completedTasks, totalTasks, overdueTasks,
      taskRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : null,
    };
  });

  // Aggregate KPI stats
  const activeCount = _internKPIData.length;
  const avgProgress = activeCount > 0
    ? _internKPIData.reduce((s, i) => s + i.progress, 0) / activeCount : 0;
  const finishingSoon = _internKPIData.filter(i => {
    if (i.progress >= 100) return false;
    if (!i.estimatedEnd) return false;
    const days = Math.ceil((i.estimatedEnd - new Date()) / (1000 * 60 * 60 * 24));
    return days >= 0 && days <= 30;
  }).length;
  const completedCount = _internKPIData.filter(i => i.progress >= 100).length;
  const workingInterns = _internKPIData.filter(i => i.daysWorked > 0);
  const avgDailyAll = workingInterns.length > 0
    ? workingInterns.reduce((s, i) => s + i.avgDailyHours, 0) / workingInterns.length : 0;

  // Sort: soonest estimated finish first, completed last
  const sortedInterns = [..._internKPIData].sort((a, b) => {
    if (a.progress >= 100 && b.progress < 100) return 1;
    if (b.progress >= 100 && a.progress < 100) return -1;
    if (!a.estimatedEnd && !b.estimatedEnd) return 0;
    if (!a.estimatedEnd) return 1;
    if (!b.estimatedEnd) return -1;
    return a.estimatedEnd - b.estimatedEnd;
  });

  const progressColor = p => p >= 75 ? '#22c55e' : p >= 50 ? '#6366f1' : p >= 25 ? '#f59e0b' : '#ef4444';

  const estEndDisplay = intern => {
    if (intern.progress >= 100) {
      if (intern.is_voluntary) {
        return `
          <div class="flex flex-col items-end gap-1">
            <span class="inline-flex items-center gap-1 text-xs font-semibold text-success-600">${icons.check} Completed</span>
            <span class="text-xs font-semibold text-primary-600">Voluntary</span>
          </div>`;
      }
      return `
        <div class="flex flex-col items-end gap-1">
          <span class="inline-flex items-center gap-1 text-xs font-semibold text-success-600">${icons.check} Completed</span>
          <button class="ojt-review-btn text-xs font-medium text-primary-600 hover:underline" data-intern-id="${intern.id}">Review</button>
        </div>`;
    }
    if (!intern.estimatedEnd) return `<span class="text-xs text-neutral-400">—</span>`;
    const daysLeft = Math.ceil((intern.estimatedEnd - new Date()) / (1000 * 60 * 60 * 24));
    const colorClass = daysLeft <= 14 ? 'text-success-600' : daysLeft <= 60 ? 'text-primary-600' : 'text-neutral-600';
    return `<div><p class="text-xs font-semibold ${colorClass}">${formatDate(intern.estimatedEnd)}</p><p class="text-xs text-neutral-400">${daysLeft}d away</p></div>`;
  };

  const internRows = sortedInterns.length > 0 ? sortedInterns.map(intern => `
    <tr class="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
      <td class="py-3 pr-4">
        <div class="flex items-center gap-2.5">
          ${renderAvatar(intern, 'w-8 h-8', 'text-xs')}
          <div>
            <p class="font-semibold text-neutral-900 text-sm leading-tight">${intern.full_name}</p>
            <p class="text-xs text-neutral-400 mt-0.5">${intern.department?.name || 'No Department'}</p>
          </div>
        </div>
      </td>
      <td class="py-3 pr-6" style="min-width: 180px;">
        <div class="flex items-center gap-2">
          <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background: var(--color-neutral-100);">
            <div class="h-full rounded-full transition-all" style="width: ${intern.progress.toFixed(1)}%; background: ${progressColor(intern.progress)};"></div>
          </div>
          <span class="text-xs font-bold text-neutral-700 w-9 text-right shrink-0">${intern.progress.toFixed(0)}%</span>
        </div>
      </td>
      <td class="text-right py-3 pr-4">
        <p class="text-xs font-semibold text-neutral-700">${formatHoursDisplay(intern.hoursRendered)}</p>
        <p class="text-xs text-neutral-400">of ${formatHoursDisplay(intern.hoursRequired)}</p>
      </td>
      <td class="text-center py-3 px-3">
        <p class="text-xs font-semibold text-neutral-700">${intern.avgDailyHours > 0 ? intern.avgDailyHours.toFixed(1) + 'h' : '—'}</p>
        <p class="text-xs text-neutral-400">${intern.daysWorked}d worked</p>
      </td>
      <td class="text-center py-3 px-3">
        ${intern.totalTasks > 0 ? `
          <p class="text-xs font-semibold ${intern.taskRate >= 80 ? 'text-success-600' : intern.taskRate >= 50 ? 'text-warning-600' : 'text-neutral-500'}">${intern.completedTasks}/${intern.totalTasks}</p>
          ${intern.overdueTasks > 0 ? `<p class="text-xs text-danger-500">${intern.overdueTasks} overdue</p>` : '<p class="text-xs text-neutral-400">&nbsp;</p>'}
        ` : '<span class="text-xs text-neutral-400">—</span>'}
      </td>
      <td class="text-center py-3 px-3">
        <span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${intern.lateCount > 5 ? 'bg-danger-50 text-danger-600' : intern.lateCount > 0 ? 'bg-warning-50 text-warning-600' : 'bg-success-50 text-success-600'}">${intern.lateCount}x</span>
      </td>
      <td class="text-right py-3 pl-3">
        ${estEndDisplay(intern)}
      </td>
    </tr>
  `).join('') : `
    <tr>
      <td colspan="7" class="text-center py-10 text-sm text-neutral-400">No active interns found.</td>
    </tr>
  `;

  return `
    <div class="page-header animate-fade-in-up">
      <p class="text-sm font-medium text-primary-600 mb-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <h1 class="page-title">System Administration</h1>
      <p class="page-subtitle">Overview of all users, locations, and system activity</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8 stagger-children">
      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Total Users</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${totalUsers || 0}</p>
          </div>
          <div class="action-icon bg-primary-50 text-primary-600">
            ${icons.users}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Locations</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${totalLocations || 0}</p>
          </div>
          <div class="action-icon bg-success-50 text-success-600">
            ${icons.location}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Departments</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${totalDepartments || 0}</p>
          </div>
          <div class="action-icon bg-warning-50 text-warning-600">
            ${icons.building}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Pending Approvals</p>
            <p class="text-xl font-bold mt-2 ${(pendingApprovals || 0) > 0 ? 'text-warning-600' : 'text-neutral-900'}">${pendingApprovals || 0}</p>
          </div>
          <div class="action-icon bg-danger-50 text-danger-600">
            ${icons.approval}
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Admin Links -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 stagger-children" style="animation-delay: 1000ms;">
      <a href="#/user-management" class="action-card">
        <div class="action-icon bg-primary-50 text-primary-600">${icons.users}</div>
        <div>
          <p class="font-semibold text-neutral-900">User Maintenance</p>
          <p class="text-sm text-neutral-500 mt-0.5">Manage all accounts</p>
        </div>
      </a>

      <a href="#/audit-logs" class="action-card">
        <div class="action-icon bg-neutral-100 text-neutral-600">${icons.audit}</div>
        <div>
          <p class="font-semibold text-neutral-900">Audit Logs</p>
          <p class="text-sm text-neutral-500 mt-0.5">View system activity</p>
        </div>
      </a>

      <a href="#/system-settings" class="action-card">
        <div class="action-icon bg-neutral-100 text-neutral-600">${icons.settings}</div>
        <div>
          <p class="font-semibold text-neutral-900">System Settings</p>
          <p class="text-sm text-neutral-500 mt-0.5">Configure the system</p>
        </div>
      </a>
    </div>

    <!-- ═══════════════ INTERN KPI PANEL ═══════════════ -->
    <div class="card animate-fade-in-up mt-6" style="animation-delay: 300ms;">
      <!-- Panel header -->
      <div class="flex items-start justify-between mb-5">
        <div>
          <h3 class="text-base font-bold text-neutral-900">Intern Performance Overview</h3>
          <p class="text-sm text-neutral-500 mt-0.5">Real-time KPIs across all active interns</p>
        </div>
        <a href="#/intern-directory" class="text-xs font-semibold text-primary-600 hover:text-primary-700 transition-colors shrink-0 ml-4 mt-1">View directory →</a>
      </div>

      <!-- Aggregate metric chips -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div class="rounded-xl p-4" style="background: var(--color-primary-50);">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-primary-600);">Active Interns</p>
          <p class="text-2xl font-bold mt-1" style="color: var(--color-primary-700);">${activeCount}</p>
          ${completedCount >= 0 ? `<p class="text-xs mt-0.5" style="color: var(--color-primary-500);">${completedCount} completed</p>` : ''}
        </div>
        <div class="rounded-xl p-4" style="background: var(--color-neutral-100);">
          <p class="text-xs font-semibold uppercase tracking-wider text-neutral-500">Avg OJT Progress</p>
          <p class="text-2xl font-bold mt-1 text-neutral-800">${avgProgress.toFixed(1)}%</p>
          <p class="text-xs text-neutral-400 mt-0.5">across all interns</p>
        </div>
        <div class="rounded-xl p-4" style="background: var(--color-success-50);">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-success-600);">Finishing Soon</p>
          <p class="text-2xl font-bold mt-1" style="color: var(--color-success-600);">${finishingSoon}</p>
          <p class="text-xs mt-0.5" style="color: var(--color-success-500);">within 30 days</p>
        </div>
        <div class="rounded-xl p-4" style="background: var(--color-warning-50);">
          <p class="text-xs font-semibold uppercase tracking-wider" style="color: var(--color-warning-600);">Avg Daily Hours</p>
          <p class="text-2xl font-bold mt-1" style="color: var(--color-warning-600);">${avgDailyAll > 0 ? avgDailyAll.toFixed(1) + 'h' : '—'}</p>
          <p class="text-xs mt-0.5" style="color: var(--color-warning-500);">per working day</p>
        </div>
      </div>

      <!-- Per-intern KPI table -->
      <div class="overflow-x-auto -mx-6 px-6">
        <table class="w-full text-sm" style="min-width: 680px;">
          <thead>
            <tr style="border-bottom: 1px solid var(--color-neutral-100);">
              <th class="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pr-4">Intern</th>
              <th class="text-left text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pr-6" style="min-width: 180px;">OJT Progress</th>
              <th class="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pr-4">Hours</th>
              <th class="text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 px-3">Avg / Day</th>
              <th class="text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 px-3">Tasks</th>
              <th class="text-center text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 px-3">Late Days</th>
              <th class="text-right text-xs font-semibold text-neutral-400 uppercase tracking-wider pb-3 pl-3">Est. Finish</th>
            </tr>
          </thead>
          <tbody>
            ${internRows}
          </tbody>
        </table>
      </div>

      <!-- OJT Timeline Chart -->
      ${activeCount > 0 ? `
      <div class="mt-6 pt-6" style="border-top: 1px solid var(--color-neutral-100);">
        <h4 class="text-sm font-semibold text-neutral-700 mb-1">OJT Completion by Intern</h4>
        <p class="text-xs text-neutral-400 mb-4">Sorted by progress — colors: <span style="color:#22c55e">■</span> 75–100% <span style="color:#6366f1">■</span> 50–74% <span style="color:#f59e0b">■</span> 25–49% <span style="color:#ef4444">■</span> 0–24%</p>
        <div style="position: relative; height: ${Math.max(140, activeCount * 36)}px;">
          <canvas id="intern-progress-chart"></canvas>
        </div>
      </div>
      ` : ''}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children mt-6" style="animation-delay: 500ms;">
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-1">Users by Role</h3>
        <p class="text-sm text-neutral-500 mb-4">Distribution of active users across roles</p>
        <div style="position: relative; height: 220px;">
          <canvas id="users-by-role-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-1">System Activity (Last 7 Days)</h3>
        <p class="text-sm text-neutral-500 mb-4">Recent audit log activity trends</p>
        <div style="position: relative; height: 220px;">
          <canvas id="system-activity-chart"></canvas>
        </div>
      </div>
    </div>
  `;
}

/**
 * Track active chart instances so we can destroy before re-creating.
 */
const activeCharts = [];

function destroyCharts() {
  activeCharts.forEach(c => c.destroy());
  activeCharts.length = 0;
}

function createChart(canvas, config) {
  // Destroy any existing chart on the same canvas
  const existing = Chart.getChart(canvas);
  if (existing) existing.destroy();
  const chart = new Chart(canvas, config);
  activeCharts.push(chart);
  return chart;
}

let Chart;

/**
 * Initialize Chart.js charts on dashboard.
 */
async function initDashboardCharts(role, container) {
  const chartModule = await import('chart.js');
  Chart = chartModule.Chart;
  Chart.register(...chartModule.registerables);

  destroyCharts();

  const defaultOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: { padding: 16, usePointStyle: true, pointStyle: 'circle', font: { family: 'Inter', size: 12 } },
      },
    },
  };

  if (role === 'intern') {
    const canvas = container.querySelector('#weekly-hours-chart');
    const totalHoursEl = container.querySelector('#weekly-hours-total');
    if (canvas) {
      const profile = getProfile();
      const weekStart = getTrackingWeekStart(new Date());
      const weekEnd = getTrackingWeekEnd(weekStart);
      const weekEntries = getPerformanceWeekDayEntries(weekStart);

      const { data: weeklyData } = await supabase
        .from('attendance_records')
        .select('date, total_hours')
        .eq('intern_id', profile.id)
        .gte('date', formatDateKey(weekStart))
        .lte('date', formatDateKey(weekEnd))
        .order('date');

      const days = weekEntries.map(entry => entry.label);
      const hours = weekEntries.map(entry => {
        const dateStr = entry.dateStr;
        const record = weeklyData?.find(r => r.date === dateStr);
        return record?.total_hours || 0;
      });

      if (totalHoursEl) {
        totalHoursEl.textContent = formatHoursDisplay(hours.reduce((sum, value) => sum + value, 0));
      }

      createChart(canvas, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: 'Hours Logged',
            data: hours,
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            hoverBackgroundColor: '#4f46e5',
            borderRadius: 8,
            borderSkipped: false,
          }],
        },
        options: { ...defaultOptions, scales: { y: { beginAtZero: true, max: 10 } } },
      });
    }
  }

  if (role === 'supervisor') {
    const attendanceCanvas = container.querySelector('#team-attendance-chart');
    if (attendanceCanvas) {
      const profile = getProfile();
      const today = new Date().toLocaleDateString('en-CA');

      const hasDeptChart = !!profile.department_id;
      let teamInternsQuery = supabase.from('profiles').select('id').eq('role', 'intern').eq('is_active', true);
      if (hasDeptChart) {
        teamInternsQuery = teamInternsQuery.eq('department_id', profile.department_id);
      } else {
        teamInternsQuery = teamInternsQuery.eq('supervisor_id', profile.id);
      }
      const { data: teamInterns } = await teamInternsQuery;

      const internIds = (teamInterns || []).map(i => i.id);
      let presentIds = [];

      if (internIds.length > 0) {
        const { data: todayRecords } = await supabase
          .from('attendance_records')
          .select('intern_id, is_late')
          .in('intern_id', internIds)
          .eq('date', today);

        presentIds = (todayRecords || []).map(r => r.intern_id);
        const lateCount = (todayRecords || []).filter(r => r.is_late).length;
        const onTimeCount = presentIds.length - lateCount;
        const absentCount = internIds.length - presentIds.length;

        createChart(attendanceCanvas, {
          type: 'doughnut',
          data: {
            labels: ['On Time', 'Late', 'Not Yet Checked In'],
            datasets: [{
              data: [onTimeCount, lateCount, absentCount],
              backgroundColor: ['#34d399', '#fbbf24', '#cbd5e1'],
              borderWidth: 0,
            }],
          },
          options: defaultOptions,
        });
      } else {
        // No interns assigned — show empty state text instead of blank canvas
        attendanceCanvas.style.display = 'none';
        const msg = document.createElement('p');
        msg.className = 'text-center text-neutral-400 py-8 text-sm';
        msg.textContent = 'No interns assigned to your team.';
        attendanceCanvas.parentElement.appendChild(msg);
      }
    }

    const taskCanvas = container.querySelector('#task-status-chart');
    if (taskCanvas) {
      const profile = getProfile();
      const { data: tasks } = await supabase
        .from('tasks')
        .select('status')
        .eq('created_by', profile.id);

      const counts = { not_started: 0, in_progress: 0, completed: 0 };
      tasks?.forEach(t => { counts[t.status] = (counts[t.status] || 0) + 1; });

      createChart(taskCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Not Started', 'In Progress', 'Completed'],
          datasets: [{
            data: [counts.not_started, counts.in_progress, counts.completed],
            backgroundColor: ['#cbd5e1', '#fbbf24', '#34d399'],
            borderWidth: 0,
          }],
        },
        options: defaultOptions,
      });
    }
  }

  if (role === 'admin') {
    const roleCanvas = container.querySelector('#users-by-role-chart');
    if (roleCanvas) {
      const { data: users } = await supabase
        .from('profiles')
        .select('role')
        .eq('is_active', true);

      const roleCounts = { admin: 0, supervisor: 0, intern: 0 };
      users?.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

      createChart(roleCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Admin', 'Supervisor', 'Intern'],
          datasets: [{
            data: [roleCounts.admin, roleCounts.supervisor, roleCounts.intern],
            backgroundColor: ['#4f46e5', '#f59e0b', '#818cf8'],
            borderWidth: 0,
          }],
        },
        options: defaultOptions,
      });
    }

    const activityCanvas = container.querySelector('#system-activity-chart');
    if (activityCanvas) {
      const since = new Date();
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);

      const { data: auditData } = await supabase
        .from('audit_logs')
        .select('created_at')
        .gte('created_at', since.toISOString());

      // Build last-7-days labels and counts
      const days = [];
      const counts = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
        const dateStr = formatDateKey(d);
        counts.push(auditData?.filter(r => r.created_at.slice(0, 10) === dateStr).length || 0);
      }

      createChart(activityCanvas, {
        type: 'bar',
        data: {
          labels: days,
          datasets: [{
            label: 'Actions',
            data: counts,
            backgroundColor: 'rgba(99, 102, 241, 0.8)',
            hoverBackgroundColor: '#4f46e5',
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          ...defaultOptions,
          plugins: { legend: { display: false } },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { stepSize: 1, font: { family: 'Inter', size: 11 } },
              grid: { color: 'rgba(0,0,0,0.05)' },
            },
            x: {
              ticks: { font: { family: 'Inter', size: 11 } },
              grid: { display: false },
            },
          },
        },
      });
    }

    // Intern OJT Progress chart
    const progressCanvas = container.querySelector('#intern-progress-chart');
    if (progressCanvas && _internKPIData.length > 0) {
      const sorted = [..._internKPIData].sort((a, b) => a.progress - b.progress);
      const labels = sorted.map(i => {
        const parts = i.full_name.split(' ');
        return parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0];
      });
      const progressData = sorted.map(i => parseFloat(i.progress.toFixed(1)));
      const bgColors = sorted.map(i =>
        i.progress >= 75 ? '#22c55e' : i.progress >= 50 ? '#6366f1' : i.progress >= 25 ? '#f59e0b' : '#ef4444'
      );

      createChart(progressCanvas, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'OJT Progress',
            data: progressData,
            backgroundColor: bgColors,
            borderRadius: 6,
            borderSkipped: false,
          }],
        },
        options: {
          ...defaultOptions,
          indexAxis: 'y',
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: ctx => {
                  const intern = sorted[ctx.dataIndex];
                  return [
                    ` ${ctx.raw}% complete`,
                    ` ${formatHoursDisplay(intern.hoursRendered)} / ${formatHoursDisplay(intern.hoursRequired)}`,
                    intern.estimatedEnd ? ` Est. finish: ${formatDate(intern.estimatedEnd)}` : '',
                  ].filter(Boolean);
                },
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              max: 100,
              ticks: { callback: v => v + '%', font: { family: 'Inter', size: 11 } },
              grid: { color: 'rgba(0,0,0,0.04)' },
            },
            y: {
              ticks: { font: { family: 'Inter', size: 11 } },
              grid: { display: false },
            },
          },
        },
      });
    }
  }
}
