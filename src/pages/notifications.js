/**
 * Notifications Page
 * View and manage in-app notifications for all roles.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDateTime } from '../lib/utils.js';

export async function renderNotificationsPage() {
  const profile = getProfile();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const unreadCount = (notifications || []).filter(n => !n.read_at).length;

  renderLayout(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-neutral-800">Notifications</h1>
        <p class="text-neutral-500 mt-1">${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}</p>
      </div>
      ${unreadCount > 0 ? `
        <button id="mark-all-read" class="btn-secondary">
          ${icons.check}
          <span class="ml-2">Mark All Read</span>
        </button>
      ` : ''}
    </div>

    <div class="space-y-3" id="notification-list">
      ${(notifications || []).length === 0 ? `
        <div class="card text-center py-12">
          <div class="text-neutral-300 mb-3">${icons.bell}</div>
          <p class="text-neutral-400">No notifications yet</p>
        </div>
      ` : ''}
      ${(notifications || []).map(n => `
        <div class="card flex items-start gap-4 cursor-pointer notification-item ${n.read_at ? 'opacity-60' : 'border-l-4 border-primary-500'}" data-id="${n.id}" data-read="${!!n.read_at}">
          <div class="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${getNotifColor(n.type)}">
            ${getNotifIcon(n.type)}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-neutral-800">${n.title}</p>
            <p class="text-sm text-neutral-500 mt-1">${n.message || ''}</p>
            <p class="text-xs text-neutral-400 mt-2">${formatDateTime(n.created_at)}</p>
          </div>
          ${!n.read_at ? `<span class="w-2 h-2 bg-primary-500 rounded-full flex-shrink-0 mt-2"></span>` : ''}
        </div>
      `).join('')}
    </div>
  `, (el) => {
    // Mark all read
    el.querySelector('#mark-all-read')?.addEventListener('click', async () => {
      try {
        await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('user_id', profile.id)
          .is('read_at', null);
        showToast('All marked as read', 'success');
        renderNotificationsPage();
      } catch (err) {
        showToast('Failed to update', 'error');
      }
    });

    // Individual notification click
    el.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        if (item.dataset.read === 'false') {
          await supabase
            .from('notifications')
            .update({ read_at: new Date().toISOString() })
            .eq('id', item.dataset.id);
          item.classList.remove('border-l-4', 'border-primary-500');
          item.classList.add('opacity-60');
          item.dataset.read = 'true';
          const dot = item.querySelector('.bg-primary-500');
          if (dot) dot.remove();
        }
      });
    });
  });
}

function getNotifColor(type) {
  const map = {
    attendance_submitted: 'bg-primary-100 text-primary-600',
    attendance_approved: 'bg-success-100 text-success-600',
    attendance_rejected: 'bg-danger-100 text-danger-600',
    task_assigned: 'bg-primary-100 text-primary-600',
    task_status_change: 'bg-warning-100 text-warning-600',
    narrative_submitted: 'bg-primary-100 text-primary-600',
    narrative_approved: 'bg-success-100 text-success-600',
    narrative_rejected: 'bg-danger-100 text-danger-600',
    allowance_approved: 'bg-success-100 text-success-600',
    correction_submitted: 'bg-warning-100 text-warning-600',
    escalation: 'bg-danger-100 text-danger-600',
  };
  return map[type] || 'bg-neutral-100 text-neutral-600';
}

function getNotifIcon(type) {
  if (type?.includes('attendance')) return icons.clock;
  if (type?.includes('task')) return icons.tasks;
  if (type?.includes('narrative')) return icons.narrative;
  if (type?.includes('allowance')) return icons.money;
  if (type?.includes('escalation')) return icons.alert;
  return icons.bell;
}
