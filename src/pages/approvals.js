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
    .select('*, intern:profiles!approvals_intern_id_fkey(full_name, email)')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('supervisor_id', profile.id);
  }

  const { data: approvals } = await query;

  const pendingApprovals = (approvals || []).filter(a => a.status === 'pending');
  const reviewedApprovals = (approvals || []).filter(a => a.status !== 'pending');

  renderLayout(`
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">Approvals</h1>
      <p class="text-neutral-500 mt-1">Review and manage submissions</p>
    </div>

    <!-- Pending Approvals -->
    <div class="card mb-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">Pending (${pendingApprovals.length})</h3>
        ${pendingApprovals.length > 0 ? `
          <button id="bulk-approve-btn" class="btn-sm btn-success">
            ${icons.check} Approve All Today
          </button>
        ` : ''}
      </div>

      ${pendingApprovals.length > 0 ? `
        <div class="space-y-3">
          ${pendingApprovals.map(a => renderApprovalCard(a)).join('')}
        </div>
      ` : `
        <div class="text-center py-8 text-neutral-400">
          <p>No pending approvals</p>
        </div>
      `}
    </div>

    <!-- Reviewed Approvals -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Review History</h3>
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
              </tr>
            `).join('')}
            ${reviewedApprovals.length === 0 ? '<tr><td colspan="6" class="text-center text-neutral-400 py-8">No review history</td></tr>' : ''}
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

    // Bulk approve
    el.querySelector('#bulk-approve-btn')?.addEventListener('click', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const todayPending = pendingApprovals.filter(a => a.submitted_at?.slice(0, 10) === today);

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

function renderApprovalCard(approval) {
  return `
    <div class="border border-neutral-200 rounded-lg p-4 hover:bg-neutral-50 transition-colors">
      <div class="flex items-center justify-between">
        <div class="flex-1">
          <div class="flex items-center gap-2 mb-1">
            <span class="badge-info">${approval.type.replace('_', ' ')}</span>
            <span class="font-medium text-neutral-800">${approval.intern?.full_name || 'Unknown'}</span>
            ${approval.is_escalated ? '<span class="badge-rejected">Escalated</span>' : ''}
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
          <button class="btn-sm btn-success approve-btn" data-approval-id="${approval.id}" title="Approve">
            ${icons.check}
          </button>
          <button class="btn-sm btn-danger reject-btn" data-approval-id="${approval.id}" title="Reject">
            ${icons.x}
          </button>
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
  // Update approval record
  const { error: approvalError } = await supabase
    .from('approvals')
    .update({
      status,
      comments: comments || null,
      reviewed_at: new Date().toISOString(),
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
            reviewed_by: (await supabase.auth.getUser()).data.user.id,
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
          reviewed_by: (await supabase.auth.getUser()).data.user.id,
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
          <div class="p-3 bg-neutral-50 rounded-lg">
            <p class="text-xs text-neutral-500">Date</p>
            <p class="font-medium">${formatDate(narrative.date)}</p>
          </div>
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
  }

  createModal(`${approval.type.replace('_', ' ')} Details`, detailHtml || '<p class="text-neutral-400">No details available</p>');
}
