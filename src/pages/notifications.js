/**
 * Notifications Page
 * View and manage in-app notifications for all roles.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime, formatTime } from '../lib/utils.js';
import { openOjtCompletionModal } from '../lib/ojt-completion.js';
import { createModal } from '../lib/component.js';
import { logAudit } from '../lib/audit.js';
import { sendEmailNotification, getApprovalResultTemplate } from '../lib/email-notifications.js';

export async function renderNotificationsPage() {
  const profile = getProfile();
  const isAdmin = profile.role === 'admin';

  // For admins with departments, load interns in their department
  let departmentInternIds = [];
  if (isAdmin && profile.department_id) {
    const { data: deptInterns } = await supabase
      .from('profiles')
      .select('id')
      .eq('department_id', profile.department_id)
      .eq('role', 'intern');
    departmentInternIds = (deptInterns || []).map(i => i.id);
  }

  // Get saved preference from sessionStorage, or use default
  let showDeptOnly = isAdmin && profile.department_id && departmentInternIds.length > 0
    ? sessionStorage.getItem('notif-dept-filter') === 'dept'
    : false;

  async function loadNotifications() {
    if (!isAdmin) {
      // Non-admin sees only their own
      const { data: notifications } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(100);
      return notifications || [];
    }

    if (showDeptOnly && departmentInternIds.length > 0) {
      // Admin viewing "My Department" - need notifications about department interns
      // This includes: notifications TO interns AND pending approval notifications about them

      // Fetch all notifications and filter in memory for department relevance
      const { data: allNotifs } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      // Get ALL approvals for department interns (pending, approved, rejected)
      const { data: deptApprovals } = await supabase
        .from('approvals')
        .select('entity_id, type')
        .in('intern_id', departmentInternIds);

      const approvalEntityIds = new Set((deptApprovals || []).map(a => a.entity_id).filter(Boolean));

      // Filter notifications to those relevant to department:
      // 1. Sent TO department interns (approval results, system notifications, etc.), OR
      // 2. Notifications ABOUT department intern submissions (pending approvals, etc.)
      const notifications = (allNotifs || []).filter(notif => {
        // Include if notification is TO a department intern
        if (departmentInternIds.includes(notif.user_id)) return true;

        // Include if it's a notification about a department intern's submission
        if (notif.entity_id && approvalEntityIds.has(notif.entity_id)) {
          return true;
        }

        return false;
      }).slice(0, 100);

      return notifications;
    }

    // Admin viewing "All Interns" - see all notifications
    const { data: notifications } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    return notifications || [];
  }

  let notifs = await loadNotifications();
  const unreadCount = notifs.filter(n => !n.is_read).length;
  const notifTypes = [...new Set(notifs.map(n => getTypeLabel(n)))].sort((a, b) => a.localeCompare(b));
  const typeOptionsHtml = notifTypes
    .map(type => `<option value="${type}">${type}</option>`)
    .join('');

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
    <div class="flex items-center justify-between gap-3 mb-6 animate-fade-in-up flex-wrap" style="animation-delay: 100ms;">
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

      <div class="flex items-center gap-3">
        <label for="notif-type-filter" class="text-sm text-neutral-500 font-medium">Type:</label>
        <select id="notif-type-filter" class="form-input py-2 px-3 text-sm min-w-45">
          <option value="all">All Types</option>
          ${typeOptionsHtml}
        </select>
      </div>

      ${isAdmin && departmentInternIds.length > 0 ? `
      <div class="flex gap-1 p-1 rounded-xl ml-auto" style="background: var(--color-neutral-100);">
        <button id="dept-all-btn" class="dept-toggle-btn px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${!showDeptOnly ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-500'}" data-value="all">
          <span class="dept-btn-text">All Interns</span>
          <span class="dept-btn-spinner ml-1 animate-spin rounded-full h-3 w-3 border-2 border-b-transparent inline-block" style="display: none; border-color: currentColor;"></span>
        </button>
        <button id="dept-dept-btn" class="dept-toggle-btn px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${showDeptOnly ? 'bg-white shadow-sm text-neutral-800' : 'text-neutral-500'}" data-value="dept">
          <span class="dept-btn-text">My Department</span>
          <span class="dept-btn-spinner ml-1 animate-spin rounded-full h-3 w-3 border-2 border-b-transparent inline-block" style="display: none; border-color: currentColor;"></span>
        </button>
      </div>
      ` : ''}
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
    let activeReadFilter = 'all';
    let activeTypeFilter = 'all';

    const applyFilters = () => {
      let visibleCount = 0;

      el.querySelectorAll('.notification-item').forEach(item => {
        const isRead = item.dataset.read === 'true';
        const itemType = item.dataset.typeLabel || 'System';
        const matchesRead = activeReadFilter !== 'unread' || !isRead;
        const matchesType = activeTypeFilter === 'all' || activeTypeFilter === itemType;
        const isVisible = matchesRead && matchesType;

        item.style.display = isVisible ? '' : 'none';
        if (isVisible) visibleCount += 1;
      });

      // Hide group headers when all their items are hidden
      el.querySelectorAll('.notif-group').forEach(group => {
        const anyVisible = [...group.querySelectorAll('.notification-item')]
          .some(i => i.style.display !== 'none');
        group.style.display = anyVisible ? '' : 'none';
      });

      let emptyState = el.querySelector('#no-filter-results-msg');
      if (visibleCount === 0 && notifs.length > 0) {
        if (!emptyState) {
          emptyState = document.createElement('div');
          emptyState.id = 'no-filter-results-msg';
          emptyState.className = 'card flex flex-col items-center justify-center py-16 text-center';
          emptyState.innerHTML = `
            <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 text-neutral-400" style="background: var(--color-neutral-100);">${icons.bell}</div>
            <p class="text-base font-semibold text-neutral-600">No matching notifications</p>
            <p class="text-sm text-neutral-400 mt-1">Try changing your filters to see more results.</p>
          `;
          el.querySelector('#notification-list').appendChild(emptyState);
        }
        emptyState.style.display = '';
      } else if (emptyState) {
        emptyState.style.display = 'none';
      }
    };

    // Filter tabs — toggle visibility
    el.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.filter-tab').forEach(t => {
          t.classList.remove('bg-white', 'shadow-sm', 'text-neutral-800');
          t.classList.add('text-neutral-500');
        });
        tab.classList.add('bg-white', 'shadow-sm', 'text-neutral-800');
        tab.classList.remove('text-neutral-500');

        activeReadFilter = tab.dataset.filter || 'all';
        applyFilters();
      });
    });

    el.querySelector('#notif-type-filter')?.addEventListener('change', (event) => {
      activeTypeFilter = event.target.value;
      applyFilters();
    });

    // Department toggle buttons — update filter and re-render
    el.querySelectorAll('.dept-toggle-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        // Disable all buttons and show spinner on active button
        el.querySelectorAll('.dept-toggle-btn').forEach(b => b.disabled = true);
        btn.querySelector('.dept-btn-spinner').style.display = 'inline-block';

        // Save preference and re-render
        sessionStorage.setItem('notif-dept-filter', btn.dataset.value);
        await renderNotificationsPage();

        // Re-enable buttons and hide spinners (this happens after page re-renders)
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

    // Individual click → open details modal (or open action modal for OJT notifications)
    el.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', async () => {
        const notifType = item.dataset.type;
        const entityId = item.dataset.entityId;
        const notifId = item.dataset.id;
        const notif = notifs.find(n => n.id === notifId);

        if (!notif) return;

        if (item.dataset.read !== 'true') {
          await supabase.from('notifications').update({ is_read: true }).eq('id', notif.id);
          markNotificationAsReadInDom(item);
          applyFilters();
        }

        // OJT completion notifications open the three-option action modal
        if (notifType === 'ojt_completed' && entityId) {
          openOjtCompletionModal(entityId, renderNotificationsPage);
          return;
        }

        if (notifType === 'pending_approval' && (profile.role === 'admin' || profile.role === 'supervisor')) {
          await openApprovalNotificationModal(notif, profile);
          return;
        }

        openNotificationDetailsModal(notif);
      });
    });
  }, '/notifications');
}

function markNotificationAsReadInDom(item) {
  item.dataset.read = 'true';
  item.querySelector('.notif-unread-dot')?.remove();
  const title = item.querySelector('.notif-title');
  if (title) {
    title.classList.remove('font-semibold');
    title.classList.add('font-medium');
  }
  item.style.background = 'var(--color-neutral-50)';
  item.style.borderColor = 'transparent';
  item.style.boxShadow = 'none';
  item.style.opacity = '0.75';
}

function openNotificationDetailsModal(notification) {
  createModal('Notification Details', `
    <div class="space-y-4">
      <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
        <p class="text-xs text-neutral-500 mb-1">Title</p>
        <p class="text-sm font-semibold text-neutral-900">${notification.title || 'Notification'}</p>
      </div>
      <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
        <p class="text-xs text-neutral-500 mb-1">Message</p>
        <p class="text-sm text-neutral-700 leading-relaxed">${notification.message || 'No additional details.'}</p>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Category</p>
          <p class="text-sm font-medium text-neutral-800">${getTypeLabel(notification)}</p>
        </div>
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Received</p>
          <p class="text-sm font-medium text-neutral-800">${formatDateTime(notification.created_at)}</p>
        </div>
      </div>
    </div>
  `);
}

async function openApprovalNotificationModal(notification, profile) {
  // Open modal immediately with loading state
  createModal('Review Notification', `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
        <p class="text-sm text-neutral-500">Loading details...</p>
      </div>
    </div>
  `, async (modalEl, close) => {
    // Fetch data AFTER modal is open
    const approval = await findPendingApprovalForNotification(notification, profile);

    if (!approval) {
      modalEl.querySelector('.modal-body').innerHTML = `
        <div class="space-y-4">
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-sm text-neutral-700">${notification.message || 'No details available.'}</p>
          </div>
          <p class="text-sm text-warning-600">This item is no longer pending or already reviewed.</p>
        </div>
      `;
      return;
    }

    const detailsHtml = await getApprovalDetailsHtml(approval);

    // Check if this is an attendance correction request and user is a supervisor
    const isAttendanceCorrectionForSupervisor = approval.type === 'attendance_correction' && profile.role === 'supervisor';

    // Replace loading state with actual content
    modalEl.querySelector('.modal-body').innerHTML = `
    <div class="space-y-4">
      <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
        <p class="text-xs text-neutral-500 mb-1">Submission</p>
        <p class="text-sm font-semibold text-neutral-900">${approval.type.replace('_', ' ')}</p>
        <p class="text-xs text-neutral-500 mt-1">Submitted ${formatDateTime(approval.submitted_at)}</p>
      </div>

      <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
        <p class="text-xs text-neutral-500 mb-1">Message</p>
        <p class="text-sm text-neutral-700 leading-relaxed">${notification.message || 'No details available.'}</p>
      </div>

      ${detailsHtml}

      ${isAttendanceCorrectionForSupervisor ? `
        <div class="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div class="flex items-start gap-3">
            <svg class="w-5 h-5 text-blue-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <div>
              <p class="text-sm font-semibold text-blue-900 mb-1">Admin Approval Required</p>
              <p class="text-xs text-blue-700 leading-relaxed">Attendance correction requests can only be approved or rejected by administrators. This notification is for your awareness only.</p>
            </div>
          </div>
        </div>
      ` : `
        <form id="notif-reject-form" class="hidden space-y-2 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <label class="text-xs text-neutral-500">Reason for rejection <span class="text-danger-500">*</span></label>
          <textarea id="notif-reject-reason" class="form-input" rows="3" placeholder="Provide reason for rejection..."></textarea>
        </form>
      `}

      <div class="flex justify-end gap-3 pt-2 border-t border-neutral-200">
        <button type="button" id="notif-cancel" class="btn-secondary">Close</button>
        ${!isAttendanceCorrectionForSupervisor ? `
          <button type="button" id="notif-show-reject" class="btn-danger">Reject</button>
          <button type="button" id="notif-approve" class="btn-success">Approve</button>
        ` : ''}
      </div>
      ${!isAttendanceCorrectionForSupervisor ? `
        <div id="notif-reject-actions" class="hidden justify-end gap-3">
          <button type="button" id="notif-reject-back" class="btn-secondary">Back</button>
          <button type="button" id="notif-reject-submit" class="btn-danger">Confirm Reject</button>
        </div>
      ` : ''}
    </div>
  `;

    // Attach event listeners after content is replaced
    modalEl.querySelector('#notif-cancel').addEventListener('click', close);

    // Only attach approve/reject listeners if not an attendance correction for supervisors
    if (!isAttendanceCorrectionForSupervisor) {
      const approveBtn = modalEl.querySelector('#notif-approve');
      const showRejectBtn = modalEl.querySelector('#notif-show-reject');
      const rejectForm = modalEl.querySelector('#notif-reject-form');
      const rejectActions = modalEl.querySelector('#notif-reject-actions');
      const footerRow = modalEl.querySelector('.border-t');

      showRejectBtn.addEventListener('click', () => {
        rejectForm.classList.remove('hidden');
        rejectActions.classList.remove('hidden');
        rejectActions.classList.add('flex');
        footerRow.classList.add('hidden');
      });

      modalEl.querySelector('#notif-reject-back').addEventListener('click', () => {
        rejectForm.classList.add('hidden');
        rejectActions.classList.add('hidden');
        rejectActions.classList.remove('flex');
        footerRow.classList.remove('hidden');
      });

      approveBtn.addEventListener('click', async () => {
        approveBtn.disabled = true;
        showRejectBtn.disabled = true;
        try {
          await processApprovalFromNotification(approval, 'approved');
          showToast('Submission approved', 'success');
          close();
          renderNotificationsPage();
        } catch (err) {
          showToast(err.message || 'Failed to approve submission', 'error');
          approveBtn.disabled = false;
          showRejectBtn.disabled = false;
        }
      });

      modalEl.querySelector('#notif-reject-submit').addEventListener('click', async () => {
        const reason = modalEl.querySelector('#notif-reject-reason').value.trim();
        if (!reason) {
          showToast('Please provide a rejection reason', 'error');
          return;
        }

        const rejectSubmitBtn = modalEl.querySelector('#notif-reject-submit');
        rejectSubmitBtn.disabled = true;
        try {
          await processApprovalFromNotification(approval, 'rejected', reason);
          showToast('Submission rejected', 'success');
          close();
          renderNotificationsPage();
        } catch (err) {
          showToast(err.message || 'Failed to reject submission', 'error');
          rejectSubmitBtn.disabled = false;
        }
      });
    }
  });
}

async function findPendingApprovalForNotification(notification, profile) {
  const role = profile.role;
  const entityType = notification.entity_type;
  const types = getApprovalTypesByEntityType(entityType, notification.title);

  if (types.length === 0 || !notification.entity_id) return null;

  let query = supabase
    .from('approvals')
    .select('*, intern:profiles!approvals_intern_id_fkey(full_name)')
    .eq('entity_id', notification.entity_id)
    .eq('status', 'pending')
    .in('type', types)
    .order('created_at', { ascending: false })
    .limit(1);

  if (role === 'supervisor') {
    query = query.eq('supervisor_id', profile.id);
  }

  const { data } = await query;
  return data?.[0] || null;
}

function getApprovalTypesByEntityType(entityType, title = '') {
  if (entityType === 'attendance') return ['attendance'];
  if (entityType === 'narrative') return ['narrative'];
  if (entityType === 'attendance_correction') return ['attendance_correction'];
  if (entityType === 'task') {
    if (title?.toLowerCase().includes('submission')) return ['task_submission'];
    return ['task_status', 'task_submission'];
  }
  return [];
}

async function getApprovalDetailsHtml(approval) {
  if (approval.type === 'attendance') {
    const { data: record } = await supabase
      .from('attendance_records')
      .select('date, total_hours')
      .eq('id', approval.entity_id)
      .single();

    if (!record) return '<p class="text-sm text-neutral-500">Attendance details unavailable.</p>';

    return `
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Date</p>
          <p class="text-sm font-medium text-neutral-800">${formatDate(record.date)}</p>
        </div>
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Total Hours</p>
          <p class="text-sm font-medium text-neutral-800">${record.total_hours || 0}</p>
        </div>
      </div>
    `;
  }

  if (approval.type === 'narrative') {
    const { data: narrative } = await supabase
      .from('narratives')
      .select('date, session, content, task:tasks(title)')
      .eq('id', approval.entity_id)
      .single();

    if (!narrative) return '<p class="text-sm text-neutral-500">Narrative details unavailable.</p>';

    return `
      <div class="space-y-3">
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Task</p>
          <p class="text-sm font-medium text-neutral-800">${narrative.task?.title || 'Unknown'}</p>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Date</p>
            <p class="text-sm font-medium text-neutral-800">${formatDate(narrative.date)}</p>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Session</p>
            <p class="text-sm font-medium text-neutral-800">${narrative.session || '—'}</p>
          </div>
        </div>
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Content</p>
          <p class="text-sm text-neutral-700 leading-relaxed">${narrative.content || '—'}</p>
        </div>
      </div>
    `;
  }

  if (approval.type === 'task_status' || approval.type === 'task_submission') {
    const { data: task } = await supabase
      .from('tasks')
      .select('title, description, status, pending_status, due_date')
      .eq('id', approval.entity_id)
      .single();

    if (!task) return '<p class="text-sm text-neutral-500">Task details unavailable.</p>';

    return `
      <div class="space-y-3">
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Task</p>
          <p class="text-sm font-medium text-neutral-800">${task.title || '—'}</p>
        </div>
        ${task.description ? `
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Description</p>
            <p class="text-sm text-neutral-700 leading-relaxed">${task.description}</p>
          </div>
        ` : ''}
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Current Status</p>
            <p class="text-sm font-medium text-neutral-800">${(task.status || '—').replace('_', ' ')}</p>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Requested Status</p>
            <p class="text-sm font-medium text-neutral-800">${(task.pending_status || '—').replace('_', ' ')}</p>
          </div>
        </div>
      </div>
    `;
  }

  if (approval.type === 'attendance_correction') {
    const { data: correction } = await supabase
      .from('attendance_corrections')
      .select('reason, punch_type, original_value, requested_value, attendance:attendance_records!attendance_id(date)')
      .eq('id', approval.entity_id)
      .single();

    const punchLabels = {
      time_in_1: 'Morning Time In',
      time_out_1: 'Lunch Time Out',
      time_in_2: 'Afternoon Time In',
      time_out_2: 'End of Day Time Out',
    };

    if (!correction) return '<p class="text-sm text-neutral-500">Correction details unavailable.</p>';

    return `
      <div class="space-y-3">
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Date</p>
            <p class="text-sm font-medium text-neutral-800">${correction.attendance?.date ? formatDate(correction.attendance.date) : '—'}</p>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Punch Type</p>
            <p class="text-sm font-medium text-neutral-800">${punchLabels[correction.punch_type] || correction.punch_type || '—'}</p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Original</p>
            <p class="text-sm font-medium text-neutral-800">${correction.original_value ? formatTime(correction.original_value) : '—'}</p>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
            <p class="text-xs text-neutral-500 mb-1">Requested</p>
            <p class="text-sm font-medium text-neutral-800">${correction.requested_value ? formatTime(correction.requested_value) : '—'}</p>
          </div>
        </div>
        <div class="p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500 mb-1">Reason</p>
          <p class="text-sm text-neutral-700 leading-relaxed">${correction.reason || '—'}</p>
        </div>
      </div>
    `;
  }

  return '<p class="text-sm text-neutral-500">Details unavailable.</p>';
}

async function processApprovalFromNotification(approval, status, comments = null) {
  const { data: authData } = await supabase.auth.getUser();
  const reviewerId = authData?.user?.id || approval.supervisor_id || null;

  const { error: approvalError } = await supabase
    .from('approvals')
    .update({
      status,
      comments: comments || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', approval.id);

  if (approvalError) throw new Error(approvalError.message);

  if (approval.type === 'attendance') {
    const { error } = await supabase
      .from('attendance_records')
      .update({
        status,
        rejection_reason: status === 'rejected' ? comments : null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', approval.entity_id);

    if (error) throw new Error(error.message);
  } else if (approval.type === 'narrative') {
    const { error } = await supabase
      .from('narratives')
      .update({
        status,
        rejection_reason: status === 'rejected' ? comments : null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
      })
      .eq('id', approval.entity_id);

    if (error) throw new Error(error.message);
  } else if (approval.type === 'task_status') {
    if (status === 'approved') {
      const { data: task } = await supabase
        .from('tasks')
        .select('pending_status')
        .eq('id', approval.entity_id)
        .single();

      if (task?.pending_status) {
        const { error } = await supabase
          .from('tasks')
          .update({ status: task.pending_status, pending_status: null })
          .eq('id', approval.entity_id);

        if (error) throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from('tasks')
        .update({ pending_status: null })
        .eq('id', approval.entity_id);

      if (error) throw new Error(error.message);
    }
  } else if (approval.type === 'task_submission') {
    if (status === 'approved') {
      const { error } = await supabase
        .from('tasks')
        .update({ status: 'in_progress', submission_status: 'approved' })
        .eq('id', approval.entity_id);

      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from('tasks')
        .update({ submission_status: 'rejected' })
        .eq('id', approval.entity_id);

      if (error) throw new Error(error.message);
    }
  } else if (approval.type === 'attendance_correction') {
    if (status === 'approved') {
      const { data: correction } = await supabase
        .from('attendance_corrections')
        .select('*')
        .eq('id', approval.entity_id)
        .single();

      if (correction) {
        const { error: recError } = await supabase
          .from('attendance_records')
          .update({ [correction.punch_type]: correction.requested_value })
          .eq('id', correction.attendance_id);

        if (recError) throw new Error(recError.message);

        const { error: corrError } = await supabase
          .from('attendance_corrections')
          .update({
            status: 'approved',
            reviewed_by: reviewerId,
            reviewed_at: new Date().toISOString(),
          })
          .eq('id', correction.id);

        if (corrError) throw new Error(corrError.message);
      }
    } else {
      const { error } = await supabase
        .from('attendance_corrections')
        .update({
          status: 'rejected',
          review_comment: comments,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', approval.entity_id);

      if (error) throw new Error(error.message);
    }
  }

  const notificationTitle = `${approval.type.replace('_', ' ')} ${status}`;
  const notificationMessage = status === 'approved'
    ? `Your ${approval.type.replace('_', ' ')} has been approved.`
    : `Your ${approval.type.replace('_', ' ')} was rejected. Reason: ${comments || 'No reason provided'}`;

  await supabase.from('notifications').insert({
    user_id: approval.intern_id,
    type: 'approval_result',
    title: notificationTitle,
    message: notificationMessage,
    entity_type: approval.type,
    entity_id: approval.entity_id,
  });

  // Send email notification
  const { data: internData } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', approval.intern_id)
    .single();

  if (internData?.email) {
    const emailHtml = getApprovalResultTemplate(approval.type, status, comments);
    // Fire-and-forget: don't block UI waiting for email
    sendEmailNotification(
      internData.email,
      notificationTitle,
      emailHtml
    ).catch(err => console.error('Failed to send approval email:', err));
  }

  await logAudit(`approval.${status}`, 'approval', approval.id, {
    type: approval.type,
    entity_id: approval.entity_id,
    comments,
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderNotifItem(n) {
  const category = getTypeLabel(n);
  const isRead = !!n.is_read;
  const itemStyle = isRead
    ? 'background: var(--color-neutral-50); border-color: transparent; opacity: 0.75;'
    : 'background: #ffffff; border-color: var(--color-neutral-200); box-shadow: 0 1px 3px rgba(0,0,0,0.05);';

  return `
    <div class="notification-item border rounded-xl p-4 flex gap-3.5 cursor-pointer hover:border-primary-200 transition-all"
         style="${itemStyle}"
         data-id="${n.id}"
         data-read="${isRead}"
         data-type="${n.type || ''}"
         data-type-label="${category}"
         data-entity-id="${n.entity_id || ''}">
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
          ${getTypeBadge(category)}
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

function getTypeLabel(notification) {
  const type = notification?.type || '';
  const entityType = notification?.entity_type || '';

  if (type === 'pending_approval' || type === 'approval_result') return 'Approval';
  if (type === 'ojt_completed') return 'OJT';
  if (type === 'escalation') return 'Escalation';
  if (type?.includes('allowance') || entityType?.includes('allowance')) return 'Allowance';
  if (type?.includes('attendance') || entityType?.includes('attendance')) return 'Attendance';
  if (type?.includes('narrative') || entityType?.includes('narrative')) return 'Narrative';
  if (type?.includes('task') || entityType?.includes('task')) return 'Task';

  return 'System';
}

function getTypeBadge(label) {
  const colorMap = {
    Attendance: 'bg-primary-50 text-primary-700',
    Task: 'bg-warning-50 text-warning-700',
    Approval: 'bg-primary-50 text-primary-700',
    Narrative: 'bg-success-50 text-success-700',
    Allowance: 'bg-success-50 text-success-700',
    Correction: 'bg-warning-50 text-warning-700',
    Escalation: 'bg-danger-50 text-danger-600',
    OJT: 'bg-success-50 text-success-700',
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
    ojt_completed: 'bg-success-50 text-success-600',
  };
  return map[type] || 'bg-neutral-100 text-neutral-500';
}

function getNotifIcon(type) {
  if (type === 'ojt_completed') return icons.approval;
  if (type?.includes('attendance')) return icons.clock;
  if (type?.includes('task')) return icons.tasks;
  if (type?.includes('narrative')) return icons.narrative;
  if (type?.includes('allowance')) return icons.money;
  if (type?.includes('escalation')) return icons.alert;
  return icons.bell;
}
