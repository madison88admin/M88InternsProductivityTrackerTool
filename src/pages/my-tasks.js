/**
 * My Tasks Page (Intern view)
 * View assigned tasks and request status updates.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, getTodayDate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { isHoliday } from '../lib/holidays.js';
import { sendEmailNotification, getDepartmentSupervisors } from '../lib/email-notifications.js';

export async function renderMyTasksPage() {
  const profile = getProfile();
  const holidayInfo = await isHoliday(getTodayDate());

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, created_by_profile:profiles!tasks_created_by_fkey(full_name)')
    .eq('assigned_to', profile.id)
    .order('created_at', { ascending: false });

  const { data: settingRow } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'intern_task_submission')
    .maybeSingle();
  const taskSubmissionEnabled = settingRow?.value?.enabled === true;

  const allTasks = tasks || [];
  const pendingReviewTasks = allTasks.filter(t => t.is_self_submitted && t.submission_status === 'pending');

  const today = getTodayDate();
  const statusGroups = {
    not_started: allTasks.filter(t => t.status === 'not_started' && t.submission_status !== 'pending'),
    in_progress: allTasks.filter(t => t.status === 'in_progress'),
    completed: allTasks.filter(t => t.status === 'completed'),
  };
  const overdueCount = allTasks.filter(t =>
    t.due_date && t.due_date < today && t.status !== 'completed' && t.submission_status !== 'pending'
  ).length;

  renderLayout(`
    <!-- Page header -->
    <div class="page-header animate-fade-in-up">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="page-title">My Tasks</h1>
          <p class="page-subtitle">View and manage your assigned tasks</p>
        </div>
        ${taskSubmissionEnabled && profile.supervisor_id ? `
          <button id="submit-task-btn" class="btn-primary shrink-0" ${pendingReviewTasks.length > 0 ? 'disabled' : ''} title="${pendingReviewTasks.length > 0 ? 'You have a task pending review. Submit another after this one is approved or rejected.' : ''}">
            ${icons.tasks}
            <span class="ml-2">Submit Task</span>
          </button>
        ` : ''}
      </div>
    </div>

    ${holidayInfo.isHoliday ? `
      <div class="bg-danger-50 border border-danger-300 rounded-xl p-4 mb-6 flex items-center gap-3 animate-fade-in-up">
        <div class="shrink-0 text-danger-500">${icons.calendar}</div>
        <div>
          <p class="text-sm font-bold text-danger-700">Holiday: ${holidayInfo.name}</p>
          <p class="text-xs text-danger-600">Today is a holiday. Starting or completing tasks is disabled.</p>
        </div>
      </div>
    ` : ''}

    <!-- Summary strip -->
    ${allTasks.length > 0 ? `
      <div class="flex flex-wrap gap-3 mb-6 animate-fade-in-up" style="animation-delay: 50ms;">
        <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium" style="background: var(--color-neutral-100); color: var(--color-neutral-700);">
          <span class="font-bold text-neutral-900">${allTasks.length}</span> Total
        </div>
        ${statusGroups.in_progress.length > 0 ? `
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-warning-50 text-warning-700">
            <span class="w-2 h-2 rounded-full bg-warning-500 shrink-0"></span>
            <span class="font-bold">${statusGroups.in_progress.length}</span> In Progress
          </div>
        ` : ''}
        ${statusGroups.completed.length > 0 ? `
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-success-50 text-success-700">
            <span class="w-2 h-2 rounded-full bg-success-500 shrink-0"></span>
            <span class="font-bold">${statusGroups.completed.length}</span> Completed
          </div>
        ` : ''}
        ${overdueCount > 0 ? `
          <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-danger-50 text-danger-700">
            <span class="w-2 h-2 rounded-full bg-danger-500 shrink-0"></span>
            <span class="font-bold">${overdueCount}</span> Overdue
          </div>
        ` : ''}
      </div>
    ` : ''}

    <!-- Status Tabs -->
    <div class="flex items-center gap-3 mb-6 animate-fade-in-up" style="animation-delay: 100ms;">
      <div class="flex flex-wrap gap-1 p-1 rounded-xl" style="background: var(--color-neutral-100);">
        <button class="task-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all bg-white shadow-sm text-neutral-800" data-status="all">
          All
          <span class="ml-1.5 text-xs font-bold text-neutral-400">${allTasks.length}</span>
        </button>
        ${pendingReviewTasks.length > 0 ? `
          <button class="task-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-neutral-500" data-status="pending_review">
            Pending Review
            <span class="ml-1.5 inline-block px-1.5 py-0.5 rounded-full text-xs font-bold text-white bg-warning-500">${pendingReviewTasks.length}</span>
          </button>
        ` : ''}
        <button class="task-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-neutral-500" data-status="not_started">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-neutral-400 shrink-0"></span>
            Not Started
            <span class="text-xs font-bold text-neutral-400">${statusGroups.not_started.length}</span>
          </span>
        </button>
        <button class="task-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-neutral-500" data-status="in_progress">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-warning-400 shrink-0"></span>
            In Progress
            <span class="text-xs font-bold text-neutral-400">${statusGroups.in_progress.length}</span>
          </span>
        </button>
        <button class="task-tab px-4 py-1.5 rounded-lg text-sm font-semibold transition-all text-neutral-500" data-status="completed">
          <span class="inline-flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-success-400 shrink-0"></span>
            Completed
            <span class="text-xs font-bold text-neutral-400">${statusGroups.completed.length}</span>
          </span>
        </button>
      </div>
    </div>

    <!-- Task List -->
    <div id="task-list" class="space-y-3 animate-fade-in-up" style="animation-delay: 150ms;">
      ${allTasks.length === 0 ? `
        <div class="card flex flex-col items-center justify-center py-20 text-center">
          <div class="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-neutral-400" style="background: var(--color-neutral-100);">
            ${icons.tasks}
          </div>
          <p class="text-base font-semibold text-neutral-600">No tasks yet</p>
          <p class="text-sm text-neutral-400 mt-1 max-w-xs">Your supervisor will assign tasks to you. They'll appear here once assigned.</p>
        </div>
      ` : allTasks.map(task => renderTaskCard(task, holidayInfo.isHoliday, today)).join('')}
    </div>
  `, (el) => {
    // Status filter tabs
    el.querySelectorAll('.task-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.task-tab').forEach(t => {
          t.classList.remove('bg-white', 'shadow-sm', 'text-neutral-800');
          t.classList.add('text-neutral-500');
        });
        tab.classList.add('bg-white', 'shadow-sm', 'text-neutral-800');
        tab.classList.remove('text-neutral-500');

        const status = tab.dataset.status;
        el.querySelectorAll('.task-card').forEach(card => {
          if (status === 'all') {
            card.style.display = '';
          } else if (status === 'pending_review') {
            card.style.display = card.dataset.submissionStatus === 'pending' ? '' : 'none';
          } else {
            card.style.display = (card.dataset.status === status && card.dataset.submissionStatus !== 'pending') ? '' : 'none';
          }
        });
      });
    });

    // Submit Task button
    el.querySelector('#submit-task-btn')?.addEventListener('click', () => {
      // Check if there are already pending tasks
      if (pendingReviewTasks.length > 0) {
        showToast('You can only submit one task at a time. Please wait for your pending task to be reviewed before submitting another.', 'warning');
        return;
      }

      createModal('Submit Task', `
        <form id="submit-task-form" class="space-y-4">
          <div>
            <label class="form-label">Task Title <span class="text-danger-500">*</span></label>
            <input type="text" id="submit-task-title" class="form-input" placeholder="What did you work on?" required />
          </div>
          <div>
            <label class="form-label">Description</label>
            <textarea id="submit-task-description" class="form-input" rows="3" placeholder="Provide additional details about this task..."></textarea>
          </div>
          <p class="text-xs text-neutral-400">Your supervisor will review and may edit this task before approving it.</p>
          <div class="flex justify-end gap-3">
            <button type="button" id="submit-task-cancel" class="btn-secondary">Cancel</button>
            <button type="submit" class="btn-primary">Submit for Review</button>
          </div>
        </form>
      `, (modalEl, close) => {
        modalEl.querySelector('#submit-task-cancel').addEventListener('click', close);

        modalEl.querySelector('#submit-task-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const title = modalEl.querySelector('#submit-task-title').value.trim();
          const description = modalEl.querySelector('#submit-task-description').value.trim();

          if (!title) {
            showToast('Please enter a task title', 'error');
            return;
          }

          const submitBtn = modalEl.querySelector('button[type="submit"]');
          submitBtn.disabled = true;

          try {
            const { data: newTask, error: taskError } = await supabase
              .from('tasks')
              .insert({
                title,
                description: description || null,
                status: 'not_started',
                is_self_submitted: true,
                submission_status: 'pending',
                assigned_to: profile.id,
                created_by: profile.id,
              })
              .select()
              .single();

            if (taskError) throw taskError;

            await supabase.from('approvals').insert({
              type: 'task_submission',
              entity_id: newTask.id,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
            });

            if (profile.supervisor_id) {
              // Get all supervisors in the intern's department for multi-supervisor notifications
              const deptSupervisors = await getDepartmentSupervisors(profile.id);

              // Notify all department supervisors
              if (deptSupervisors && deptSupervisors.length > 0) {
                // Create notification records for all supervisors
                const notifs = deptSupervisors.map(s => ({
                  user_id: s.id,
                  type: 'pending_approval',
                  title: 'Task Submission for Review',
                  message: `${profile.full_name} submitted a task for your review: "${title}"`,
                  entity_type: 'task',
                  entity_id: newTask.id,
                }));
                await supabase.from('notifications').insert(notifs);

                // Email template
                const emailHtml = `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                        .task-title { background: white; border-left: 4px solid #667eea; padding: 12px; margin: 15px 0; border-radius: 4px; font-weight: bold; }
                        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                      </style>
                    </head>
                    <body>
                      <div class="container">
                        <div class="header">
                          <h1>Task Submission for Review</h1>
                        </div>
                        <div class="content">
                          <p><strong>${profile.full_name}</strong> submitted a task for your review:</p>
                          <div class="task-title">${title}</div>
                          <p>Please review and approve or reject the submission.</p>
                          <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                        </div>
                        <div class="footer">
                          <p>This is an automated notification. Please do not reply to this email.</p>
                        </div>
                      </div>
                    </body>
                  </html>
                `;

                // Send email to each supervisor
                deptSupervisors.forEach(supervisor => {
                  if (supervisor?.email) {
                    sendEmailNotification(supervisor.email, `Task Submission for Review - ${title}`, emailHtml)
                      .catch(err => console.error('Failed to send task email to ' + supervisor.email + ':', err));
                  }
                });
              }
            }

            await logAudit('task.self_submitted', 'task', newTask.id, { title });
            showToast('Task submitted for review', 'success');
            close();
            renderMyTasksPage();
          } catch (err) {
            showToast(err.message || 'Failed to submit task', 'error');
            submitBtn.disabled = false;
          }
        });
      });
    });

    // Status change buttons
    el.querySelectorAll('.task-status-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (holidayInfo.isHoliday) {
          showToast('Cannot change task status on a holiday', 'error');
          return;
        }

        const taskId = btn.dataset.taskId;
        const newStatus = btn.dataset.newStatus;

        btn.disabled = true;
        try {
          if (newStatus === 'in_progress') {
            // Starting a task: apply immediately, just notify supervisor
            const { error } = await supabase
              .from('tasks')
              .update({ status: 'in_progress' })
              .eq('id', taskId);

            if (error) throw error;

            // Notify supervisor that task is now in progress
            const { data: taskData } = await supabase
              .from('tasks')
              .select('title')
              .eq('id', taskId)
              .single();

            const taskStartNotif = {
              type: 'system',
              title: 'Task In Progress',
              message: `${profile.full_name} has started working on "${taskData?.title || 'a task'}".`,
              entity_type: 'task',
              entity_id: taskId,
            };

            if (profile.supervisor_id) {
              await supabase.from('notifications').insert({ user_id: profile.supervisor_id, ...taskStartNotif });

              // Send email notification to supervisor
              const { data: supervisor } = await supabase
                .from('profiles')
                .select('full_name, email')
                .eq('id', profile.supervisor_id)
                .single();

              if (supervisor?.email) {
                const emailHtml = `
                  <!DOCTYPE html>
                  <html>
                    <head>
                      <style>
                        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                        .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                        .badge { display: inline-block; background: #10b981; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                        .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                      </style>
                    </head>
                    <body>
                      <div class="container">
                        <div class="header">
                          <h1>Task In Progress</h1>
                        </div>
                        <div class="content">
                          <p><strong>${profile.full_name}</strong> has started working on a task <span class="badge">IN PROGRESS</span></p>
                          <p><strong>Task:</strong> ${taskData?.title || 'A task'}</p>
                          <p><a href="${window.location.origin}/#/task-management" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                        </div>
                        <div class="footer">
                          <p>This is an automated notification. Please do not reply to this email.</p>
                        </div>
                      </div>
                    </body>
                  </html>
                `;
                await sendEmailNotification(supervisor.email, `Task In Progress - ${taskData?.title || 'A task'}`, emailHtml).catch(err => console.error('Failed to send task email:', err));
              }
            }

            // Also notify all active admins
            const { data: admins } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .eq('role', 'admin')
              .eq('is_active', true);

            if (admins && admins.length > 0) {
              const adminNotifs = admins
                .filter(a => a.id !== profile.supervisor_id)
                .map(a => ({ user_id: a.id, ...taskStartNotif }));
              if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);

              // Send email to all other admins
              const otherAdmins = admins.filter(a => a.id !== profile.supervisor_id);
              for (const admin of otherAdmins) {
                if (admin.email) {
                  const adminEmailHtml = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <style>
                          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                          .badge { display: inline-block; background: #10b981; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; }
                          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                        </style>
                      </head>
                      <body>
                        <div class="container">
                          <div class="header">
                            <h1>Task In Progress</h1>
                          </div>
                          <div class="content">
                            <p><strong>${profile.full_name}</strong> has started working on a task <span class="badge">IN PROGRESS</span></p>
                            <p><strong>Task:</strong> ${taskData?.title || 'A task'}</p>
                            <p><a href="${window.location.origin}/#/task-management" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                          </div>
                          <div class="footer">
                            <p>This is an automated notification. Please do not reply to this email.</p>
                          </div>
                        </div>
                      </body>
                    </html>
                  `;
                  await sendEmailNotification(admin.email, `Task In Progress - ${taskData?.title || 'A task'}`, adminEmailHtml).catch(err => console.error('Failed to send admin task email:', err));
                }
              }
            }

            await logAudit('task.started', 'task', taskId, { status: 'in_progress' });
            showToast('Task started!', 'success');
          } else {
            // Completing a task: still requires supervisor approval
            const { error } = await supabase
              .from('tasks')
              .update({ pending_status: newStatus })
              .eq('id', taskId);

            if (error) throw error;

            // Create approval entry
            await supabase.from('approvals').insert({
              type: 'task_status',
              entity_id: taskId,
              intern_id: profile.id,
              supervisor_id: profile.supervisor_id,
              comments: `Requesting status change to: ${newStatus.replace('_', ' ')}`,
            });

            // Get all supervisors in the intern's department for multi-supervisor notifications
            const deptSupervisors = await getDepartmentSupervisors(profile.id);
            const deptSupervisorIds = deptSupervisors.map(s => s.id);

            // Notify supervisor(s)
            const taskCompleteNotif = {
              type: 'pending_approval',
              title: 'Task Status Change Request',
              message: `${profile.full_name} is requesting to change task status to "${newStatus.replace('_', ' ')}"`,
              entity_type: 'task',
              entity_id: taskId,
            };

            if (profile.supervisor_id && deptSupervisors && deptSupervisors.length > 0) {
              // Create notification records for all department supervisors
              const supervisorNotifs = deptSupervisors.map(s => ({
                user_id: s.id,
                ...taskCompleteNotif,
              }));
              await supabase.from('notifications').insert(supervisorNotifs);

              // Fetch task for email
              const { data: task } = await supabase
                .from('tasks')
                .select('title')
                .eq('id', taskId)
                .single();

              // Email template
              const emailHtml = `
                <!DOCTYPE html>
                <html>
                  <head>
                    <style>
                      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                      .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                      .badge { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-left: 8px; }
                      .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>Task Status Change Request</h1>
                      </div>
                      <div class="content">
                        <p><strong>${profile.full_name}</strong> is requesting to change task status to <strong>"${newStatus.replace('_', ' ')}"</strong> <span class="badge">PENDING APPROVAL</span></p>
                        <p><strong>Task:</strong> ${task?.title || 'A task'}</p>
                        <p>Please review and approve or reject this status change request.</p>
                        <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                      </div>
                      <div class="footer">
                        <p>This is an automated notification. Please do not reply to this email.</p>
                      </div>
                    </div>
                  </body>
                </html>
              `;

              // Send email to each supervisor
              deptSupervisors.forEach(supervisor => {
                if (supervisor?.email) {
                  sendEmailNotification(supervisor.email, `Task Status Change Request - ${task?.title || 'A task'}`, emailHtml)
                    .catch(err => console.error('Failed to send task email to ' + supervisor.email + ':', err));
                }
              });
            }

            // Also notify all active admins (exclude department supervisors)
            const { data: admins } = await supabase
              .from('profiles')
              .select('id, email, full_name')
              .eq('role', 'admin')
              .eq('is_active', true);

            if (admins && admins.length > 0) {
              const adminNotifs = admins
                .filter(a => !deptSupervisorIds.includes(a.id))  // Exclude department supervisors
                .map(a => ({ user_id: a.id, ...taskCompleteNotif }));
              if (adminNotifs.length > 0) await supabase.from('notifications').insert(adminNotifs);

              // Send email to all other admins (exclude department supervisors)
              const otherAdmins = admins.filter(a => !deptSupervisorIds.includes(a.id));
              const { data: task } = await supabase
                .from('tasks')
                .select('title')
                .eq('id', taskId)
                .single();

              for (const admin of otherAdmins) {
                if (admin.email) {
                  const adminEmailHtml = `
                    <!DOCTYPE html>
                    <html>
                      <head>
                        <style>
                          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 5px 5px 0 0; }
                          .content { background: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 5px 5px; }
                          .badge { display: inline-block; background: #f59e0b; color: white; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 12px; margin-left: 8px; }
                          .footer { margin-top: 20px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
                        </style>
                      </head>
                      <body>
                        <div class="container">
                          <div class="header">
                            <h1>Task Status Change Request</h1>
                          </div>
                          <div class="content">
                            <p><strong>${profile.full_name}</strong> is requesting to change task status to <strong>"${newStatus.replace('_', ' ')}"</strong> <span class="badge">PENDING APPROVAL</span></p>
                            <p><strong>Task:</strong> ${task?.title || 'A task'}</p>
                            <p>Please review and approve or reject this status change request.</p>
                            <p><a href="${window.location.origin}/#/approvals" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px; display: inline-block; margin-top: 10px;">View in System</a></p>
                          </div>
                          <div class="footer">
                            <p>This is an automated notification. Please do not reply to this email.</p>
                          </div>
                        </div>
                      </body>
                    </html>
                  `;
                  await sendEmailNotification(admin.email, `Task Status Change Request - ${task?.title || 'A task'}`, adminEmailHtml).catch(err => console.error('Failed to send admin task email to ' + admin.email + ':', err));
                }
              }
            }

            await logAudit('task.status_change_requested', 'task', taskId, { requested_status: newStatus });
            showToast('Completion request sent to supervisor', 'success');
          }
          renderMyTasksPage();
        } catch (err) {
          showToast(err.message || 'Failed to update task status', 'error');
          btn.disabled = false;
        }
      });
    });
  }, '/my-tasks');
}

function renderTaskCard(task, isHolidayToday, today) {
  const isPendingReview = task.is_self_submitted && task.submission_status === 'pending';
  const isRejectedSubmission = task.is_self_submitted && task.submission_status === 'rejected';
  const deadlineUrgency = getTaskDeadlineUrgency(task, today);
  const isOverdue = deadlineUrgency === 'red' && !!task.due_date && task.due_date < today;
  const isDueSoon = deadlineUrgency === 'yellow';
  const isDueCritical = deadlineUrgency === 'red' && !isOverdue;

  // Left accent bar color per state
  const accentColor = isPendingReview ? 'var(--color-warning-400)'
    : isRejectedSubmission ? 'var(--color-danger-500)'
    : isOverdue ? 'var(--color-danger-500)'
    : task.status === 'completed' ? 'var(--color-success-400)'
    : task.status === 'in_progress' ? 'var(--color-warning-400)'
    : 'var(--color-neutral-300)';

  // Status badge
  const statusBadge = isPendingReview
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-50 text-warning-700">Pending Review</span>`
    : isRejectedSubmission
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-danger-50 text-danger-700">Submission Rejected</span>`
    : task.status === 'completed'
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-success-50 text-success-700">Completed</span>`
    : task.status === 'in_progress'
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-warning-50 text-warning-700">In Progress</span>`
    : `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600">Not Started</span>`;

  // Urgency badge
  const urgencyBadge = isOverdue
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-danger-500 text-white">Overdue</span>`
    : isDueCritical
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-danger-50 text-danger-700">Due in 3 Days</span>`
    : isDueSoon
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-warning-100 text-warning-700">Due Soon</span>`
    : '';

  // Pending approval badge
  const pendingBadge = task.pending_status
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-primary-50 text-primary-700">Awaiting Approval</span>`
    : '';

  // Self-submitted badge
  const selfBadge = task.is_self_submitted && task.submission_status === 'approved'
    ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-500">Self-submitted</span>`
    : '';

  // Due date styling
  const dueDateHtml = task.due_date
    ? `<span class="flex items-center gap-1 ${deadlineUrgency === 'red' ? 'text-danger-600 font-semibold' : deadlineUrgency === 'yellow' ? 'text-warning-600 font-medium' : 'text-neutral-400'}">
        <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        Due ${formatDate(task.due_date)}
      </span>`
    : '';

  const cardBgClass = deadlineUrgency === 'red'
    ? 'bg-danger-50'
    : deadlineUrgency === 'yellow'
    ? 'bg-warning-50'
    : 'bg-white';

  const cardBorderClass = deadlineUrgency === 'red'
    ? 'border-danger-200'
    : deadlineUrgency === 'yellow'
    ? 'border-warning-200'
    : 'border-neutral-200';

  // Action buttons
  const actionBtns = (() => {
    if (isPendingReview || isRejectedSubmission || task.status === 'completed') return '';
    if (task.status === 'not_started') return `
      <button class="task-status-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-white"
              style="background: var(--color-primary-600);"
              data-task-id="${task.id}" data-new-status="in_progress"
              ${task.pending_status || isHolidayToday ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        Start Task
      </button>`;
    if (task.status === 'in_progress') return `
      <button class="task-status-btn flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all text-white"
              style="background: var(--color-success-600);"
              data-task-id="${task.id}" data-new-status="completed"
              ${task.pending_status || isHolidayToday ? 'disabled style="opacity:0.5;cursor:not-allowed;"' : ''}>
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
        ${task.pending_status ? 'Approval Pending' : 'Mark Complete'}
      </button>`;
    return '';
  })();

  return `
    <div class="task-card border rounded-xl overflow-hidden transition-all hover:shadow-md ${cardBgClass} ${cardBorderClass}"
         data-status="${task.status}" data-id="${task.id}" data-submission-status="${task.submission_status || ''}">
      <div class="flex">
        <!-- Left accent bar -->
        <div class="w-1 shrink-0 rounded-l-xl" style="background: ${accentColor};"></div>

        <!-- Card body -->
        <div class="flex-1 p-4">
          <!-- Top row: title + badges + action -->
          <div class="flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center flex-wrap gap-2 mb-1.5">
                <h4 class="font-semibold text-neutral-900 ${task.status === 'completed' ? 'line-through text-neutral-400' : ''} leading-snug">${task.title}</h4>
                ${statusBadge}${urgencyBadge}${pendingBadge}${selfBadge}
              </div>
              ${task.description ? `<p class="text-sm text-neutral-500 leading-relaxed mb-2">${task.description}</p>` : ''}
            </div>
            ${actionBtns ? `<div class="shrink-0">${actionBtns}</div>` : ''}
          </div>

          <!-- Metadata row -->
          <div class="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400 mt-2 pt-2 border-t" style="border-color: var(--color-neutral-100);">
            <span class="flex items-center gap-1">
              <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${!task.is_self_submitted ? `${task.created_by_profile?.full_name || 'Unknown'}` : 'Self-submitted'}
            </span>
            ${task.estimated_hours ? `
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${task.estimated_hours}h est.
              </span>
            ` : ''}
            ${dueDateHtml}
            <span class="flex items-center gap-1 ml-auto">
              <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              Created ${formatDate(task.created_at)}
            </span>
          </div>

          <!-- Status notices -->
          ${isPendingReview ? `
            <div class="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs text-warning-700 bg-warning-50 border border-warning-200">
              <svg class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              Awaiting supervisor approval before this task becomes active.
            </div>
          ` : ''}
          ${isRejectedSubmission ? `
            <div class="mt-3 flex items-start gap-2 rounded-lg px-3 py-2.5 text-xs text-danger-700 bg-danger-50 border border-danger-200">
              <svg class="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              This task submission was rejected by your supervisor.
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

function getTaskDeadlineUrgency(task, today) {
  if (!task?.due_date || task.status === 'completed') return 'normal';

  const toMidnight = (dateStr) => {
    const parsed = new Date(`${dateStr}T00:00:00`);
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  };

  const dueDate = toMidnight(task.due_date);
  const todayDate = toMidnight(today);
  const diffDays = Math.floor((dueDate - todayDate) / 86400000);

  if (diffDays <= 3) return 'red';
  if (diffDays <= 7) return 'yellow';
  return 'normal';
}
