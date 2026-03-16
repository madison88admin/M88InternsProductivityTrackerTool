/**
 * Application Entry Point
 * Initializes auth, registers all routes with the SPA router, and starts the app.
 */
import 'quill/dist/quill.snow.css';
import './styles/main.css';
import { initAuth, isAuthenticated, getUserRole, hasRole } from './lib/auth.js';
import { addRoute, setBeforeEach, setNotFound, initRouter, navigateTo } from './lib/router.js';
import { showToast } from './lib/toast.js';

// ── Page Imports ────────────────────────────────────────────
import { renderLoginPage } from './pages/login.js';
import { renderAdminSetupPage } from './pages/admin-setup.js';
import { renderForgotPasswordPage } from './pages/forgot-password.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderAttendancePage } from './pages/attendance.js';
import { renderMyTasksPage } from './pages/my-tasks.js';
import { renderNarrativesPage } from './pages/narratives.js';
import { renderMyAllowancePage } from './pages/my-allowance.js';
import { renderTaskManagementPage } from './pages/task-management.js';
import { renderApprovalsPage } from './pages/approvals.js';
import { renderTeamAttendancePage } from './pages/team-attendance.js';
import { renderTeamNarrativesPage } from './pages/team-narratives.js';
import { renderUserManagementPage } from './pages/user-management.js';
import { renderAllowanceManagementPage } from './pages/allowance-management.js';
import { renderReportsPage } from './pages/reports.js';
import { renderInternDirectoryPage } from './pages/intern-directory.js';
import { renderAttendanceOverviewPage } from './pages/attendance-overview.js';
import { renderDepartmentsPage } from './pages/departments.js';
import { renderLocationsPage } from './pages/locations.js';
import { renderAuditLogsPage } from './pages/audit-logs.js';
import { renderSystemSettingsPage } from './pages/system-settings.js';
import { renderHolidayCalendarPage } from './pages/holiday-calendar.js';
import { renderNotificationsPage } from './pages/notifications.js';
import { renderProfilePage } from './pages/profile.js';

// ── Public routes (no auth required) ───────────────────────
const PUBLIC_ROUTES = ['/login', '/admin-setup', '/forgot-password'];

// ── Register Routes ─────────────────────────────────────────

// Public
addRoute('/login', renderLoginPage);
addRoute('/admin-setup', renderAdminSetupPage);
addRoute('/forgot-password', renderForgotPasswordPage);

// All authenticated users
addRoute('/dashboard', renderDashboard, ['intern', 'supervisor', 'admin']);
addRoute('/notifications', renderNotificationsPage, ['intern', 'supervisor', 'admin']);
addRoute('/profile', renderProfilePage, ['intern', 'supervisor', 'admin']);

// Intern
addRoute('/attendance', renderAttendancePage, ['intern']);
addRoute('/my-tasks', renderMyTasksPage, ['intern']);
addRoute('/narratives', renderNarrativesPage, ['intern']);
addRoute('/my-allowance', renderMyAllowancePage, ['intern']);

// Supervisor
addRoute('/approvals', renderApprovalsPage, ['supervisor', 'admin']);
addRoute('/task-management', renderTaskManagementPage, ['supervisor', 'admin']);
addRoute('/team-attendance', renderTeamAttendancePage, ['supervisor', 'admin']);
addRoute('/team-narratives', renderTeamNarrativesPage, ['supervisor', 'admin']);

// HR (Admin only)
addRoute('/allowance-management', renderAllowanceManagementPage, ['admin']);
addRoute('/reports', renderReportsPage, ['admin']);
addRoute('/intern-directory', renderInternDirectoryPage, ['admin']);
addRoute('/attendance-overview', renderAttendanceOverviewPage, ['admin']);
addRoute('/departments', renderDepartmentsPage, ['admin']);

// Admin only
addRoute('/user-management', renderUserManagementPage, ['admin']);
addRoute('/locations', renderLocationsPage, ['admin']);
addRoute('/audit-logs', renderAuditLogsPage, ['admin']);
addRoute('/system-settings', renderSystemSettingsPage, ['admin']);
addRoute('/holiday-calendar', renderHolidayCalendarPage, ['admin']);

// ── Navigation Guard ────────────────────────────────────────
setBeforeEach(async (path) => {
  const isPublic = PUBLIC_ROUTES.includes(path);

  if (!isPublic && !isAuthenticated()) {
    navigateTo('/login');
    return false;
  }

  if (isPublic && isAuthenticated() && path !== '/admin-setup') {
    navigateTo('/dashboard');
    return false;
  }

  // Role-based access check
  const routeConfig = getRouteConfig(path);
  if (routeConfig?.roles?.length > 0 && !hasRole(...routeConfig.roles)) {
    showToast('You do not have permission to access this page', 'error');
    navigateTo('/dashboard');
    return false;
  }

  return true;
});

/**
 * Helper to get route config for role checking in the guard.
 * We store a local map since addRoute doesn't expose the routes Map.
 */
const routeRoleMap = new Map();
function registerRoles(path, roles) { routeRoleMap.set(path, { roles }); }
function getRouteConfig(path) { return routeRoleMap.get(path) || null; }

// Register the role map
registerRoles('/dashboard', ['intern', 'supervisor', 'admin']);
registerRoles('/notifications', ['intern', 'supervisor', 'admin']);
registerRoles('/profile', ['intern', 'supervisor', 'admin']);
registerRoles('/attendance', ['intern']);
registerRoles('/my-tasks', ['intern']);
registerRoles('/narratives', ['intern']);
registerRoles('/my-allowance', ['intern']);
registerRoles('/approvals', ['supervisor', 'admin']);
registerRoles('/task-management', ['supervisor', 'admin']);
registerRoles('/team-attendance', ['supervisor', 'admin']);
registerRoles('/team-narratives', ['supervisor', 'admin']);
registerRoles('/allowance-management', ['admin']);
registerRoles('/reports', ['admin']);
registerRoles('/intern-directory', ['admin']);
registerRoles('/attendance-overview', ['admin']);
registerRoles('/departments', ['admin']);
registerRoles('/user-management', ['admin']);
registerRoles('/locations', ['admin']);
registerRoles('/audit-logs', ['admin']);
registerRoles('/system-settings', ['admin']);
registerRoles('/holiday-calendar', ['admin']);

// ── 404 Handler ─────────────────────────────────────────────
setNotFound(() => {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-neutral-50">
      <div class="text-center">
        <h1 class="text-6xl font-bold text-neutral-300 mb-4">404</h1>
        <p class="text-neutral-500 mb-6">Page not found</p>
        <a href="#/dashboard" class="btn-primary inline-flex">Go to Dashboard</a>
      </div>
    </div>
  `;
});

// ── App Initialization ──────────────────────────────────────
async function boot() {
  try {
    await initAuth();
    initRouter();
  } catch (err) {
    console.error('App initialization failed:', err);
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="min-h-screen flex items-center justify-center bg-neutral-50">
        <div class="text-center max-w-md">
          <h1 class="text-2xl font-bold text-danger-600 mb-2">Initialization Error</h1>
          <p class="text-neutral-500 mb-4">Failed to connect to the server. Please check your connection and try again.</p>
          <button onclick="location.reload()" class="btn-primary">Retry</button>
        </div>
      </div>
    `;
  }
}

boot();
