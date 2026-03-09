/**
 * Dashboard Page
 * Renders role-specific dashboard content.
 */
import { getUserRole, getProfile } from '../lib/auth.js';
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
    case 'hr':
      content = await buildHRDashboard(profile);
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
  const today = getTodayDate();

  // Fetch today's attendance
  const { data: todayAttendance } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .single();

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

  return `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">Welcome back, ${profile.full_name?.split(' ')[0] || 'Intern'}!</h1>
      <p class="text-neutral-500 mt-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <!-- Stats Cards -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Today's Status</p>
            <p class="text-2xl font-bold mt-1">${todayAttendance ? (todayAttendance.time_out_2 ? 'Complete' : 'Logged In') : 'Not Logged'}</p>
          </div>
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.clock}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Active Tasks</p>
            <p class="text-2xl font-bold mt-1">${pendingTasks || 0}</p>
          </div>
          <div class="w-10 h-10 bg-warning-50 rounded-lg flex items-center justify-center text-warning-600">
            ${icons.tasks}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Pending Narratives</p>
            <p class="text-2xl font-bold mt-1">${pendingNarratives || 0}</p>
          </div>
          <div class="w-10 h-10 bg-success-50 rounded-lg flex items-center justify-center text-success-600">
            ${icons.narrative}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Notifications</p>
            <p class="text-2xl font-bold mt-1">${unreadNotifs || 0}</p>
          </div>
          <div class="w-10 h-10 bg-danger-50 rounded-lg flex items-center justify-center text-danger-600">
            ${icons.bell}
          </div>
        </div>
      </div>
    </div>

    <!-- OJT Progress -->
    <div class="card mb-6">
      <h3 class="text-lg font-semibold mb-4">OJT Progress</h3>
      <div class="flex items-center gap-4 mb-2">
        <div class="flex-1">
          <div class="w-full bg-neutral-200 rounded-full h-3">
            <div class="bg-primary-600 h-3 rounded-full transition-all duration-500" style="width: ${progress.toFixed(1)}%"></div>
          </div>
        </div>
        <span class="text-sm font-medium text-neutral-600">${progress.toFixed(1)}%</span>
      </div>
      <div class="flex justify-between text-sm text-neutral-500">
        <span>Hours Rendered: ${formatHoursDisplay(hoursRendered)}</span>
        <span>Hours Required: ${formatHoursDisplay(hoursRequired)}</span>
      </div>
      ${profile.ojt_end_date ? `<p class="text-sm text-neutral-500 mt-2">Estimated completion: ${formatDate(profile.ojt_end_date)}</p>` : ''}
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <a href="#/attendance" class="card hover:shadow-md transition-shadow cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.clock}
          </div>
          <div>
            <p class="font-medium">Log Attendance</p>
            <p class="text-sm text-neutral-500">Record time-in / time-out</p>
          </div>
        </div>
      </a>

      <a href="#/my-tasks" class="card hover:shadow-md transition-shadow cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-warning-50 rounded-lg flex items-center justify-center text-warning-600">
            ${icons.tasks}
          </div>
          <div>
            <p class="font-medium">View Tasks</p>
            <p class="text-sm text-neutral-500">Check your assignments</p>
          </div>
        </div>
      </a>

      <a href="#/narratives" class="card hover:shadow-md transition-shadow cursor-pointer">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-success-50 rounded-lg flex items-center justify-center text-success-600">
            ${icons.narrative}
          </div>
          <div>
            <p class="font-medium">Submit Narrative</p>
            <p class="text-sm text-neutral-500">Write daily activity report</p>
          </div>
        </div>
      </a>
    </div>

    <!-- Weekly Hours Chart -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">This Week's Hours</h3>
      <div style="position: relative; height: 200px;">
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
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">Supervisor Dashboard</h1>
      <p class="text-neutral-500 mt-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Pending Approvals</p>
            <p class="text-2xl font-bold mt-1 ${(pendingApprovals || 0) > 0 ? 'text-warning-600' : ''}">${pendingApprovals || 0}</p>
          </div>
          <div class="w-10 h-10 bg-warning-50 rounded-lg flex items-center justify-center text-warning-600">
            ${icons.approval}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Team Size</p>
            <p class="text-2xl font-bold mt-1">${teamSize || 0}</p>
          </div>
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.users}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Active Tasks</p>
            <p class="text-2xl font-bold mt-1">${activeTasks || 0}</p>
          </div>
          <div class="w-10 h-10 bg-success-50 rounded-lg flex items-center justify-center text-success-600">
            ${icons.tasks}
          </div>
        </div>
      </div>

      <a href="#/approvals" class="card hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.approval}
          </div>
          <div>
            <p class="font-medium">Review Approvals</p>
            <p class="text-sm text-neutral-500">Go to approvals →</p>
          </div>
        </div>
      </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Team Attendance Today</h3>
        <div style="position: relative; height: 200px;">
          <canvas id="team-attendance-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Task Status Overview</h3>
        <div style="position: relative; height: 200px;">
          <canvas id="task-status-chart"></canvas>
        </div>
      </div>
    </div>
  `;
}

async function buildHRDashboard(profile) {
  const { count: totalInterns } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role', 'intern')
    .eq('is_active', true);

  const { count: pendingAllowances } = await supabase
    .from('allowance_periods')
    .select('*', { count: 'exact', head: true })
    .in('status', ['computed', 'under_review']);

  return `
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">HR Dashboard</h1>
      <p class="text-neutral-500 mt-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Active Interns</p>
            <p class="text-2xl font-bold mt-1">${totalInterns || 0}</p>
          </div>
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.users}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Pending Allowances</p>
            <p class="text-2xl font-bold mt-1 ${(pendingAllowances || 0) > 0 ? 'text-warning-600' : ''}">${pendingAllowances || 0}</p>
          </div>
          <div class="w-10 h-10 bg-warning-50 rounded-lg flex items-center justify-center text-warning-600">
            ${icons.money}
          </div>
        </div>
      </div>

      <a href="#/allowance-management" class="card hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-success-50 rounded-lg flex items-center justify-center text-success-600">
            ${icons.money}
          </div>
          <div>
            <p class="font-medium">Manage Allowances</p>
            <p class="text-sm text-neutral-500">Review & approve →</p>
          </div>
        </div>
      </a>

      <a href="#/reports" class="card hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.reports}
          </div>
          <div>
            <p class="font-medium">Generate Reports</p>
            <p class="text-sm text-neutral-500">View reports →</p>
          </div>
        </div>
      </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Weekly Attendance Overview</h3>
        <div style="position: relative; height: 200px;">
          <canvas id="attendance-overview-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Allowance Summary</h3>
        <div style="position: relative; height: 200px;">
          <canvas id="allowance-summary-chart"></canvas>
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
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">System Administration</h1>
      <p class="text-neutral-500 mt-1">${formatDate(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Total Users</p>
            <p class="text-2xl font-bold mt-1">${totalUsers || 0}</p>
          </div>
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">
            ${icons.users}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Locations</p>
            <p class="text-2xl font-bold mt-1">${totalLocations || 0}</p>
          </div>
          <div class="w-10 h-10 bg-success-50 rounded-lg flex items-center justify-center text-success-600">
            ${icons.location}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Departments</p>
            <p class="text-2xl font-bold mt-1">${totalDepartments || 0}</p>
          </div>
          <div class="w-10 h-10 bg-warning-50 rounded-lg flex items-center justify-center text-warning-600">
            ${icons.building}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-neutral-500">Pending Approvals</p>
            <p class="text-2xl font-bold mt-1 ${(pendingApprovals || 0) > 0 ? 'text-warning-600' : ''}">${pendingApprovals || 0}</p>
          </div>
          <div class="w-10 h-10 bg-danger-50 rounded-lg flex items-center justify-center text-danger-600">
            ${icons.approval}
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Admin Links -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <a href="#/user-management" class="card hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center text-primary-600">${icons.users}</div>
          <div>
            <p class="font-medium">User Management</p>
            <p class="text-sm text-neutral-500">Manage all accounts</p>
          </div>
        </div>
      </a>

      <a href="#/audit-logs" class="card hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600">${icons.audit}</div>
          <div>
            <p class="font-medium">Audit Logs</p>
            <p class="text-sm text-neutral-500">View system activity</p>
          </div>
        </div>
      </a>

      <a href="#/system-settings" class="card hover:shadow-md transition-shadow">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-neutral-100 rounded-lg flex items-center justify-center text-neutral-600">${icons.settings}</div>
          <div>
            <p class="font-medium">System Settings</p>
            <p class="text-sm text-neutral-500">Configure the system</p>
          </div>
        </div>
      </a>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="card">
        <h3 class="text-lg font-semibold mb-4">Users by Role</h3>
        <div style="position: relative; height: 200px;">
          <canvas id="users-by-role-chart"></canvas>
        </div>
      </div>

      <div class="card">
        <h3 class="text-lg font-semibold mb-4">System Activity (Last 7 Days)</h3>
        <div style="position: relative; height: 200px;">
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
    plugins: { legend: { position: 'bottom' } },
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
            backgroundColor: '#3b82f6',
            borderRadius: 6,
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
            backgroundColor: ['#94a3b8', '#f59e0b', '#22c55e'],
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

      const roleCounts = { admin: 0, hr: 0, supervisor: 0, intern: 0 };
      users?.forEach(u => { roleCounts[u.role] = (roleCounts[u.role] || 0) + 1; });

      createChart(roleCanvas, {
        type: 'doughnut',
        data: {
          labels: ['Admin', 'HR', 'Supervisor', 'Intern'],
          datasets: [{
            data: [roleCounts.admin, roleCounts.hr, roleCounts.supervisor, roleCounts.intern],
            backgroundColor: ['#1e40af', '#16a34a', '#d97706', '#3b82f6'],
          }],
        },
        options: defaultOptions,
      });
    }
  }
}
