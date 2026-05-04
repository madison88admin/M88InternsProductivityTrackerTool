/**
 * Approvals Page (Supervisor/Admin view)
 * Review and approve/reject attendance, narratives, task status changes, and corrections.
 */
import { getProfile, getUserRole } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatTime, formatDateTime, formatHoursDisplay, getTodayDate, calculateSessionHours } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { sendEmailNotification, getApprovalResultTemplate } from '../lib/email-notifications.js';

let approvalsPanelMode = 'list';
let deptApprovalsPanelMode = 'list';

export async function renderApprovalsPage() {
  const profile = getProfile();
  const role = getUserRole();
  const isAdmin = role === 'admin';

  let pendingQuery = supabase
    .from('approvals')
    .select('*, intern:profiles!approvals_intern_id_fkey(full_name, email, department_id, departments(name)), reviewer:profiles!approvals_reviewed_by_fkey(full_name, email)')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  let reviewedQuery = supabase
    .from('approvals')
    .select('*, intern:profiles!approvals_intern_id_fkey(full_name, email, department_id, departments(name)), reviewer:profiles!approvals_reviewed_by_fkey(full_name, email)')
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!isAdmin) {
    if (profile.department_id) {
      // Show approvals for all supervisors in the same department
      const { data: deptSups } = await supabase
        .from('profiles')
        .select('id')
        .eq('department_id', profile.department_id)
        .eq('role', 'supervisor');
      const deptSupervisorIds = (deptSups || []).map(s => s.id);
      if (!deptSupervisorIds.includes(profile.id)) deptSupervisorIds.push(profile.id);
      pendingQuery = pendingQuery.in('supervisor_id', deptSupervisorIds);
      reviewedQuery = reviewedQuery.in('supervisor_id', deptSupervisorIds);
    } else {
      pendingQuery = pendingQuery.eq('supervisor_id', profile.id);
      reviewedQuery = reviewedQuery.eq('supervisor_id', profile.id);
    }
  }

  const [pendingRes, reviewedRes] = await Promise.all([pendingQuery, reviewedQuery]);
  const allPendingApprovals = pendingRes.data || [];
  const reviewedApprovals = reviewedRes.data || [];
  const approvals = [...allPendingApprovals, ...reviewedApprovals];
  
  // For admins with departments, separate into department and other approvals
  let pendingApprovals = allPendingApprovals;
  let deptPendingApprovals = [];
  
  if (isAdmin && profile.department_id) {
    deptPendingApprovals = allPendingApprovals.filter(a => a.intern?.department_id === profile.department_id);
    pendingApprovals = allPendingApprovals.filter(a => a.intern?.department_id !== profile.department_id);
  }
  
  const actionablePendingCount = allPendingApprovals.filter(a => isAdmin || a.type !== 'attendance_correction').length;
  const actionableDeptPendingCount = deptPendingApprovals.filter(a => a.type !== 'attendance_correction').length;
  const isDailyApprovalType = (type) => type === 'attendance' || type === 'narrative';
  const deptPendingDailyApprovals = deptPendingApprovals.filter(a => isDailyApprovalType(a.type));
  const deptPendingOtherApprovals = deptPendingApprovals.filter(a => !isDailyApprovalType(a.type));
  const pendingDailyApprovals = pendingApprovals.filter(a => isDailyApprovalType(a.type));
  const pendingOtherApprovals = pendingApprovals.filter(a => !isDailyApprovalType(a.type));
  const deptPendingSummaryBuckets = deptApprovalsPanelMode === 'summary'
    ? await buildPendingDaySummaries(deptPendingDailyApprovals)
    : [];
  const pendingSummaryBuckets = approvalsPanelMode === 'summary'
    ? await buildPendingDaySummaries(pendingDailyApprovals)
    : [];

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Approvals</h1>
      <p class="page-subtitle">Review and manage submissions</p>
    </div>

    ${isAdmin && profile.department_id && deptPendingApprovals.length > 0 ? `
    <!-- Department Pending Approvals (For Admins with Department) -->
    <div class="card mb-6 border-l-4 border-l-primary-600">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">Pending - My Department (${deptPendingApprovals.length})</h3>
        <div class="flex gap-3 items-center">
          <div class="filter-tabs mb-0!">
            <button type="button" class="filter-tab approvals-panel-toggle ${deptApprovalsPanelMode === 'list' ? 'active' : ''}" data-panel="dept" data-mode="list">List View</button>
            <button type="button" class="filter-tab approvals-panel-toggle ${deptApprovalsPanelMode === 'summary' ? 'active' : ''}" data-panel="dept" data-mode="summary">Day Summary</button>
          </div>
          <select id="dept-pending-sort" class="form-input py-2 px-3 text-sm min-w-max">
            <option value="date-desc">Sort: Newest First</option>
            <option value="date-asc">Sort: Oldest First</option>
            <option value="intern-asc">Sort: Intern A-Z</option>
            <option value="type">Sort: By Type</option>
          </select>
          ${deptApprovalsPanelMode === 'list' && actionableDeptPendingCount > 0 ? `
            <button id="bulk-approve-dept-btn" class="btn-sm btn-success">
              ${icons.check} Approve All (${actionableDeptPendingCount})
            </button>
          ` : ''}
        </div>
      </div>

      ${deptApprovalsPanelMode === 'summary' ? `
        <div class="space-y-4" id="dept-pending-approvals-container">
          ${deptPendingSummaryBuckets.length > 0 ? deptPendingSummaryBuckets.map(bucket => renderPendingSummaryCard(bucket)).join('') : `
            <div class="text-center py-8 text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
              <p>No daily attendance or narrative approvals to summarize</p>
            </div>
          `}
          ${deptPendingOtherApprovals.length > 0 ? `
            <div class="pt-2 border-t border-neutral-200">
              <h4 class="text-sm font-semibold text-neutral-700 mb-3">Other Pending Items</h4>
              <div class="space-y-3">
                ${deptPendingOtherApprovals.map(a => renderApprovalCard(a, isAdmin)).join('')}
              </div>
            </div>
          ` : ''}
        </div>
      ` : `
        <div class="space-y-3" id="dept-pending-approvals-container">
          ${deptPendingApprovals.map(a => renderApprovalCard(a, isAdmin)).join('')}
        </div>
      `}
    </div>
    ` : ''}

    <!-- Pending Approvals -->
    <div class="card mb-6 ${isAdmin && profile.department_id ? 'border-l-4 border-l-neutral-300' : ''}">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">${approvalsPanelMode === 'summary' ? 'Day Summary' : (isAdmin && profile.department_id ? 'Other Pending' : 'Pending')} (${pendingApprovals.length})</h3>
        <div class="flex gap-3 items-center">
          <div class="filter-tabs mb-0!">
            <button type="button" class="filter-tab approvals-panel-toggle ${approvalsPanelMode === 'list' ? 'active' : ''}" data-panel="main" data-mode="list">List View</button>
            <button type="button" class="filter-tab approvals-panel-toggle ${approvalsPanelMode === 'summary' ? 'active' : ''}" data-panel="main" data-mode="summary">Day Summary</button>
          </div>
          <select id="pending-sort" class="form-input py-2 px-3 text-sm min-w-max">
            <option value="date-desc">Sort: Newest First</option>
            <option value="date-asc">Sort: Oldest First</option>
            <option value="intern-asc">Sort: Intern A-Z</option>
            <option value="type">Sort: By Type</option>
          </select>
          ${approvalsPanelMode === 'list' && pendingApprovals.length > 0 && (actionablePendingCount - actionableDeptPendingCount) > 0 ? `
            <button id="bulk-approve-btn" class="btn-sm btn-success">
              ${icons.check} Approve All (${actionablePendingCount - actionableDeptPendingCount})
            </button>
          ` : ''}
        </div>
      </div>

      ${pendingApprovals.length > 0 ? `
        ${approvalsPanelMode === 'summary' ? `
          <div class="space-y-4" id="pending-approvals-container">
            ${pendingSummaryBuckets.length > 0 ? pendingSummaryBuckets.map(bucket => renderPendingSummaryCard(bucket)).join('') : `
              <div class="text-center py-8 text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
                <p>No daily attendance or narrative approvals to summarize</p>
              </div>
            `}
            ${pendingOtherApprovals.length > 0 ? `
              <div class="pt-2 border-t border-neutral-200">
                <h4 class="text-sm font-semibold text-neutral-700 mb-3">Other Pending Items</h4>
                <div class="space-y-3">
                  ${pendingOtherApprovals.map(a => renderApprovalCard(a, isAdmin)).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="space-y-3" id="pending-approvals-container">
            ${pendingApprovals.map(a => renderApprovalCard(a, isAdmin)).join('')}
          </div>
        `}
      ` : `
        <div class="text-center py-8 text-neutral-400">
          <p>${isAdmin && profile.department_id ? 'No other pending approvals' : 'No pending approvals'}</p>
        </div>
      `}
    </div>

    <!-- Reviewed Approvals -->
    <div class="card">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">Review History</h3>
        <div class="text-sm text-neutral-500">Total: ${reviewedApprovals.length}</div>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div>
          <input type="text" id="history-search" class="form-input w-full" placeholder="Search by intern or type..." />
        </div>
        <div>
          <select id="history-status-filter" class="form-input w-full">
            <option value="">All Statuses</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div>
          <select id="history-type-filter" class="form-input w-full">
            <option value="">All Types</option>
            <option value="attendance">Attendance</option>
            <option value="narrative">Narrative</option>
            <option value="task_status">Task Status</option>
            <option value="task_submission">Task Submission</option>
            <option value="attendance_correction">Attendance Correction</option>
          </select>
        </div>
        <div>
          <select id="history-sort" class="form-input w-full">
            <option value="date-desc">Sort: Newest First</option>
            <option value="date-asc">Sort: Oldest First</option>
            <option value="intern-asc">Sort: Intern A-Z</option>
            <option value="status">Sort: By Status</option>
            <option value="type">Sort: By Type</option>
          </select>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="data-table">
          <thead>
            <tr>
              <th>Type</th>
              <th>Intern</th>
              <th>Status</th>
              <th>Comments</th>
              <th>Submitted</th>
              <th>Reviewed</th>
              <th>Approved By</th>
            </tr>
          </thead>
          <tbody id="history-table-body">
            ${reviewedApprovals.slice(0, 50).map(a => `
              <tr>
                <td><span class="badge-info">${a.type.replace('_', ' ')}</span></td>
                <td>${a.intern?.full_name || '—'}</td>
                <td>
                  <span class="badge-${a.status === 'approved' ? 'approved' : 'rejected'}">
                    ${a.status}
                  </span>
                </td>
                <td class="max-w-xs truncate">${a.comments || '—'}</td>
                <td>${formatDate(a.submitted_at)}</td>
                <td>${a.reviewed_at ? formatDateTime(a.reviewed_at) : '—'}</td>
                <td>${a.status === 'approved' ? (a.reviewer?.full_name || '—') : '—'}</td>
              </tr>
            `).join('')}
            ${reviewedApprovals.length === 0 ? '<tr><td colspan="7" class="text-center text-neutral-400 py-8">No review history</td></tr>' : ''}
          </tbody>
        </table>
      </div>
      <div class="text-xs text-neutral-400 mt-2">Showing up to 50 most recent records</div>
    </div>
  `, (el) => {
    const summaryBucketMap = new Map([
      ...deptPendingSummaryBuckets.map(bucket => [bucket.key, bucket]),
      ...pendingSummaryBuckets.map(bucket => [bucket.key, bucket]),
    ]);

    // Sorting function
    function sortApprovals(approvalsToSort, sortBy) {
      const sorted = [...approvalsToSort];
      
      switch(sortBy) {
        case 'date-asc':
          return sorted.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
        case 'intern-asc':
          return sorted.sort((a, b) => (a.intern?.full_name || '').localeCompare(b.intern?.full_name || ''));
        case 'type':
          return sorted.sort((a, b) => a.type.localeCompare(b.type));
        case 'date-desc':
        default:
          return sorted.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      }
    }

    function sortSummaryBuckets(summariesToSort, sortBy) {
      const sorted = [...summariesToSort];

      switch (sortBy) {
        case 'date-asc':
          return sorted.sort((a, b) => a.date.localeCompare(b.date));
        case 'intern-asc':
          return sorted.sort((a, b) => (a.internName || '').localeCompare(b.internName || ''));
        case 'type':
          return sorted.sort((a, b) => b.totalPendingCount - a.totalPendingCount);
        case 'date-desc':
        default:
          return sorted.sort((a, b) => b.date.localeCompare(a.date));
      }
    }

    function renderSummaryContainer(sortedSummaries, otherApprovals = pendingOtherApprovals) {
      const summaryHtml = sortedSummaries.length > 0
        ? sortedSummaries.map(bucket => renderPendingSummaryCard(bucket)).join('')
        : `
          <div class="text-center py-8 text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
            <p>No daily attendance or narrative approvals to summarize</p>
          </div>
        `;

      const otherPendingHtml = otherApprovals.length > 0
        ? `
          <div class="pt-2 border-t border-neutral-200">
            <h4 class="text-sm font-semibold text-neutral-700 mb-3">Other Pending Items</h4>
            <div class="space-y-3">
              ${otherApprovals.map(a => renderApprovalCard(a, isAdmin)).join('')}
            </div>
          </div>
        `
        : '';

      return summaryHtml + otherPendingHtml;
    }

    // Attach event listeners to approval buttons
    function attachApprovalListeners(container) {
      container.querySelectorAll('.approve-btn').forEach(btn => {
        btn.addEventListener('click', () => handleApproval(btn.dataset.approvalId, 'approved', approvals));
      });
      container.querySelectorAll('.reject-btn').forEach(btn => {
        btn.addEventListener('click', () => openRejectModal(btn.dataset.approvalId, approvals));
      });
      container.querySelectorAll('.view-details-btn').forEach(btn => {
        btn.addEventListener('click', () => viewApprovalDetails(btn.dataset.approvalId, approvals));
      });
      container.querySelectorAll('.review-task-btn').forEach(btn => {
        btn.addEventListener('click', () => openTaskSubmissionReviewModal(btn.dataset.approvalId, approvals));
      });
      container.querySelectorAll('.pending-day-details-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const summary = summaryBucketMap.get(btn.dataset.summaryKey);
          if (summary) openDailySummaryModal(summary, approvals);
        });
      });
      container.querySelectorAll('.pending-day-approve-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const summary = summaryBucketMap.get(btn.dataset.summaryKey);
          if (summary) approveDailySummary(summary, approvals, el);
        });
      });
    }

    el.querySelectorAll('.approvals-panel-toggle').forEach(btn => {
      btn.addEventListener('click', async () => {
        const panelScope = btn.dataset.panel || 'main';
        const nextMode = btn.dataset.mode || 'list';
        if (panelScope === 'dept') {
          if (nextMode === deptApprovalsPanelMode) return;
          deptApprovalsPanelMode = nextMode;
        } else {
          if (nextMode === approvalsPanelMode) return;
          approvalsPanelMode = nextMode;
        }
        await renderApprovalsPage();
      });
    });

    // Department pending sort handler
    el.querySelector('#dept-pending-sort')?.addEventListener('change', (e) => {
      const container = el.querySelector('#dept-pending-approvals-container');
      if (container) {
        if (deptApprovalsPanelMode === 'summary') {
          const sortedSummaries = sortSummaryBuckets(deptPendingSummaryBuckets, e.target.value);
          container.innerHTML = renderSummaryContainer(sortedSummaries, deptPendingOtherApprovals);
        } else {
          const sorted = sortApprovals(deptPendingApprovals, e.target.value);
          container.innerHTML = sorted.map(a => renderApprovalCard(a, isAdmin)).join('');
        }
        attachApprovalListeners(container);
      }
    });

    // Other pending sort handler
    el.querySelector('#pending-sort')?.addEventListener('change', (e) => {
      const container = el.querySelector('#pending-approvals-container');
      if (container) {
        if (approvalsPanelMode === 'summary') {
          const sortedSummaries = sortSummaryBuckets(pendingSummaryBuckets, e.target.value);
          container.innerHTML = renderSummaryContainer(sortedSummaries);
        } else {
          const sorted = sortApprovals(pendingApprovals, e.target.value);
          container.innerHTML = sorted.map(a => renderApprovalCard(a, isAdmin)).join('');
        }
        attachApprovalListeners(container);
      }
    });

    // Initial event listeners for approval buttons
    attachApprovalListeners(el);

    // Bulk approve for department approvals
    el.querySelector('#bulk-approve-dept-btn')?.addEventListener('click', async () => {
      // Get all actionable pending approvals (exclude attendance_correction for non-admins)
      const actionablePending = deptPendingApprovals.filter(a =>
        a.type !== 'attendance_correction'
      );

      if (actionablePending.length === 0) {
        showToast('No pending approvals to process', 'info');
        return;
      }

      // Confirm before bulk action
      if (!confirm(`Are you sure you want to approve all ${actionablePending.length} pending item(s) in your department?`)) {
        return;
      }

      const btn = el.querySelector('#bulk-approve-dept-btn');
      btn.disabled = true;
      btn.innerHTML = `${icons.check} Approving...`;

      const results = await Promise.allSettled(
        actionablePending.map(approval => processApproval(approval.id, 'approved', 'Bulk approved', approval))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failedCount = results.length - successCount;

      if (failedCount === 0) {
        showToast(`${successCount} items approved`, 'success');
      } else {
        showToast(`${successCount} approved, ${failedCount} failed`, successCount > 0 ? 'info' : 'error');
      }
      renderApprovalsPage();
    });

    // Bulk approve for other approvals
    el.querySelector('#bulk-approve-btn')?.addEventListener('click', async () => {
      // Get all actionable pending approvals
      const actionablePending = pendingApprovals.filter(a =>
        isAdmin || a.type !== 'attendance_correction'
      );

      if (actionablePending.length === 0) {
        showToast('No pending approvals to process', 'info');
        return;
      }

      // Confirm before bulk action
      if (!confirm(`Are you sure you want to approve all ${actionablePending.length} pending item(s)?`)) {
        return;
      }

      const btn = el.querySelector('#bulk-approve-btn');
      btn.disabled = true;
      btn.innerHTML = `${icons.check} Approving...`;

      const results = await Promise.allSettled(
        actionablePending.map(approval => processApproval(approval.id, 'approved', 'Bulk approved', approval))
      );

      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failedCount = results.length - successCount;

      if (failedCount === 0) {
        showToast(`${successCount} items approved`, 'success');
      } else {
        showToast(`${successCount} approved, ${failedCount} failed`, successCount > 0 ? 'info' : 'error');
      }
      renderApprovalsPage();
    });

    // Review History filtering and sorting
    function updateHistoryTable() {
      let filteredApprovals = [...reviewedApprovals.slice(0, 50)];
      const searchTerm = el.querySelector('#history-search')?.value.toLowerCase() || '';
      const statusFilter = el.querySelector('#history-status-filter')?.value || '';
      const typeFilter = el.querySelector('#history-type-filter')?.value || '';
      const sortBy = el.querySelector('#history-sort')?.value || 'date-desc';

      // Apply filters
      if (searchTerm) {
        filteredApprovals = filteredApprovals.filter(a =>
          (a.intern?.full_name || '').toLowerCase().includes(searchTerm) ||
          a.type.toLowerCase().includes(searchTerm)
        );
      }

      if (statusFilter) {
        filteredApprovals = filteredApprovals.filter(a => a.status === statusFilter);
      }

      if (typeFilter) {
        filteredApprovals = filteredApprovals.filter(a => a.type === typeFilter);
      }

      // Apply sorting
      const sorted = [...filteredApprovals];
      switch(sortBy) {
        case 'date-asc':
          sorted.sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
          break;
        case 'intern-asc':
          sorted.sort((a, b) => (a.intern?.full_name || '').localeCompare(b.intern?.full_name || ''));
          break;
        case 'status':
          sorted.sort((a, b) => a.status.localeCompare(b.status));
          break;
        case 'type':
          sorted.sort((a, b) => a.type.localeCompare(b.type));
          break;
        case 'date-desc':
        default:
          sorted.sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
      }

      // Update table
      const tableBody = el.querySelector('#history-table-body');
      if (tableBody) {
        if (sorted.length === 0) {
          tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-neutral-400 py-8">No records match your filters</td></tr>';
        } else {
          tableBody.innerHTML = sorted.map(a => `
            <tr>
              <td><span class="badge-info">${a.type.replace('_', ' ')}</span></td>
              <td>${a.intern?.full_name || '—'}</td>
              <td>
                <span class="badge-${a.status === 'approved' ? 'approved' : 'rejected'}">
                  ${a.status}
                </span>
              </td>
              <td class="max-w-xs truncate">${a.comments || '—'}</td>
              <td>${formatDate(a.submitted_at)}</td>
              <td>${a.reviewed_at ? formatDateTime(a.reviewed_at) : '—'}</td>
              <td>${a.status === 'approved' ? (a.reviewer?.full_name || '—') : '—'}</td>
            </tr>
          `).join('');
        }
      }
    }

    // Attach history filter event listeners
    el.querySelector('#history-search')?.addEventListener('input', updateHistoryTable);
    el.querySelector('#history-status-filter')?.addEventListener('change', updateHistoryTable);
    el.querySelector('#history-type-filter')?.addEventListener('change', updateHistoryTable);
    el.querySelector('#history-sort')?.addEventListener('change', updateHistoryTable);
  }, '/approvals');
}

function renderApprovalCard(approval, isAdmin = false) {
  const canActOnCorrection = isAdmin || approval.type !== 'attendance_correction';
  return `
    <div class="border border-neutral-200 rounded-lg p-4 hover:bg-neutral-50 transition-colors">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge-info">${approval.type.replace('_', ' ')}</span>
            <span class="font-medium text-neutral-900">${approval.intern?.full_name || 'Unknown'}</span>
            ${approval.is_escalated ? '<span class="badge-rejected">Escalated</span>' : ''}
            ${approval.type === 'attendance_correction' && !isAdmin ? '<span class="text-xs text-neutral-400 italic">Admin approval required</span>' : ''}
          </div>
          <p class="text-sm text-neutral-500">
            Submitted ${formatDateTime(approval.submitted_at)}
            ${approval.comments ? ` — "${approval.comments}"` : ''}
          </p>
        </div>
        <div class="flex gap-2">
          <button class="btn-sm btn-secondary view-details-btn" data-approval-id="${approval.id}" title="View Details">
            ${icons.eye}
          </button>
          ${approval.type === 'task_submission' ? `
            <button class="btn-sm btn-primary review-task-btn" data-approval-id="${approval.id}" title="Review & Edit Task">
              ${icons.edit} <span class="ml-1">Review</span>
            </button>
          ` : canActOnCorrection ? `
            <button class="btn-sm btn-success approve-btn" data-approval-id="${approval.id}" title="Approve">
              ${icons.check}
            </button>
            <button class="btn-sm btn-danger reject-btn" data-approval-id="${approval.id}" title="Reject">
              ${icons.x}
            </button>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

async function buildPendingDaySummaries(approvals) {
  const dailyApprovals = approvals.filter(a => a.type === 'attendance' || a.type === 'narrative');
  if (dailyApprovals.length === 0) return [];

  const attendanceIds = dailyApprovals
    .filter(a => a.type === 'attendance')
    .map(a => a.entity_id);
  const narrativeIds = dailyApprovals
    .filter(a => a.type === 'narrative')
    .map(a => a.entity_id);

  const [attendanceRes, narrativeRes] = await Promise.all([
    attendanceIds.length > 0
      ? supabase.from('attendance_records').select('id, intern_id, date').in('id', attendanceIds)
      : Promise.resolve({ data: [] }),
    narrativeIds.length > 0
      ? supabase.from('narratives').select('id, intern_id, date, session').in('id', narrativeIds)
      : Promise.resolve({ data: [] }),
  ]);

  const attendanceById = new Map((attendanceRes.data || []).map(record => [record.id, record]));
  const narrativeById = new Map((narrativeRes.data || []).map(record => [record.id, record]));
  const summaryMap = new Map();

  for (const approval of dailyApprovals) {
    const relatedRecord = approval.type === 'attendance'
      ? attendanceById.get(approval.entity_id)
      : narrativeById.get(approval.entity_id);

    if (!relatedRecord?.date) continue;

    const key = `${approval.intern_id}::${relatedRecord.date}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        key,
        internId: approval.intern_id,
        internName: approval.intern?.full_name || 'Unknown',
        internEmail: approval.intern?.email || '',
        departmentName: approval.intern?.departments?.name || '',
        date: relatedRecord.date,
        pendingApprovalIds: [],
        attendanceApprovalId: null,
        morningNarrativeApprovalId: null,
        afternoonNarrativeApprovalId: null,
        totalPendingCount: 0,
      });
    }

    const summary = summaryMap.get(key);
    summary.pendingApprovalIds.push(approval.id);
    summary.totalPendingCount += 1;

    if (approval.type === 'attendance') {
      summary.attendanceApprovalId = approval.id;
    } else if (relatedRecord.session === 'morning') {
      summary.morningNarrativeApprovalId = approval.id;
    } else if (relatedRecord.session === 'afternoon') {
      summary.afternoonNarrativeApprovalId = approval.id;
    }
  }

  return [...summaryMap.values()].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) return dateCompare;
    return (a.internName || '').localeCompare(b.internName || '');
  });
}

function renderPendingSummaryCard(summary) {
  const hasAttendance = Boolean(summary.attendanceApprovalId);
  const hasMorning = Boolean(summary.morningNarrativeApprovalId);
  const hasAfternoon = Boolean(summary.afternoonNarrativeApprovalId);

  const chipClass = 'px-3 py-2 rounded-lg border border-neutral-200 bg-neutral-50 text-left';

  return `
    <div class="border border-neutral-200 rounded-lg p-4 hover:bg-neutral-50 transition-colors">
      <div class="flex items-center justify-between gap-4 mb-3">
        <div>
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <span class="badge-info">Day Summary</span>
            <span class="font-medium text-neutral-900">${summary.internName}</span>
            ${summary.departmentName ? `<span class="text-xs text-neutral-400">${summary.departmentName}</span>` : ''}
          </div>
          <p class="text-sm text-neutral-500">${formatDate(summary.date)} · ${summary.totalPendingCount} pending item(s)</p>
        </div>
        <div class="flex gap-2">
          <button class="btn-sm btn-secondary pending-day-details-btn" data-summary-key="${summary.key}" title="View Day Summary">
            ${icons.eye}
          </button>
          ${summary.totalPendingCount > 0 ? `
            <button class="btn-sm btn-success pending-day-approve-btn" data-summary-key="${summary.key}" title="Approve All Pending for This Day">
              ${icons.check}
            </button>
          ` : ''}
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="${chipClass}">
          <p class="text-xs text-neutral-500 mb-1">Attendance</p>
          <p class="text-sm font-semibold ${hasAttendance ? 'text-warning-700' : 'text-neutral-400'}">${hasAttendance ? 'Pending review' : 'No pending attendance'}</p>
        </div>
        <div class="${chipClass}">
          <p class="text-xs text-neutral-500 mb-1">Morning Narrative</p>
          <p class="text-sm font-semibold ${hasMorning ? 'text-warning-700' : 'text-neutral-400'}">${hasMorning ? 'Pending review' : 'No pending narrative'}</p>
        </div>
        <div class="${chipClass}">
          <p class="text-xs text-neutral-500 mb-1">Afternoon Narrative</p>
          <p class="text-sm font-semibold ${hasAfternoon ? 'text-warning-700' : 'text-neutral-400'}">${hasAfternoon ? 'Pending review' : 'No pending narrative'}</p>
        </div>
      </div>
    </div>
  `;
}

function resolveNarrativeHours(narrative, attendanceRecord = null) {
  if (!narrative) return null;
  const narrativeHours = narrative.hours !== null && narrative.hours !== undefined
    ? Number(narrative.hours)
    : null;

  let attendanceHours = null;

  if (attendanceRecord) {
    if (narrative.session === 'morning') {
      if (attendanceRecord.time_in_1 && attendanceRecord.time_out_1) {
        attendanceHours = calculateSessionHours(attendanceRecord.time_in_1, attendanceRecord.time_out_1);
      }
    } else if (narrative.session === 'afternoon') {
      if (attendanceRecord.time_in_2 && attendanceRecord.time_out_2) {
        attendanceHours = calculateSessionHours(attendanceRecord.time_in_2, attendanceRecord.time_out_2);
      }
    }
  }

  if (Number.isFinite(narrativeHours) && narrativeHours > 0) return narrativeHours;
  if (Number.isFinite(attendanceHours) && attendanceHours > 0) return attendanceHours;
  if (Number.isFinite(narrativeHours)) return narrativeHours;
  if (Number.isFinite(attendanceHours)) return attendanceHours;

  return null;
}

async function openDailySummaryModal(summary, approvals) {
  const approvalMap = new Map(approvals.map(approval => [approval.id, approval]));

  createModal(`${summary.internName} - ${formatDate(summary.date)}`, `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
        <p class="text-sm text-neutral-500">Loading day summary...</p>
      </div>
    </div>
  `, async (el, close) => {
    const [attendanceRes, narrativesRes] = await Promise.all([
      supabase
        .from('attendance_records')
        .select('*')
        .eq('intern_id', summary.internId)
        .eq('date', summary.date)
        .maybeSingle(),
      supabase
        .from('narratives')
        .select('*, task:tasks(title)')
        .eq('intern_id', summary.internId)
        .eq('date', summary.date)
        .order('session', { ascending: true }),
    ]);

    const attendance = attendanceRes.data || null;
    const narratives = narrativesRes.data || [];
    const morningNarrative = narratives.find(narrative => narrative.session === 'morning') || null;
    const afternoonNarrative = narratives.find(narrative => narrative.session === 'afternoon') || null;

    const attendancePending = summary.attendanceApprovalId ? approvalMap.get(summary.attendanceApprovalId) : null;
    const morningPending = summary.morningNarrativeApprovalId ? approvalMap.get(summary.morningNarrativeApprovalId) : null;
    const afternoonPending = summary.afternoonNarrativeApprovalId ? approvalMap.get(summary.afternoonNarrativeApprovalId) : null;

    const renderSection = (title, record, pendingApproval, bodyHtml) => `
      <div class="border border-neutral-200 rounded-xl p-4 ${pendingApproval ? 'bg-warning-50/30' : 'bg-neutral-50'}">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div>
            <p class="text-sm font-semibold text-neutral-900">${title}</p>
            ${pendingApproval ? `<p class="text-xs text-warning-700">Pending approval</p>` : `<p class="text-xs text-neutral-400">No pending approval</p>`}
          </div>
          <span class="badge-${record ? (record.status === 'approved' ? 'approved' : record.status === 'rejected' ? 'rejected' : 'pending') : 'pending'}">
            ${record ? record.status : 'missing'}
          </span>
        </div>
        ${bodyHtml}
      </div>
    `;

    const attendanceBody = attendance ? `
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 bg-white rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500">Morning In</p>
          <p class="font-medium">${attendance.time_in_1 ? formatTime(attendance.time_in_1) : '—'}</p>
        </div>
        <div class="p-3 bg-white rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500">Lunch Out</p>
          <p class="font-medium">${attendance.time_out_1 ? formatTime(attendance.time_out_1) : '—'}</p>
        </div>
        <div class="p-3 bg-white rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500">Afternoon In</p>
          <p class="font-medium">${attendance.time_in_2 ? formatTime(attendance.time_in_2) : '—'}</p>
        </div>
        <div class="p-3 bg-white rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500">End of Day</p>
          <p class="font-medium">${attendance.time_out_2 ? formatTime(attendance.time_out_2) : '—'}</p>
        </div>
      </div>
      <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div class="p-3 bg-white rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500">Total Hours</p>
          <p class="font-medium">${formatHoursDisplay(attendance.total_hours || 0)}</p>
        </div>
        <div class="p-3 bg-white rounded-lg border border-neutral-200">
          <p class="text-xs text-neutral-500">Status</p>
          <p class="font-medium capitalize">${attendance.status}</p>
        </div>
      </div>
      ${attendance.is_late ? '<p class="text-xs text-warning-600 mt-3">Late arrival flagged</p>' : ''}
      ${attendance.is_outside_hours ? '<p class="text-xs text-danger-600 mt-1">Outside hours flagged</p>' : ''}
    ` : '<p class="text-sm text-neutral-400">No attendance record found for this day.</p>';

    const narrativeBody = (narrative) => {
      if (!narrative) return '<p class="text-sm text-neutral-400">No narrative found for this session.</p>';

      const displayHours = resolveNarrativeHours(narrative, attendance);

      return `
      <div class="space-y-3">
        ${narrative.task ? `<p class="text-xs text-primary-600 font-medium">Task: ${narrative.task.title}</p>` : ''}
        <div class="prose prose-sm text-neutral-700 text-sm border border-neutral-200 rounded-lg p-3 bg-white">${narrative.content}</div>
        ${displayHours !== null ? `<p class="text-xs text-neutral-400">Hours: ${formatHoursDisplay(displayHours)}</p>` : ''}
        ${narrative.edited_at ? `<p class="text-xs text-info-600">Edited: ${formatDateTime(narrative.edited_at)}</p>` : ''}
        ${narrative.is_late_submission ? '<p class="text-xs text-warning-600">Late submission</p>' : ''}
      </div>
    `;
    };

    const contentHtml = `
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Intern</p>
            <p class="font-medium">${summary.internName}</p>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Date</p>
            <p class="font-medium">${formatDate(summary.date)}</p>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Pending Items</p>
            <p class="font-medium">${summary.totalPendingCount}</p>
          </div>
        </div>

        ${renderSection('Attendance', attendance, attendancePending, attendanceBody)}
        ${renderSection('Morning Narrative', morningNarrative, morningPending, narrativeBody(morningNarrative))}
        ${renderSection('Afternoon Narrative', afternoonNarrative, afternoonPending, narrativeBody(afternoonNarrative))}

        <div class="flex justify-end gap-3 pt-4 border-t border-neutral-200">
          <button id="day-summary-close-btn" class="btn-secondary">Close</button>
          ${summary.totalPendingCount > 0 ? `<button id="day-summary-approve-btn" class="btn-success">${icons.check} Approve All Pending</button>` : ''}
        </div>
      </div>
    `;

    el.querySelector('.modal-body').innerHTML = contentHtml;
    el.querySelector('#day-summary-close-btn')?.addEventListener('click', close);
    el.querySelector('#day-summary-approve-btn')?.addEventListener('click', async () => {
      await approveDailySummary(summary, approvals, el, close);
    });
  });
}

async function approveDailySummary(summary, approvals, container, close) {
  const pendingApprovals = summary.pendingApprovalIds
    .map(approvalId => approvals.find(approval => approval.id === approvalId))
    .filter(Boolean);

  if (pendingApprovals.length === 0) {
    showToast('No pending approvals to process', 'info');
    return;
  }

  if (!confirm(`Approve all ${pendingApprovals.length} pending item(s) for ${summary.internName} on ${formatDate(summary.date)}?`)) {
    return;
  }

  const approveButton = container.querySelector('#day-summary-approve-btn');
  if (approveButton) {
    approveButton.disabled = true;
    approveButton.innerHTML = `${icons.check} Approving...`;
  }

  const results = await Promise.allSettled(
    pendingApprovals.map(approval => processApproval(approval.id, 'approved', 'Approved from day summary', approval))
  );

  const successCount = results.filter(result => result.status === 'fulfilled').length;
  const failedCount = results.length - successCount;

  if (failedCount === 0) {
    showToast(`${successCount} item(s) approved`, 'success');
  } else {
    showToast(`${successCount} approved, ${failedCount} failed`, successCount > 0 ? 'info' : 'error');
  }

  close?.();
  renderApprovalsPage();
}

async function handleApproval(approvalId, status, approvals) {
  const approval = approvals.find(a => a.id === approvalId);
  if (!approval) return;

  try {
    await processApproval(approvalId, status, null, approval);
    showToast(`Item ${status}`, 'success');
    renderApprovalsPage();
  } catch (err) {
    showToast(err.message || `Failed to ${status}`, 'error');
  }
}

function openRejectModal(approvalId, approvals) {
  createModal('Reject Submission', `
    <form id="reject-form" class="space-y-4">
      <div>
        <label class="form-label">Reason for Rejection <span class="text-danger-500">*</span></label>
        <textarea id="reject-reason" class="form-input" rows="3" placeholder="Provide a reason for the rejection..." required></textarea>
      </div>
      <div class="flex justify-end gap-3">
        <button type="button" id="reject-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-danger">Reject</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#reject-cancel').addEventListener('click', close);

    el.querySelector('#reject-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const reason = el.querySelector('#reject-reason').value.trim();
      const approval = approvals.find(a => a.id === approvalId);

      try {
        await processApproval(approvalId, 'rejected', reason, approval);
        showToast('Submission rejected', 'success');
        close();
        renderApprovalsPage();
      } catch (err) {
        showToast(err.message || 'Failed to reject', 'error');
      }
    });
  });
}

async function processApproval(approvalId, status, comments, approval) {
  const { data: authData } = await supabase.auth.getUser();
  const reviewerId = authData?.user?.id || approval?.supervisor_id || null;

  // Update approval record
  const { error: approvalError } = await supabase
    .from('approvals')
    .update({
      status,
      comments: comments || null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewerId,
    })
    .eq('id', approvalId);

  if (approvalError) throw new Error(approvalError.message);

  // Update the underlying entity based on type
  if (approval.type === 'attendance') {
    const { error } = await supabase
      .from('attendance_records')
      .update({
        status,
        rejection_reason: status === 'rejected' ? comments : null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        supervisor_id: status === 'approved' ? reviewerId : approval.supervisor_id,
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
      // Get the task's pending status and apply it
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

  // Build detailed notification title and message based on approval type
  let notificationTitle = '';
  let notificationMessage = '';
  const statusCapitalized = status.charAt(0).toUpperCase() + status.slice(1);
  const reviewerName = approval.reviewer?.full_name || 'A reviewer';

  if (approval.type === 'narrative') {
    // Fetch narrative details for richer message
    const { data: narrative } = await supabase
      .from('narratives')
      .select('session, date')
      .eq('id', approval.entity_id)
      .single();

    const sessionLabel = narrative?.session === 'morning' ? 'Morning' : narrative?.session === 'afternoon' ? 'Afternoon' : '';
    const dateLabel = narrative?.date ? formatDate(narrative.date) : '';

    notificationTitle = `${sessionLabel} Narrative ${statusCapitalized}`;
    if (status === 'approved') {
      notificationMessage = `Your ${sessionLabel.toLowerCase()} narrative for ${dateLabel} has been approved.`;
    } else {
      notificationMessage = `Your ${sessionLabel.toLowerCase()} narrative for ${dateLabel} was rejected. Reason: ${comments || 'No reason provided'}`;
    }
  } else if (approval.type === 'attendance') {
    // Fetch attendance details
    const { data: attendance } = await supabase
      .from('attendance_records')
      .select('date')
      .eq('id', approval.entity_id)
      .single();

    const dateLabel = attendance?.date ? formatDate(attendance.date) : '';

    notificationTitle = `Attendance ${statusCapitalized}`;
    if (status === 'approved') {
      notificationMessage = `Your attendance record for ${dateLabel} has been approved.`;
    } else {
      notificationMessage = `Your attendance record for ${dateLabel} was rejected. Reason: ${comments || 'No reason provided'}`;
    }
  } else if (approval.type === 'task_status' || approval.type === 'task_submission') {
    // Fetch task details
    const { data: task } = await supabase
      .from('tasks')
      .select('title')
      .eq('id', approval.entity_id)
      .single();

    const taskTitle = task?.title || 'your task';
    const typeLabel = approval.type === 'task_status' ? 'Task Status Change' : 'Task Submission';

    notificationTitle = `${typeLabel} ${statusCapitalized}`;
    if (status === 'approved') {
      notificationMessage = `Your ${approval.type === 'task_status' ? 'status change request' : 'task submission'} for "${taskTitle}" has been approved.`;
    } else {
      notificationMessage = `Your ${approval.type === 'task_status' ? 'status change request' : 'task submission'} for "${taskTitle}" was rejected. Reason: ${comments || 'No reason provided'}`;
    }
  } else if (approval.type === 'attendance_correction') {
    // Fetch correction details
    const { data: correction } = await supabase
      .from('attendance_corrections')
      .select('punch_type, attendance:attendance_records!attendance_id(date)')
      .eq('id', approval.entity_id)
      .single();

    const punchLabels = {
      time_in_1: 'Morning Time In',
      time_out_1: 'Lunch Time Out',
      time_in_2: 'Afternoon Time In',
      time_out_2: 'End of Day Time Out',
    };
    const punchLabel = punchLabels[correction?.punch_type] || 'time';
    const dateLabel = correction?.attendance?.date ? formatDate(correction.attendance.date) : '';

    notificationTitle = `Attendance Correction ${statusCapitalized}`;
    if (status === 'approved') {
      notificationMessage = `Your ${punchLabel.toLowerCase()} correction for ${dateLabel} has been approved and applied.`;
    } else {
      notificationMessage = `Your ${punchLabel.toLowerCase()} correction for ${dateLabel} was rejected. Reason: ${comments || 'No reason provided'}`;
    }
  } else {
    // Fallback for unknown types
    notificationTitle = `${approval.type.replace('_', ' ')} ${statusCapitalized}`;
    notificationMessage = status === 'approved'
      ? `Your ${approval.type.replace('_', ' ')} has been approved.`
      : `Your ${approval.type.replace('_', ' ')} was rejected. Reason: ${comments || 'No reason provided'}`;
  }

  const notificationPromise = supabase.from('notifications').insert({
    user_id: approval.intern_id,
    type: 'approval_result',
    title: notificationTitle,
    message: notificationMessage,
    entity_type: approval.type,
    entity_id: approval.entity_id,
  });

  // Send email notification
  let emailPromise = Promise.resolve();
  const internEmail = approval.intern?.email || null;
  if (internEmail) {
    const emailHtml = getApprovalResultTemplate(approval.type, status, comments);
    emailPromise = sendEmailNotification(
      internEmail,
      notificationTitle,
      emailHtml
    );
  }

  Promise.allSettled([notificationPromise, emailPromise]).then((results) => {
    const [notificationResult] = results;
    if (notificationResult?.status === 'rejected') {
      console.error('Failed to create approval result notification:', notificationResult.reason);
    }
  });

  logAudit(`approval.${status}`, 'approval', approvalId, {
    type: approval.type,
    entity_id: approval.entity_id,
    comments,
  }).catch(err => {
    console.error('Audit log failed:', err);
  });
}

async function openTaskSubmissionReviewModal(approvalId, approvals) {
  const approval = approvals.find(a => a.id === approvalId);
  if (!approval) return;

  // Open modal immediately with loading state
  createModal('Review Submitted Task', `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
        <p class="text-sm text-neutral-500">Loading task details...</p>
      </div>
    </div>
  `, async (el, close) => {
    // Fetch task data AFTER modal is open
    const { data: task, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', approval.entity_id)
      .single();

    if (fetchError || !task) {
      el.querySelector('.modal-body').innerHTML = `
        <div class="text-center py-8">
          <p class="text-danger-600">Failed to load task details</p>
          <button id="close-error" class="btn-secondary mt-4">Close</button>
        </div>
      `;
      el.querySelector('#close-error').addEventListener('click', close);
      return;
    }

    // Replace loading state with actual form
    el.querySelector('.modal-body').innerHTML = `
    <form id="review-task-form" class="space-y-4">
      <p class="text-sm text-neutral-500">Review and optionally edit the task details before approving.</p>
      <div>
        <label class="form-label">Task Title <span class="text-danger-500">*</span></label>
        <input type="text" id="review-task-title" class="form-input" value="${task.title}" required />
      </div>
      <div>
        <label class="form-label">Description</label>
        <textarea id="review-task-description" class="form-input" rows="3">${task.description || ''}</textarea>
      </div>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="form-label">Estimated Hours</label>
          <input type="number" id="review-task-hours" class="form-input" min="0" step="0.5" value="${task.estimated_hours || ''}" placeholder="Optional" />
        </div>
        <div>
          <label class="form-label">Due Date</label>
          <input type="date" id="review-task-due" class="form-input" value="${task.due_date || ''}" />
        </div>
      </div>
      <div class="flex justify-end gap-3 pt-2 border-t border-neutral-200">
        <button type="button" id="review-task-cancel" class="btn-secondary">Cancel</button>
        <button type="button" id="review-task-reject" class="btn-danger">Reject</button>
        <button type="submit" class="btn-success">Approve & Set In Progress</button>
      </div>
    </form>
  `;

    // Attach event listeners after content is replaced
    el.querySelector('#review-task-cancel').addEventListener('click', close);

    el.querySelector('#review-task-reject').addEventListener('click', () => {
      close();
      openRejectModal(approvalId, approvals);
    });

    el.querySelector('#review-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = el.querySelector('#review-task-title').value.trim();
      if (!title) {
        showToast('Task title is required', 'error');
        return;
      }

      const description = el.querySelector('#review-task-description').value.trim();
      const estimatedHours = parseFloat(el.querySelector('#review-task-hours').value) || null;
      const dueDate = el.querySelector('#review-task-due').value || null;

      const submitBtn = el.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        const { error: updateError } = await supabase
          .from('tasks')
          .update({
            title,
            description: description || null,
            estimated_hours: estimatedHours,
            due_date: dueDate,
          })
          .eq('id', task.id);

        if (updateError) throw new Error(updateError.message);

        await processApproval(approvalId, 'approved', null, approval);
        showToast('Task approved and set to in progress', 'success');
        close();
        renderApprovalsPage();
      } catch (err) {
        showToast(err.message || 'Failed to approve task', 'error');
        submitBtn.disabled = false;
      }
    });
  });
}

async function viewApprovalDetails(approvalId, approvals) {
  const approval = approvals.find(a => a.id === approvalId);
  if (!approval) return;

  const role = getUserRole();
  const isAdmin = role === 'admin';
  const canActOnCorrection = isAdmin || approval.type !== 'attendance_correction';
  const isActionable = approval.status === 'pending' && canActOnCorrection;

  // Open modal immediately with loading state
  const modalTitle = `${approval.type.replace('_', ' ')} Details`;
  createModal(modalTitle, `
    <div class="flex items-center justify-center py-12">
      <div class="text-center">
        <div class="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mb-3"></div>
        <p class="text-sm text-neutral-500">Loading details...</p>
      </div>
    </div>
  `, async (el, close) => {
    let detailHtml = '';

  if (approval.type === 'attendance') {
    const { data: record } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('id', approval.entity_id)
      .single();

    if (record) {
      detailHtml = `
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Date</p>
              <p class="font-medium">${formatDate(record.date)}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Total Hours</p>
              <p class="font-medium">${formatHoursDisplay(record.total_hours || 0)}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Morning In</p>
              <p class="font-medium">${record.time_in_1 ? formatTime(record.time_in_1) : '—'}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Lunch Out</p>
              <p class="font-medium">${record.time_out_1 ? formatTime(record.time_out_1) : '—'}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Afternoon In</p>
              <p class="font-medium">${record.time_in_2 ? formatTime(record.time_in_2) : '—'}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">End of Day</p>
              <p class="font-medium">${record.time_out_2 ? formatTime(record.time_out_2) : '—'}</p>
            </div>
          </div>
          ${record.is_late ? '<p class="text-sm text-warning-600">⚠ Late arrival flagged</p>' : ''}
          ${record.is_outside_hours ? '<p class="text-sm text-danger-600">⚠ Overtime flagged</p>' : ''}
        </div>
      `;
    }
  } else if (approval.type === 'narrative') {
    const { data: narrative } = await supabase
      .from('narratives')
      .select('*, task:tasks(title)')
      .eq('id', approval.entity_id)
      .single();

    if (narrative) {
      const { data: attendance } = await supabase
        .from('attendance_records')
        .select('time_in_1, time_out_1, time_in_2, time_out_2')
        .eq('intern_id', narrative.intern_id)
        .eq('date', narrative.date)
        .maybeSingle();

      const displayHours = resolveNarrativeHours(narrative, attendance || null);

      detailHtml = `
        <div class="space-y-3">
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Task</p>
            <p class="font-medium">${narrative.task?.title || 'Unknown'}</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Date</p>
              <p class="font-medium">${formatDate(narrative.date)}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Session</p>
              <p class="font-medium capitalize">${narrative.session || '—'}</p>
            </div>
          </div>
          ${displayHours !== null ? `
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Hours</p>
              <p class="font-medium">${formatHoursDisplay(displayHours)}</p>
            </div>
          ` : ''}
          ${narrative.edited_at ? `
            <div class="p-2 bg-info-50 rounded-lg border border-info-200">
              <p class="text-sm text-info-700"><strong>✏️ This narrative was edited</strong></p>
              <p class="text-xs text-info-600">Last edited: ${formatDateTime(narrative.edited_at)}</p>
            </div>
          ` : ''}
          ${narrative.is_late_submission ? `
            <div class="p-2 bg-warning-50 rounded-lg">
              <p class="text-sm text-warning-600">⚠ Late submission</p>
            </div>
          ` : ''}
          <div>
            <p class="text-xs text-neutral-500 mb-1">Narrative Content</p>
            <div class="prose prose-sm border border-neutral-200 rounded-lg p-3">${narrative.content}</div>
          </div>
        </div>
      `;
    }
  } else if (approval.type === 'task_status') {
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', approval.entity_id)
      .single();

    if (task) {
      detailHtml = `
        <div class="space-y-3">
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Task</p>
            <p class="font-medium">${task.title}</p>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Current Status</p>
              <p class="font-medium capitalize">${task.status.replace('_', ' ')}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Requested Status</p>
              <p class="font-medium capitalize">${task.pending_status?.replace('_', ' ') || '—'}</p>
            </div>
          </div>
        </div>
      `;
    }
  } else if (approval.type === 'task_submission') {
    const { data: task } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', approval.entity_id)
      .single();

    if (task) {
      detailHtml = `
        <div class="space-y-3">
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Task Title</p>
            <p class="font-medium">${task.title}</p>
          </div>
          ${task.description ? `
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Description</p>
              <p class="text-sm text-neutral-800">${task.description}</p>
            </div>
          ` : ''}
          <div class="grid grid-cols-2 gap-3">
            ${task.estimated_hours ? `
              <div class="p-3 bg-neutral-50 rounded-lg">
                <p class="text-xs text-neutral-500">Estimated Hours</p>
                <p class="font-medium">${task.estimated_hours}h</p>
              </div>
            ` : ''}
            ${task.due_date ? `
              <div class="p-3 bg-neutral-50 rounded-lg">
                <p class="text-xs text-neutral-500">Due Date</p>
                <p class="font-medium">${formatDate(task.due_date)}</p>
              </div>
            ` : ''}
          </div>
          <div class="p-3 bg-warning-50 rounded-lg border border-warning-200">
            <p class="text-xs text-warning-600">Submitted by intern — pending review</p>
          </div>
        </div>
      `;
    }
  } else if (approval.type === 'attendance_correction') {
    const { data: correction } = await supabase
      .from('attendance_corrections')
      .select('*, attendance:attendance_records!attendance_id(date)')
      .eq('id', approval.entity_id)
      .single();

    const punchLabels = {
      time_in_1: 'Morning Time In',
      time_out_1: 'Lunch Time Out',
      time_in_2: 'Afternoon Time In',
      time_out_2: 'End of Day Time Out',
    };

    if (correction) {
      detailHtml = `
        <div class="space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Date</p>
              <p class="font-medium">${correction.attendance?.date ? formatDate(correction.attendance.date) : '—'}</p>
            </div>
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Punch Type</p>
              <p class="font-medium">${punchLabels[correction.punch_type] || correction.punch_type}</p>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Original Time</p>
              <p class="font-medium">${correction.original_value ? formatTime(correction.original_value) : '—'}</p>
            </div>
            <div class="p-3 bg-info-50 rounded-lg border border-info-200">
              <p class="text-xs text-neutral-500">Requested Time</p>
              <p class="font-medium text-info-700">${correction.requested_value ? formatTime(correction.requested_value) : '—'}</p>
            </div>
          </div>
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500 mb-1">Reason</p>
            <p class="text-sm text-neutral-800">${correction.reason || '—'}</p>
          </div>
        </div>
      `;
    }
  }

    // Replace loading state with actual details
    const detailsContent = detailHtml || '<p class="text-neutral-400 text-center py-8">No details available</p>';
    
    // Add action buttons if approval is actionable
    const actionsHTML = isActionable ? `
      <div class="mt-6 pt-6 border-t border-neutral-200 flex justify-end gap-3">
        <button id="detail-reject-btn" class="btn-danger" title="Reject">
          ${icons.x} Reject
        </button>
        <button id="detail-approve-btn" class="btn-success" title="Approve">
          ${icons.check} Approve
        </button>
      </div>
    ` : '';

    el.querySelector('.modal-body').innerHTML = detailsContent + actionsHTML;

    // Attach event listeners for action buttons
    if (isActionable) {
      el.querySelector('#detail-approve-btn')?.addEventListener('click', async () => {
        const approveBtn = el.querySelector('#detail-approve-btn');
        approveBtn.disabled = true;
        approveBtn.innerHTML = `${icons.check} Approving...`;
        
        try {
          await processApproval(approvalId, 'approved', null, approval);
          showToast('Item approved', 'success');
          close();
          renderApprovalsPage();
        } catch (err) {
          showToast(err.message || 'Failed to approve', 'error');
          approveBtn.disabled = false;
          approveBtn.innerHTML = `${icons.check} Approve`;
        }
      });

      el.querySelector('#detail-reject-btn')?.addEventListener('click', () => {
        close();
        openRejectModal(approvalId, approvals);
      });
    }
  });
}
