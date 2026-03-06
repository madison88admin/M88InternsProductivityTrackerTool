/**
 * Daily Narratives Page (Intern view)
 * Submit daily narratives linked to tasks.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime, getTodayDate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderNarrativesPage() {
  const profile = getProfile();
  const today = getTodayDate();

  // Fetch intern's tasks (for selection)
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, status')
    .eq('assigned_to', profile.id)
    .in('status', ['not_started', 'in_progress']);

  // Fetch today's narratives
  const { data: todayNarratives } = await supabase
    .from('narratives')
    .select('*, task:tasks(title)')
    .eq('intern_id', profile.id)
    .eq('date', today)
    .order('created_at', { ascending: false });

  // Fetch recent narratives
  const { data: recentNarratives } = await supabase
    .from('narratives')
    .select('*, task:tasks(title)')
    .eq('intern_id', profile.id)
    .neq('date', today)
    .order('date', { ascending: false })
    .limit(20);

  renderLayout(`
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-neutral-800">Daily Narratives</h1>
        <p class="text-neutral-500 mt-1">Document your daily activities</p>
      </div>
      <button id="add-narrative-btn" class="btn-primary" ${(!tasks || tasks.length === 0) ? 'disabled title="No active tasks available"' : ''}>
        ${icons.plus}
        <span class="ml-2">New Narrative</span>
      </button>
    </div>

    ${(!tasks || tasks.length === 0) ? `
      <div class="bg-warning-50 border border-warning-500/30 rounded-lg p-4 mb-6">
        <p class="text-sm text-warning-600">
          <strong>Note:</strong> You need at least one active task to submit a narrative.
          Please wait for your supervisor to assign tasks.
        </p>
      </div>
    ` : ''}

    <!-- Today's Narratives -->
    <div class="card mb-6">
      <h3 class="text-lg font-semibold mb-4">Today's Narratives</h3>
      ${(todayNarratives && todayNarratives.length > 0) ? `
        <div class="space-y-4">
          ${todayNarratives.map(n => renderNarrativeCard(n, true)).join('')}
        </div>
      ` : `
        <div class="text-center py-8 text-neutral-400">
          <p>No narratives submitted for today yet</p>
        </div>
      `}
    </div>

    <!-- Past Narratives -->
    <div class="card">
      <h3 class="text-lg font-semibold mb-4">Previous Narratives</h3>
      ${(recentNarratives && recentNarratives.length > 0) ? `
        <div class="space-y-4">
          ${recentNarratives.map(n => renderNarrativeCard(n, false)).join('')}
        </div>
      ` : `
        <div class="text-center py-8 text-neutral-400">
          <p>No previous narratives</p>
        </div>
      `}
    </div>
  `, (el) => {
    el.querySelector('#add-narrative-btn')?.addEventListener('click', () => {
      openNarrativeModal(tasks, profile, today);
    });

    // Edit buttons for rejected narratives
    el.querySelectorAll('.edit-narrative-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const narrativeId = btn.dataset.narrativeId;
        const narrative = [...(todayNarratives || []), ...(recentNarratives || [])].find(n => n.id === narrativeId);
        if (narrative) {
          openEditNarrativeModal(narrative, tasks, profile);
        }
      });
    });
  });
}

function renderNarrativeCard(narrative, isToday) {
  const canEdit = narrative.status === 'rejected' || (narrative.status === 'pending' && isToday);

  return `
    <div class="border border-neutral-200 rounded-lg p-4">
      <div class="flex items-start justify-between mb-2">
        <div>
          <div class="flex items-center gap-2">
            <span class="badge-info">${narrative.task?.title || 'Unknown Task'}</span>
            <span class="badge-${narrative.status === 'approved' ? 'approved' : narrative.status === 'rejected' ? 'rejected' : 'pending'}">
              ${narrative.status}
            </span>
          </div>
          <p class="text-xs text-neutral-400 mt-1">${formatDateTime(narrative.created_at)}</p>
        </div>
        ${canEdit ? `
          <button class="btn-sm btn-secondary edit-narrative-btn" data-narrative-id="${narrative.id}">
            ${icons.edit}
          </button>
        ` : ''}
      </div>
      <div class="prose prose-sm mt-2 text-neutral-700">${narrative.content}</div>
      ${narrative.rejection_reason ? `
        <div class="mt-3 p-3 bg-danger-50 rounded-lg">
          <p class="text-xs font-medium text-danger-600">Rejection Reason:</p>
          <p class="text-sm text-danger-600">${narrative.rejection_reason}</p>
        </div>
      ` : ''}
    </div>
  `;
}

function openNarrativeModal(tasks, profile, today) {
  createModal('New Daily Narrative', `
    <form id="narrative-form" class="space-y-4">
      <div>
        <label class="form-label">Select Task <span class="text-danger-500">*</span></label>
        <select id="narrative-task" class="form-input" required>
          <option value="">Choose a task...</option>
          ${(tasks || []).map(t => `<option value="${t.id}">${t.title} (${t.status.replace('_', ' ')})</option>`).join('')}
        </select>
      </div>

      <div>
        <label class="form-label">Narrative <span class="text-danger-500">*</span></label>
        <div id="narrative-editor"></div>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="narrative-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="narrative-submit" class="btn-primary">Submit Narrative</button>
      </div>
    </form>
  `, async (el, close) => {
    // Initialize Quill editor
    const Quill = (await import('quill')).default;
    const quill = new Quill('#narrative-editor', {
      theme: 'snow',
      placeholder: 'Describe what you worked on today for this task...',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    });

    el.querySelector('#narrative-cancel').addEventListener('click', close);

    el.querySelector('#narrative-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const taskId = el.querySelector('#narrative-task').value;
      const content = quill.root.innerHTML;

      if (!taskId) {
        showToast('Please select a task', 'error');
        return;
      }

      if (quill.getText().trim().length < 10) {
        showToast('Narrative must be at least 10 characters', 'error');
        return;
      }

      const submitBtn = el.querySelector('#narrative-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';

      try {
        const { data, error } = await supabase
          .from('narratives')
          .insert({
            intern_id: profile.id,
            task_id: taskId,
            date: today,
            content,
            supervisor_id: profile.supervisor_id,
          })
          .select()
          .single();

        if (error) throw error;

        // Create approval entry
        if (profile.supervisor_id) {
          await supabase.from('approvals').insert({
            type: 'narrative',
            entity_id: data.id,
            intern_id: profile.id,
            supervisor_id: profile.supervisor_id,
          });

          await supabase.from('notifications').insert({
            user_id: profile.supervisor_id,
            type: 'pending_approval',
            title: 'Narrative Pending Review',
            message: `${profile.full_name} submitted a daily narrative for ${formatDate(today)}`,
            entity_type: 'narrative',
            entity_id: data.id,
          });
        }

        await logAudit('narrative.submitted', 'narrative', data.id, { task_id: taskId });
        showToast('Narrative submitted successfully', 'success');
        close();
        renderNarrativesPage();
      } catch (err) {
        showToast(err.message || 'Failed to submit narrative', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Narrative';
      }
    });
  });
}

function openEditNarrativeModal(narrative, tasks, profile) {
  createModal('Edit Narrative', `
    <form id="edit-narrative-form" class="space-y-4">
      <div>
        <label class="form-label">Task</label>
        <p class="text-sm text-neutral-600 font-medium">${narrative.task?.title || 'Unknown'}</p>
      </div>

      ${narrative.rejection_reason ? `
        <div class="p-3 bg-danger-50 rounded-lg">
          <p class="text-xs font-medium text-danger-600">Rejection Reason:</p>
          <p class="text-sm text-danger-600">${narrative.rejection_reason}</p>
        </div>
      ` : ''}

      <div>
        <label class="form-label">Narrative <span class="text-danger-500">*</span></label>
        <div id="edit-narrative-editor"></div>
      </div>

      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="edit-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" id="edit-submit" class="btn-primary">Resubmit</button>
      </div>
    </form>
  `, async (el, close) => {
    const Quill = (await import('quill')).default;
    const quill = new Quill('#edit-narrative-editor', {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['clean'],
        ],
      },
    });
    quill.root.innerHTML = narrative.content;

    el.querySelector('#edit-cancel').addEventListener('click', close);

    el.querySelector('#edit-narrative-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const content = quill.root.innerHTML;

      if (quill.getText().trim().length < 10) {
        showToast('Narrative must be at least 10 characters', 'error');
        return;
      }

      const submitBtn = el.querySelector('#edit-submit');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Resubmitting...';

      try {
        const { error } = await supabase
          .from('narratives')
          .update({
            content,
            status: 'pending',
            rejection_reason: null,
          })
          .eq('id', narrative.id);

        if (error) throw error;

        // Create new approval entry
        if (profile.supervisor_id) {
          await supabase.from('approvals').insert({
            type: 'narrative',
            entity_id: narrative.id,
            intern_id: profile.id,
            supervisor_id: profile.supervisor_id,
            comments: 'Resubmitted after rejection',
          });
        }

        await logAudit('narrative.resubmitted', 'narrative', narrative.id, {
          previous_status: narrative.status,
        });

        showToast('Narrative resubmitted successfully', 'success');
        close();
        renderNarrativesPage();
      } catch (err) {
        showToast(err.message || 'Failed to resubmit', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Resubmit';
      }
    });
  });
}
