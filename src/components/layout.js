/**
 * Application Layout
 * Provides sidebar navigation based on user role and main content area.
 */
import { getUserRole, getProfile, logout } from '../lib/auth.js';
import { navigateTo } from '../lib/router.js';
import { icons } from '../lib/icons.js';
import { showToast } from '../lib/toast.js';

/**
 * Get navigation items based on role.
 */
function getNavItems(role) {
  const items = {
    intern: [
      { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
      { path: '/attendance', label: 'Attendance', icon: icons.clock },
      { path: '/my-tasks', label: 'My Tasks', icon: icons.tasks },
      { path: '/narratives', label: 'Daily Narratives', icon: icons.narrative },
      { path: '/my-allowance', label: 'My Allowance', icon: icons.money },
      { path: '/notifications', label: 'Notifications', icon: icons.bell },
    ],
    supervisor: [
      { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
      { path: '/approvals', label: 'Approvals', icon: icons.approval },
      { path: '/task-management', label: 'Task Management', icon: icons.tasks },
      { path: '/team-attendance', label: 'Team Attendance', icon: icons.clock },
      { path: '/team-narratives', label: 'Team Narratives', icon: icons.narrative },
      { path: '/notifications', label: 'Notifications', icon: icons.bell },
    ],
    hr: [
      { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
      { path: '/attendance-overview', label: 'Attendance Overview', icon: icons.clock },
      { path: '/allowance-management', label: 'Allowance Management', icon: icons.money },
      { path: '/reports', label: 'Reports', icon: icons.reports },
      { path: '/intern-directory', label: 'Intern Directory', icon: icons.users },
      { path: '/departments', label: 'Departments', icon: icons.building },
      { path: '/notifications', label: 'Notifications', icon: icons.bell },
    ],
    admin: [
      { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
      { path: '/user-management', label: 'User Management', icon: icons.users },
      { path: '/departments', label: 'Departments', icon: icons.building },
      { path: '/locations', label: 'Locations', icon: icons.location },
      { path: '/attendance-overview', label: 'Attendance Overview', icon: icons.clock },
      { path: '/allowance-management', label: 'Allowance Management', icon: icons.money },
      { path: '/task-management', label: 'Task Management', icon: icons.tasks },
      { path: '/approvals', label: 'Approvals', icon: icons.approval },
      { path: '/reports', label: 'Reports', icon: icons.reports },
      { path: '/audit-logs', label: 'Audit Logs', icon: icons.audit },
      { path: '/system-settings', label: 'Settings', icon: icons.settings },
      { path: '/notifications', label: 'Notifications', icon: icons.bell },
    ],
  };

  return items[role] || [];
}

/**
 * Render the main app layout with sidebar.
 * @param {string} contentHtml
 * @param {Function} [init]
 */
export function renderLayout(contentHtml, init) {
  const role = getUserRole();
  const profile = getProfile();
  const navItems = getNavItems(role);
  const currentPath = window.location.hash.slice(1);

  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Mobile menu button -->
    <button id="mobile-menu-btn" class="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md">
      ${icons.menu}
    </button>

    <!-- Sidebar -->
    <aside id="sidebar" class="sidebar -translate-x-full lg:translate-x-0">
      <div class="p-4 border-b border-neutral-700">
        <h1 class="text-lg font-bold text-white">M88 Tracker</h1>
        <p class="text-xs text-neutral-400 mt-1">Interns Productivity</p>
      </div>

      <nav class="flex-1 overflow-y-auto p-3 space-y-1">
        ${navItems.map(item => `
          <a href="#${item.path}" 
             class="sidebar-link ${currentPath === item.path ? 'active' : ''}"
             data-path="${item.path}">
            ${item.icon}
            <span>${item.label}</span>
          </a>
        `).join('')}
      </nav>

      <div class="p-3 border-t border-neutral-700">
        <div class="flex items-center gap-3 px-3 py-2 mb-2">
          <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
            ${(profile?.full_name || 'U').charAt(0).toUpperCase()}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-white truncate">${profile?.full_name || 'User'}</p>
            <p class="text-xs text-neutral-400 capitalize">${role || 'Unknown'}</p>
          </div>
        </div>
        <a href="#/profile" class="sidebar-link ${currentPath === '/profile' ? 'active' : ''}">
          ${icons.user}
          <span>Profile</span>
        </a>
        <button id="logout-btn" class="sidebar-link w-full text-left">
          ${icons.logout}
          <span>Sign Out</span>
        </button>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div id="sidebar-overlay" class="fixed inset-0 bg-black/50 z-30 hidden lg:hidden"></div>

    <!-- Main Content -->
    <main class="lg:ml-64 min-h-screen">
      <div class="page-container" id="page-content">
        ${contentHtml}
      </div>
    </main>
  `;

  // Event bindings
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');

  mobileBtn?.addEventListener('click', () => {
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
  });

  overlay?.addEventListener('click', () => {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    try {
      await logout();
      showToast('Signed out successfully', 'success');
      navigateTo('/login');
    } catch (err) {
      showToast('Failed to sign out', 'error');
    }
  });

  if (init) {
    requestAnimationFrame(() => init(document.getElementById('page-content')));
  }
}
