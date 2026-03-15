/**
 * Notifications Page
 * View and manage in-app notifications for all roles.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime } from '../lib/utils.js';

export async function renderNotificationsPage() {
  const profile = getProfile();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const notifs = notifications || [];
  const unreadCount = notifs.filter(n => !n.is_read).length;

  // Group notifications by relative date bucket
  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older'];
  const groups = {};
  notifs.forEach(n => {
    const g = getDateGroup(n.created_at);
    if (!groups[g]) groups[g] = [];
    groups[g].push(n);
  });

  const notifListHtml = groupOrder
    .filter(g => groups[g])
    .map(groupLabel => `
      <div class="notif-group" data-group="${groupLabel}">
        <p class="text-xs font-semibold text-neutral-400 uppercase tracking-widest px-1 mb-2 mt-6 first:mt-0">${groupLabel}</p>
        <div class="space-y-2">
          ${groups[groupLabel].map(n => renderNotifItem(n)).join('')}
        </div>
      </div>
    `).join('');

  renderLayout(`
    <!-- Page header -->
    <div class="page-header animate-fade-in-up">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="page-title">Notifications</h1>
          <p class="page-subtitle">Stay updated on your activity and approvals</p>
        </div>
        ${unreadCount > 0 ? `
          <button id="mark-all-read" class="btn-secondary shrink-0">
            ${icons.check}
            <span class="ml-2">Mark All Read</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Filter tabs -->
    <div class="flex items-center gap-3 mb-6 animate-fade-in-up" style="animation-delay: 100ms;">
      <div class="flex gap-1 p-1 rounded-xl" style="background: var(--color-neutral-100);">
        <button class="filter-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all bg-white shadow-sm text-neutral-800" data-filter="all">
          All
          <span class="ml-1.5 text-xs font-bold text-neutral-400">${notifs.length}</span>
        </button>
        <button class="filter-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-neutral-500" data-filter="unread">
          Unread
          ${unreadCount > 0 ? `<span class="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-xs font-bold text-white" style="background: var(--color-primary-600);">${unreadCount}</span>` : ''}
        </button>
      </div>
    </div>

    <!-- Notification list -->
    <div id="notification-list" class="animate-fade-in-up" style="animation-delay: 150ms;">
      ${notifs.length === 0 ? `
        <div class="card flex flex-col items-center justify-center py-20 text-center">
          <div class="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-neutral-400" style="background: var(--color-neutral-100);">
            ${icons.bell}
          </div>
          <p class="text-base font-semibold text-neutral-600">All caught up!</p>
          <p class="text-sm text-neutral-400 mt-1 max-w-xs">No notifications yet. You'll be alerted here when something needs your attention.</p>
        </div>
      ` : notifListHtml}
    </div>
  `, (el) => {

    // Filter tabs — toggle visibility
    el.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.filter-tab').forEach(t => {
          t.classList.remove('bg-white', 'shadow-sm', 'text-neutral-800');
          t.classList.add('text-neutral-500');
        });
        tab.classList.add('bg-white', 'shadow-sm', 'text-neutral-800');
        tab.classList.remove('text-neutral-500');

        const filter = tab.dataset.filter;
        el.querySelectorAll('.notification-item').forEach(item => {
          const isRead = item.dataset.read === 'true';
          item.style.display = (filter === 'unread' && isRead) ? 'none' : '';
        });
        // Hide group headers when all their items are hidden
        el.querySelectorAll('.notif-group').forEach(group => {
          const anyVisible = [...group.querySelectorAll('.notification-item')]
            .some(i => i.style.display !== 'none');
          group.style.display = anyVisible ? '' : 'none';
        });
        // Show inline empty state when no unread
        let noUnreadMsg = el.querySelector('#no-unread-msg');
        if (filter === 'unread' && unreadCount === 0) {
          if (!noUnreadMsg) {
            noUnreadMsg = document.createElement('div');
            noUnreadMsg.id = 'no-unread-msg';
            noUnreadMsg.className = 'card flex flex-col items-center justify-center py-16 text-center';
            noUnreadMsg.innerHTML = `
              <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-neutral-400" style="background: var(--color-neutral-100);">${icons.check}</div>
              <p class="text-base font-semibold text-neutral-600">No unread notifications</p>
              <p class="text-sm text-neutral-400 mt-1">You've read everything — great job!</p>
            `;
            el.querySelector('#notification-list').appendChild(noUnreadMsg);
          }
          noUnreadMsg.style.display = '';
        } else if (noUnreadMsg) {
          noUnreadMsg.style.display = 'none';
        }
      });
    });

    // Mark all read
    el.querySelector('#mark-all-read')?.addEventListener('click', async () => {
      try {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', profile.id)
          .eq('is_read', false);
        showToast('All notifications marked as read', 'success');
        renderNotificationsPage();
      } catch {
        showToast('Failed to update notifications', 'error');
      }
    });

    // Individual click → mark as read
    el.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        if (item.dataset.read === 'true') return;
        await supabase.from('notifications').update({ is_read: true }).eq('id', item.dataset.id);

        // Update DOM without re-render
        item.dataset.read = 'true';
        item.querySelector('.notif-unread-dot')?.remove();
        const title = item.querySelector('.notif-title');
        if (title) { title.classList.remove('font-semibold'); title.classList.add('font-medium'); }
        item.style.background = 'var(--color-neutral-50)';
        item.style.borderColor = 'transparent';
        item.style.boxShadow = 'none';
        item.style.opacity = '0.75';
      });
    });
  }, '/notifications');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderNotifItem(n) {
  const isRead = !!n.is_read;
  const itemStyle = isRead
    ? 'background: var(--color-neutral-50); border-color: transparent; opacity: 0.75;'
    : 'background: #ffffff; border-color: var(--color-neutral-200); box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

  return `
    <div class="notification-item border rounded-xl p-4 flex gap-3.5 cursor-pointer hover:border-primary-200 transition-all"
         style="${itemStyle}"
         data-id="${n.id}"
         data-read="${isRead}">
      <!-- Type icon -->
      <div class="shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getNotifColor(n.type)}">
        ${getNotifIcon(n.type)}
      </div>

      <!-- Body -->
      <div class="flex-1 min-w-0">
        <div class="flex items-start gap-2">
          <p class="notif-title ${isRead ? 'font-medium' : 'font-semibold'} text-sm text-neutral-900 flex-1 leading-snug">${n.title}</p>
          <div class="flex items-center gap-1.5 shrink-0 mt-0.5">
            ${!isRead ? `<span class="notif-unread-dot w-2 h-2 rounded-full shrink-0" style="background: var(--color-primary-500);"></span>` : ''}
            <span class="text-xs text-neutral-400 whitespace-nowrap">${relativeTime(n.created_at)}</span>
          </div>
        </div>
        ${n.message ? `<p class="text-xs text-neutral-500 mt-1 leading-relaxed">${n.message}</p>` : ''}
        <div class="flex items-center flex-wrap gap-2 mt-2">
          ${getTypeBadge(n.type)}
          <span class="text-neutral-300 text-xs">·</span>
          <span class="text-xs text-neutral-400">${formatDateTime(n.created_at)}</span>
        </div>
      </div>
    </div>
  `;
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

function getDateGroup(dateStr) {
  const now = new Date();
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0);
  if (d >= today) return 'Today';
  if (d >= yesterday) return 'Yesterday';
  if (d >= weekAgo) return 'This Week';
  return 'Older';
}

function getTypeLabel(type) {
  const labels = {
    attendance_submitted: 'Attendance',
    attendance_approved: 'Attendance',
    attendance_rejected: 'Attendance',
    task_assigned: 'Task',
    task_status_change: 'Task',
    narrative_submitted: 'Narrative',
    narrative_approved: 'Narrative',
    narrative_rejected: 'Narrative',
    allowance_approved: 'Allowance',
    correction_submitted: 'Correction',
    escalation: 'Escalation',
  };
  return labels[type] || 'System';
}

function getTypeBadge(type) {
  const label = getTypeLabel(type);
  const colorMap = {
    Attendance: 'bg-primary-50 text-primary-700',
    Task: 'bg-warning-50 text-warning-700',
    Narrative: 'bg-success-50 text-success-700',
    Allowance: 'bg-success-50 text-success-700',
    Correction: 'bg-warning-50 text-warning-700',
    Escalation: 'bg-danger-50 text-danger-600',
    System: 'bg-neutral-100 text-neutral-600',
  };
  const cls = colorMap[label] || 'bg-neutral-100 text-neutral-600';
  return `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls}">${label}</span>`;
}

function getNotifColor(type) {
  const map = {
    attendance_submitted: 'bg-primary-50 text-primary-600',
    attendance_approved: 'bg-success-50 text-success-600',
    attendance_rejected: 'bg-danger-50 text-danger-600',
    task_assigned: 'bg-primary-50 text-primary-600',
    task_status_change: 'bg-warning-50 text-warning-600',
    narrative_submitted: 'bg-primary-50 text-primary-600',
    narrative_approved: 'bg-success-50 text-success-600',
    narrative_rejected: 'bg-danger-50 text-danger-600',
    allowance_approved: 'bg-success-50 text-success-600',
    correction_submitted: 'bg-warning-50 text-warning-600',
    escalation: 'bg-danger-50 text-danger-600',
  };
  return map[type] || 'bg-neutral-100 text-neutral-500';
}

function getNotifIcon(type) {
  if (type?.includes('attendance')) return icons.clock;
  if (type?.includes('task')) return icons.tasks;
  if (type?.includes('narrative')) return icons.narrative;
  if (type?.includes('allowance')) return icons.money;
  if (type?.includes('escalation')) return icons.alert;
  return icons.bell;
}
