/**
 * Dashboard Page
 * Renders role-specific dashboard content.
 */
import { getUserRole, getProfile, refreshProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, getTodayDate } from '../lib/utils.js';

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
  }, '/dashboard');
}

async function buildInternDashboard(profile) {
  // Refresh profile so hours_rendered reflects latest approved attendance
  await refreshProfile();
  profile = getProfile();

  const today = getTodayDate();

  // Fetch today's attendance
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .maybeSingle();

  // Fetch pending tasks count
  const { count: pendingTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('assigned_to', profile.id)
    .in('status', ['not_started', 'in_progress']);

  // Fetch pending narratives
  const { count: pendingNarratives } = await supabase
    .from('narratives')
    .select('*', { count: 'exact', head: true })
    .eq('intern_id', profile.id)
    .eq('status', 'pending');

  // Fetch unread notifications
  const { count: unreadNotifs } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', profile.id)
    .eq('is_read', false);

  const hoursRendered = profile.hours_rendered || 0;
  const hoursRequired = profile.hours_required || 0;
  const progress = hoursRequired > 0 ? Math.min(100, (hoursRendered / hoursRequired) * 100) : 0;

  const attendanceStatus = todayAttendance ? (todayAttendance.time_out_2 ? 'Complete' : 'Logged In') : 'Not Logged';
  const attendanceColor = todayAttendance ? (todayAttendance.time_out_2 ? 'text-success-600' : 'text-primary-600') : 'text-neutral-400';

  return `
    <div class="page-header animate-fade-in-up">
      <p class="text-sm font-medium text-primary-600 mb-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <h1 class="page-title">Welcome back, ${profile.full_name?.split(' ')[0] || 'Intern'}! 👋</h1>
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
          <div class="action-icon bg-primary-50 text-primary-600">
            ${icons.clock}
          </div>
        </div>
      </div>

      <div class="stat-card" style="--tw-gradient-from: #f59e0b;">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Active Tasks</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${pendingTasks || 0}</p>
          </div>
          <div class="action-icon bg-warning-50 text-warning-600">
            ${icons.tasks}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Pending Narratives</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${pendingNarratives || 0}</p>
          </div>
          <div class="action-icon bg-success-50 text-success-600">
            ${icons.narrative}
          </div>
        </div>
      </div>

      <div class="stat-card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Notifications</p>
            <p class="text-xl font-bold mt-2 text-neutral-900">${unreadNotifs || 0}</p>
          </div>
          <div class="action-icon bg-danger-50 text-danger-600">
            ${icons.bell}
          </div>
        </div>
      </div>
    </div>

    <!-- OJT Progress -->
    <div class="card mb-8 animate-fade-in-up" style="animation-delay: 200ms;">
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
      ${profile.ojt_end_date ? `<p class="text-xs text-neutral-400 mt-3">Estimated completion: ${formatDate(profile.ojt_end_date)}</p>` : ''}
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 stagger-children" style="animation-delay: 300ms;">
      <a href="#/attendance" class="action-card">
        <div class="action-icon bg-primary-50 text-primary-600">
          ${icons.clock}
        </div>
        <div>
          <p class="font-semibold text-neutral-900">Log Attendance</p>
          <p class="text-sm text-neutral-500 mt-0.5">Record time-in / time-out</p>
        </div>
      </a>

      <a href="#/my-tasks" class="action-card">
        <div class="action-icon bg-warning-50 text-warning-600">
          ${icons.tasks}
        </div>
        <div>
          <p class="font-semibold text-neutral-900">View Tasks</p>
          <p class="text-sm text-neutral-500 mt-0.5">Check your assignments</p>
        </div>
      </a>

      <a href="#/narratives" class="action-card">
        <div class="action-icon bg-success-50 text-success-600">
          ${icons.narrative}
        </div>
        <div>
          <p class="font-semibold text-neutral-900">Submit Narrative</p>
          <p class="text-sm text-neutral-500 mt-0.5">Write daily activity report</p>
        </div>
      </a>
    </div>

    <!-- Weekly Hours Chart -->
    <div class="card animate-fade-in-up" style="animation-delay: 400ms;">
      <h3 class="text-base font-bold text-neutral-900 mb-1">This Week's Hours</h3>
      <p class="text-sm text-neutral-500 mb-4">Your daily attendance log for the current week</p>
      <div style="position: relative; height: 220px;">
        <canvas id="weekly-hours-chart"></canvas>
      </div>
    </div>
  `;
}

async function buildSupervisorDashboard(profile) {
  // Fetch pending approvals
  const { count: pendingApprovals } = await supabase
    .from('approvals')
    .select('*', { count: 'exact', head: true })
    .eq('supervisor_id', profile.id)
    .eq('status', 'pending');

  // Fetch team interns count
  const { count: teamSize } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('supervisor_id', profile.id)
    .eq('role', 'intern')
    .eq('is_active', true);

  // Fetch active tasks
  const { count: activeTasks } = await supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .eq('created_by', profile.id)
    .in('status', ['not_started', 'in_progress']);

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
            <p class="text-xl font-bold mt-2 text-neutral-900">${teamSize || 0}</p>
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

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children" style="animation-delay: 200ms;">
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
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: totalLocations } = await supabase
    .from('locations')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: totalDepartments } = await supabase
    .from('departments')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true);

  const { count: pendingApprovals } = await supabase
    .from('approvals')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');

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
    <div class="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 stagger-children" style="animation-delay: 200ms;">
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

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 stagger-children" style="animation-delay: 300ms;">
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
    if (canvas) {
      const profile = getProfile();
      const today = new Date();
      const monday = new Date(today);
      monday.setDate(today.getDate() - today.getDay() + 1);

      const { data: weeklyData } = await supabase
        .from('attendance_records')
        .select('date, total_hours')
        .eq('intern_id', profile.id)
        .gte('date', monday.toISOString().slice(0, 10))
        .order('date');

      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
      const hours = days.map((_, i) => {
        const d = new Date(monday);
        d.setDate(d.getDate() + i);
        const dateStr = d.toISOString().slice(0, 10);
        const record = weeklyData?.find(r => r.date === dateStr);
        return record?.total_hours || 0;
      });

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
  }
}
