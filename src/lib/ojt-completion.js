/**
 * OJT Completion Modal
 * Opens a three-option action sheet for admins when an intern finishes their required hours.
 * Importable by any page so the same UI is reused from the notifications page,
 * user-management page, and admin dashboard.
 */
import { supabase } from './supabase.js';
import { showToast } from './toast.js';
import { logAudit } from './audit.js';
import { createModal, confirmDialog } from './component.js';
import { icons } from './icons.js';

/**
 * Open the OJT completion action modal.
 * @param {string} internId  UUID of the intern's profile record.
 * @param {Function} [onComplete]  Optional callback to re-render the calling page.
 */
export async function openOjtCompletionModal(internId, onComplete) {
  const { data: intern, error } = await supabase
    .from('profiles')
    .select('id, full_name, hours_required, hours_rendered, is_voluntary, is_active')
    .eq('id', internId)
    .single();

  if (error || !intern) {
    showToast('Failed to load intern data', 'error');
    return;
  }

  const rendered = (intern.hours_rendered || 0).toFixed(1);
  const required = intern.hours_required || 0;

  createModal('OJT Completion Review', `
    <div class="space-y-4">
      <div class="rounded-xl border border-success-200 p-4 flex items-start gap-3"
           style="background: var(--color-success-50, #f0fdf4);">
        <div class="shrink-0 mt-0.5" style="color: var(--color-success-600, #16a34a);">${icons.check}</div>
        <div>
          <p class="font-semibold" style="color: var(--color-success-800, #166534);">
            ${intern.full_name} has completed their OJT
          </p>
          <p class="text-sm mt-0.5" style="color: var(--color-success-700, #15803d);">
            ${rendered} of ${required} required hours rendered
          </p>
        </div>
      </div>

      <p class="text-sm text-neutral-600">How would you like to proceed with this intern's account?</p>

      <div class="grid gap-3">
        <!-- Option 1: Voluntary Intern -->
        <button id="ojt-mark-voluntary"
                class="w-full text-left rounded-xl border-2 p-4 transition-all hover:border-primary-400"
                style="border-color: var(--color-primary-200); background: var(--color-primary-50);">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-primary-600"
                 style="background: var(--color-primary-100);">${icons.users}</div>
            <div>
              <p class="font-semibold text-neutral-900">Mark as Voluntary Intern</p>
              <p class="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                Keep the intern active and tag them as a voluntary intern continuing beyond their required hours.
              </p>
            </div>
          </div>
        </button>

        <!-- Option 2: Keep Active -->
        <button id="ojt-keep-active"
                class="w-full text-left rounded-xl border-2 border-neutral-200 bg-neutral-50 hover:border-neutral-400 transition-all p-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-neutral-600 bg-neutral-100">
              ${icons.approval}
            </div>
            <div>
              <p class="font-semibold text-neutral-900">Keep Active</p>
              <p class="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                Keep the intern active in the system without any special designation.
              </p>
            </div>
          </div>
        </button>

        <!-- Option 3: Deactivate -->
        <button id="ojt-deactivate"
                class="w-full text-left rounded-xl border-2 p-4 transition-all hover:border-danger-400"
                style="border-color: var(--color-danger-200); background: var(--color-danger-50);">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-danger-600"
                 style="background: var(--color-danger-100);">${icons.x}</div>
            <div>
              <p class="font-semibold text-neutral-900">Deactivate</p>
              <p class="text-xs text-neutral-500 mt-0.5 leading-relaxed">
                Disable the intern's account. They will no longer be able to log in or submit records.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  `, (el, close) => {
    // ── Mark as Voluntary ────────────────────────────────────────────────────
    el.querySelector('#ojt-mark-voluntary').addEventListener('click', async () => {
      try {
        const { error: upErr } = await supabase
          .from('profiles')
          .update({ is_voluntary: true })
          .eq('id', internId);
        if (upErr) throw upErr;
        await logAudit('intern.marked_voluntary', 'user', internId);
        showToast(`${intern.full_name} marked as Voluntary Intern`, 'success');
        close();
        onComplete?.();
      } catch {
        showToast('Failed to update intern status', 'error');
      }
    });

    // ── Keep Active (acknowledge without changes) ────────────────────────────
    el.querySelector('#ojt-keep-active').addEventListener('click', () => {
      close();
      onComplete?.();
    });

    // ── Deactivate ───────────────────────────────────────────────────────────
    el.querySelector('#ojt-deactivate').addEventListener('click', async () => {
      // Block deactivation if the intern still has active tasks
      const { data: activeTasks } = await supabase
        .from('tasks')
        .select('id, title, status')
        .eq('assigned_to', internId)
        .in('status', ['not_started', 'in_progress']);

      if (activeTasks && activeTasks.length > 0) {
        const taskSummary = activeTasks.map(t => `${t.title} (${t.status})`).join(', ');
        showToast(
          `Cannot deactivate: the following tasks are still active: ${taskSummary}`,
          'error'
        );
        return;
      }

      close();
      confirmDialog(
        `Are you sure you want to deactivate ${intern.full_name}?`,
        async () => {
          try {
            const { error: deactErr } = await supabase
              .from('profiles')
              .update({ is_active: false })
              .eq('id', internId);
            if (deactErr) throw deactErr;
            await logAudit('user.deactivated', 'user', internId);
            showToast(`${intern.full_name} deactivated`, 'success');
            onComplete?.();
          } catch {
            showToast('Failed to deactivate intern', 'error');
          }
        },
        'Deactivate'
      );
    });
  });
}
