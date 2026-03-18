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
import { formatDate, formatTime, formatDateTime, formatHoursDisplay } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderApprovalsPage() {
  const profile = getProfile();
  const role = getUserRole();
  const isAdmin = role === 'admin';

  let query = supabase
    .from('approvals')
    .select('*, intern:profiles!approvals_intern_id_fkey(full_name, email), reviewer:profiles!approvals_reviewed_by_fkey(full_name, email)')
    .order('created_at', { ascending: false });

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
      query = query.in('supervisor_id', deptSupervisorIds);
    } else {
      query = query.eq('supervisor_id', profile.id);
    }
  }

  const { data: approvals } = await query;

  const pendingApprovals = (approvals || []).filter(a => a.status === 'pending');
  const reviewedApprovals = (approvals || []).filter(a => a.status !== 'pending');
  const actionablePendingCount = pendingApprovals.filter(a => isAdmin || a.type !== 'attendance_correction').length;

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Approvals</h1>
      <p class="page-subtitle">Review and manage submissions</p>
    </div>

    <!-- Pending Approvals -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-base font-bold text-neutral-900">Pending (${pendingApprovals.length})</h3>
        ${pendingApprovals.length > 0 ? `
          <button id="bulk-approve-btn" class="btn-sm ${actionablePendingCount > 0 ? 'btn-success' : 'btn-secondary opacity-50 cursor-not-allowed'}" ${actionablePendingCount === 0 ? 'disabled' : ''}>
            ${icons.check} Approve All Today
          </button>
        ` : ''}
      </div>

      ${pendingApprovals.length > 0 ? `
        <div class="space-y-3">
          ${pendingApprovals.map(a => renderApprovalCard(a, isAdmin)).join('')}
        </div>
      ` : `
        <div class="text-center py-8 text-neutral-400">
          <p>No pending approvals</p>
        </div>
      `}
    </div>

    <!-- Reviewed Approvals -->
    <div class="card">
      <h3 class="text-base font-bold text-neutral-900 mb-4">Review History</h3>
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
          <tbody>
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
    </div>
  `, (el) => {
    // Approve/Reject individual items
    el.querySelectorAll('.approve-btn').forEach(btn => {
      btn.addEventListener('click', () => handleApproval(btn.dataset.approvalId, 'approved', approvals));
    });

    el.querySelectorAll('.reject-btn').forEach(btn => {
      btn.addEventListener('click', () => openRejectModal(btn.dataset.approvalId, approvals));
    });

    el.querySelectorAll('.view-details-btn').forEach(btn => {
      btn.addEventListener('click', () => viewApprovalDetails(btn.dataset.approvalId, approvals));
    });

    el.querySelectorAll('.review-task-btn').forEach(btn => {
      btn.addEventListener('click', () => openTaskSubmissionReviewModal(btn.dataset.approvalId, approvals));
    });

    // Bulk approve
    el.querySelector('#bulk-approve-btn')?.addEventListener('click', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const todayPending = pendingApprovals.filter(a =>
        a.submitted_at?.slice(0, 10) === today &&
        (isAdmin || a.type !== 'attendance_correction')
      );

      if (todayPending.length === 0) {
        showToast('No pending approvals for today', 'info');
        return;
      }

      for (const approval of todayPending) {
        await processApproval(approval.id, 'approved', 'Bulk approved', approval);
      }

      showToast(`${todayPending.length} items approved`, 'success');
      renderApprovalsPage();
    });
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

  // Notify intern
  await supabase.from('notifications').insert({
    user_id: approval.intern_id,
    type: 'approval_result',
    title: `${approval.type.replace('_', ' ')} ${status}`,
    message: status === 'approved'
      ? `Your ${approval.type.replace('_', ' ')} has been approved.`
      : `Your ${approval.type.replace('_', ' ')} was rejected. Reason: ${comments || 'No reason provided'}`,
    entity_type: approval.type,
    entity_id: approval.entity_id,
  });

  await logAudit(`approval.${status}`, 'approval', approvalId, {
    type: approval.type,
    entity_id: approval.entity_id,
    comments,
  });
}

async function openTaskSubmissionReviewModal(approvalId, approvals) {
  const approval = approvals.find(a => a.id === approvalId);
  if (!approval) return;

  const { data: task } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', approval.entity_id)
    .single();

  if (!task) {
    showToast('Task not found', 'error');
    return;
  }

  createModal('Review Submitted Task', `
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
  `, (el, close) => {
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
          ${record.is_outside_hours ? '<p class="text-sm text-danger-600">⚠ Outside allowed hours</p>' : ''}
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
          ${narrative.hours ? `
            <div class="p-3 bg-neutral-50 rounded-lg">
              <p class="text-xs text-neutral-500">Hours</p>
              <p class="font-medium">${formatHoursDisplay(narrative.hours)}</p>
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

  createModal(`${approval.type.replace('_', ' ')} Details`, detailHtml || '<p class="text-neutral-400">No details available</p>');
}
