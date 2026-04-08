/**
 * Application Layout
 * Provides sidebar navigation based on user role and main content area.
 */
import { getUserRole, getProfile, logout } from '../lib/auth.js';
import { navigateTo } from '../lib/router.js';
import { icons } from '../lib/icons.js';
import { showToast } from '../lib/toast.js';
import { renderAvatar, hydrateSignedAvatars } from '../lib/utils.js';
import { supabase } from '../lib/supabase.js';
import { fetchInternSidebarIndicators } from '../lib/sidebar-indicators.js';

const PST_TIMEZONE = 'Asia/Manila';
const pstTimeFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: PST_TIMEZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});
const pstDateFormatter = new Intl.DateTimeFormat('en-PH', {
  timeZone: PST_TIMEZONE,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startPstClock() {
  const timeEl = document.getElementById('pst-time');
  const dateEl = document.getElementById('pst-date');
  if (!timeEl) return () => {};

  const updateClock = () => {
    const now = new Date();
    timeEl.textContent = pstTimeFormatter.format(now);
    if (dateEl) dateEl.textContent = pstDateFormatter.format(now);
  };

  updateClock();
  const intervalId = window.setInterval(updateClock, 1000);
  return () => window.clearInterval(intervalId);
}

/**
 * Get navigation items grouped by section based on role.
 */
function getNavSections(role, profile) {
  const sections = {
    intern: [
      { label: 'Main', items: [
        { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
        { path: '/notifications', label: 'Notifications', icon: icons.bell },
      ]},
      { label: 'Work', items: [
        { path: '/attendance', label: 'Attendance', icon: icons.clock },
        { path: '/my-tasks', label: 'My Tasks', icon: icons.tasks },
        { path: '/narratives', label: 'Daily Narratives', icon: icons.narrative },
      ]},
      { label: 'Compensation', items: [
        { path: '/my-allowance', label: 'My Allowance', icon: icons.php },
        { path: '/my-dar-draft', label: 'My DAR Draft', icon: icons.reports, id: 'nav-my-dar-draft', hidden: true },
      ]},
    ],
    supervisor: [
      { label: 'Main', items: [
        { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
        { path: '/notifications', label: 'Notifications', icon: icons.bell },
      ]},
      { label: 'Management', items: [
        { path: '/approvals', label: 'Approvals', icon: icons.approval },
        { path: '/task-management', label: 'Task Management', icon: icons.tasks },
      ]},
      { label: 'Team', items: [
        { path: '/team-attendance', label: 'Team Attendance', icon: icons.clock },
        { path: '/team-narratives', label: 'Team Narratives', icon: icons.narrative },
      ]},
    ],
    admin: [
      { label: 'Main', items: [
        { path: '/dashboard', label: 'Dashboard', icon: icons.dashboard },
        { path: '/notifications', label: 'Notifications', icon: icons.bell },
      ]},
      { label: 'Operations', items: [
        { path: '/attendance-overview', label: 'Attendance', icon: icons.clock },
        { path: '/allowance-management', label: 'Allowance', icon: icons.php },
        { path: '/task-management', label: 'Tasks', icon: icons.tasks },
        { path: '/approvals', label: 'Approvals', icon: icons.approval },
        { path: '/holiday-calendar', label: 'Holiday Calendar', icon: icons.calendar },
        { path: '/reports', label: 'Reports', icon: icons.reports },
      ]},
      { label: 'People', items: [
        { path: '/user-management', label: 'User Maintenance', icon: icons.users },
        { path: '/intern-directory', label: 'Intern Directory', icon: icons.users },
      ]},
      ...(profile?.department_id ? [{ label: 'Team', items: [
        { path: '/team-attendance', label: 'Team Attendance', icon: icons.clock },
        { path: '/team-narratives', label: 'Team Narratives', icon: icons.narrative },
      ]}] : []),
      { label: 'Organization', items: [
        { path: '/departments', label: 'Departments', icon: icons.building },
        { path: '/locations', label: 'Locations', icon: icons.location },
      ]},
      { label: 'System', items: [
        { path: '/audit-logs', label: 'Audit Logs', icon: icons.audit },
        { path: '/system-settings', label: 'Settings', icon: icons.settings },
      ]},
    ],
  };

  return sections[role] || [];
}

// ─ Global notification debounce timer ─────────────────────
let notificationCheckTimer = null;
const NOTIFICATION_CHECK_DEBOUNCE = 1000; // 1 second

// ─ Global layout cleanup handler ───────────────────────────
let layoutCleanup = null;

function cleanupLayoutListeners() {
  if (layoutCleanup) {
    layoutCleanup();
    layoutCleanup = null;
  }
  if (notificationCheckTimer) {
    clearTimeout(notificationCheckTimer);
    notificationCheckTimer = null;
  }
}

/**
 * Render the main app layout with sidebar.
 */
export function renderLayout(contentHtml, init, guardPath) {
  if (guardPath && window.location.hash !== `#${guardPath}`) return;

  // Clean up old listeners before rendering new layout
  cleanupLayoutListeners();

  const role = getUserRole();
  const profile = getProfile();
  const navSections = getNavSections(role, profile);
  const currentPath = window.location.hash.slice(1);

  const roleLabels = { admin: 'Administrator', supervisor: 'Supervisor', intern: 'Intern' };

  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Mobile menu button -->
    <button id="mobile-menu-btn" class="lg:hidden fixed top-4 left-4 z-50 p-2.5 bg-white rounded-xl shadow-lg border border-neutral-200 text-neutral-600 hover:text-primary-600 hover:bg-primary-50 transition-all duration-200">
      ${icons.menu}
    </button>

    <!-- Sidebar -->
    <aside id="sidebar" class="sidebar -translate-x-full lg:translate-x-0">
      <!-- Logo area -->
      <div class="px-5 py-5 flex items-center gap-3" style="border-bottom: 1px solid var(--color-neutral-100);">
        <img src="/favicon.png" alt="Logo" class="w-15 h-15 object-contain shrink-0" />
        <div class="min-w-0">
          <p class="text-sm font-bold text-neutral-900 truncate">Interns Productivity <br> Tracker</p>
          <p class="text-xs text-neutral-400">Madison 88</p>
        </div>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        ${navSections.map(section => `
          <div class="sidebar-section">${section.label}</div>
          ${section.items.map(item => `
            <a href="#${item.path}"
               ${item.id ? `id="${item.id}"` : ''}
               class="sidebar-link ${currentPath === item.path ? 'active' : ''}"
               ${item.hidden ? 'style="display:none"' : ''}
               data-path="${item.path}">
              ${item.icon}
              <span>${item.label}</span>
              ${item.path === '/notifications' ? `<span id="notif-dot" class="hidden ml-auto w-2.5 h-2.5 bg-red-500 rounded-full shrink-0"></span>` : ''}
              ${role === 'intern' && item.path === '/my-tasks' ? `<span id="my-tasks-dot" class="hidden ml-auto w-2.5 h-2.5 bg-red-500 rounded-full shrink-0"></span>` : ''}
              ${role === 'intern' && item.path === '/narratives' ? `<span id="narratives-dot" class="hidden ml-auto w-2.5 h-2.5 bg-red-500 rounded-full shrink-0"></span>` : ''}
              ${role === 'intern' && item.path === '/my-allowance' ? `<span id="my-allowance-dot" class="hidden ml-auto w-2.5 h-2.5 bg-red-500 rounded-full shrink-0"></span>` : ''}
            </a>
          `).join('')}
        `).join('')}
      </nav>

      <!-- User profile section -->
      <div class="px-3 py-4" style="border-top: 1px solid var(--color-neutral-100);">
        <a href="#/profile" class="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 hover:bg-neutral-100 ${currentPath === '/profile' ? 'bg-primary-50' : ''}">
          ${renderAvatar(profile, 'w-9 h-9', 'text-sm')}
          <div class="flex-1 min-w-0">
            <p class="text-sm font-semibold text-neutral-800 truncate">${profile?.full_name || 'User'}</p>
            <p class="text-xs text-neutral-400">${roleLabels[role] || 'Unknown'}</p>
          </div>
        </a>
        <button id="logout-btn" class="sidebar-link w-full text-left mt-1 hover:bg-danger-50! hover:text-danger-600!">
          ${icons.logout}
          <span>Sign Out</span>
        </button>

        <div class="mt-3 mx-1 px-3 py-2.5 rounded-xl border border-neutral-200 bg-neutral-50/80">
          <p class="text-[11px] font-semibold uppercase tracking-widest text-neutral-500">Philippine Standard Time</p>
          <p id="pst-time" class="mt-1 text-base font-bold text-neutral-900">--:--:--</p>
          <p id="pst-date" class="text-xs text-neutral-500">Loading...</p>
        </div>
      </div>
    </aside>

    <!-- Mobile overlay -->
    <div id="sidebar-overlay" class="fixed inset-0 bg-neutral-900/30 backdrop-blur-sm z-30 hidden lg:hidden transition-opacity duration-300"></div>

    <!-- Main Content -->
    <main class="lg:ml-64 min-h-screen bg-neutral-50">
      <div class="page-container" id="page-content">
        ${contentHtml}
      </div>
    </main>
  `;

  hydrateSignedAvatars(app).catch(() => {});

  // Event handlers with proper cleanup
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const logoutBtn = document.getElementById('logout-btn');

  const handleMobileMenuToggle = () => {
    sidebar.classList.toggle('-translate-x-full');
    overlay.classList.toggle('hidden');
  };

  const handleOverlayClick = () => {
    sidebar.classList.add('-translate-x-full');
    overlay.classList.add('hidden');
  };

  const handleSidebarNavigation = (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      e.preventDefault();
      const newHash = link.getAttribute('href');
      const newPath = newHash.slice(1);
      if (window.location.hash === newHash) {
        navigateTo(newPath);
      } else {
        history.replaceState(null, '', newHash);
        window.location.reload();
      }
    }
  };

  const handleLogout = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // Visual feedback: disable immediately to prevent double-clicks
    const btn = e.currentTarget;
    const originalText = btn.innerHTML;
    btn.innerHTML = `${icons.spinner} <span>Signing out...</span>`;
    btn.style.pointerEvents = 'none';

    // Failsafe: warn and re-enable button if logout takes unusually long
    const failsafeTimeout = setTimeout(() => {
      console.warn('Logout taking too long; allowing retry');
      showToast('Sign out is taking longer than expected. Please try again.', 'warning');
      btn.innerHTML = originalText;
      btn.style.pointerEvents = '';
    }, 4500);

    try {
      // Bound logout wait; auth state is cleared immediately by logout(), so we can proceed to login.
      await Promise.race([logout(), wait(1800)]);
      clearTimeout(failsafeTimeout);

      // Small delay to ensure storage clear operations complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Use replace() to do full navigation without reload race condition
      window.location.replace(window.location.origin + window.location.pathname + '#/login');
    } catch (err) {
      // This should never happen since logout() is resilient, but handle it anyway
      console.error('Unexpected logout error:', err);
      clearTimeout(failsafeTimeout);

      // Still force navigation
      window.location.replace(window.location.origin + window.location.pathname + '#/login');
    }
  };

  // Attach event listeners
  mobileBtn?.addEventListener('click', handleMobileMenuToggle);
  overlay?.addEventListener('click', handleOverlayClick);
  sidebar?.addEventListener('click', handleSidebarNavigation);
  logoutBtn?.addEventListener('click', handleLogout);

  const stopPstClock = startPstClock();

  // Store cleanup function
  layoutCleanup = () => {
    mobileBtn?.removeEventListener('click', handleMobileMenuToggle);
    overlay?.removeEventListener('click', handleOverlayClick);
    sidebar?.removeEventListener('click', handleSidebarNavigation);
    logoutBtn?.removeEventListener('click', handleLogout);
    stopPstClock();
  };

  if (init) {
    requestAnimationFrame(() => init(document.getElementById('page-content')));
  }

  // Debounced notification check: only run once per second max
  const notifDot = document.getElementById('notif-dot');
  if (notifDot && profile?.id) {
    if (notificationCheckTimer) clearTimeout(notificationCheckTimer);
    notificationCheckTimer = setTimeout(async () => {
      try {
        const { count } = await supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', profile.id)
          .eq('is_read', false);
        if (count && count > 0 && notifDot) {
          notifDot.classList.remove('hidden');
        }

        if (role === 'intern') {
          const taskDot = document.getElementById('my-tasks-dot');
          const narrativesDot = document.getElementById('narratives-dot');
          const allowanceDot = document.getElementById('my-allowance-dot');

          const indicators = await fetchInternSidebarIndicators(profile);
          if (indicators.tasks && taskDot) taskDot.classList.remove('hidden');
          if (indicators.narratives && narrativesDot) narrativesDot.classList.remove('hidden');
          if (indicators.allowance && allowanceDot) allowanceDot.classList.remove('hidden');
        }
      } catch (err) {
        console.error('Failed to fetch notification count:', err);
      }
      notificationCheckTimer = null;
    }, NOTIFICATION_CHECK_DEBOUNCE);
  }

  // Feature-toggle: show/hide Intern DAR Draft link
  if (role === 'intern') {
    const link = document.getElementById('nav-my-dar-draft');
    // Fail-closed: keep hidden unless we can confirm it's enabled.
    if (link) link.style.display = 'none';

    supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'intern_dar_draft_view')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) throw error;
        const enabled = data?.value?.enabled === true || data?.value === true;
        if (link) link.style.display = enabled ? '' : 'none';
      })
      .catch((err) => {
        console.error('Failed to fetch intern_dar_draft_view setting:', err);
        // Keep it hidden if we can't read the setting.
        if (link) link.style.display = 'none';
      });
  }
}
