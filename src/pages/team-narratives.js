/**
 * Team Narratives Page (Supervisor)
 * View daily narratives submitted by assigned interns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime, truncate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderTeamNarrativesPage() {
  const profile = getProfile();

  const { data: interns } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('supervisor_id', profile.id)
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  const internIds = (interns || []).map(i => i.id);

  let narratives = [];
  if (internIds.length > 0) {
    const { data } = await supabase
      .from('narratives')
      .select('*, intern:profiles!narratives_intern_id_fkey(full_name), task:tasks(title)')
      .in('intern_id', internIds)
      .order('date', { ascending: false })
      .limit(100);
    narratives = data || [];
  }

  let selectedIntern = '';

  function getFiltered() {
    if (!selectedIntern) return narratives;
    return narratives.filter(n => n.intern_id === selectedIntern);
  }

  function renderContent(el) {
    const filtered = getFiltered();
    const container = el.querySelector('#narratives-list');

    if (filtered.length === 0) {
      container.innerHTML = '<div class="text-center text-neutral-400 py-12">No narratives found</div>';
      return;
    }

    container.innerHTML = filtered.map(n => `
      <div class="border border-neutral-200 rounded-lg p-4 hover:bg-neutral-50 cursor-pointer narrative-card" data-id="${n.id}">
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-3">
            <span class="font-medium text-neutral-800">${n.intern?.full_name || '—'}</span>
            <span class="text-sm text-neutral-400">${formatDate(n.date)}</span>
          </div>
          <span class="badge-${n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'danger' : 'pending'}">${n.status}</span>
        </div>
        ${n.task?.title ? `<p class="text-xs text-primary-600 mb-1">Task: ${n.task.title}</p>` : ''}
        <p class="text-sm text-neutral-600">${truncate(n.content?.replace(/<[^>]*>/g, '') || '', 150)}</p>
      </div>
    `).join('');

    // click to view full
    container.querySelectorAll('.narrative-card').forEach(card => {
      card.addEventListener('click', () => {
        const n = filtered.find(x => x.id === card.dataset.id);
        if (!n) return;
        createModal(`Narrative — ${n.intern?.full_name} (${formatDate(n.date)})`, `
          <div class="space-y-3">
            ${n.task?.title ? `<p class="text-sm"><strong>Task:</strong> ${n.task.title}</p>` : ''}
            <p class="text-sm"><strong>Status:</strong> <span class="badge-${n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'danger' : 'pending'}">${n.status}</span></p>
            ${n.rejection_reason ? `<p class="text-sm text-danger-600"><strong>Rejection reason:</strong> ${n.rejection_reason}</p>` : ''}
            <div class="prose prose-sm max-w-none border border-neutral-200 rounded-lg p-4 bg-neutral-50">
              ${n.content || '<em>No content</em>'}
            </div>
            <p class="text-xs text-neutral-400">Submitted: ${formatDateTime(n.submitted_at || n.created_at)}</p>
          </div>
          <div class="flex justify-end mt-4">
            <button id="close-narrative" class="btn-secondary">Close</button>
          </div>
        `, (el, close) => {
          el.querySelector('#close-narrative').addEventListener('click', close);
        });
      });
    });

    el.querySelector('#narrative-count').textContent = `${filtered.length} narrative${filtered.length !== 1 ? 's' : ''}`;
  }

  renderLayout(`
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-neutral-800">Team Narratives</h1>
      <p class="text-neutral-500 mt-1">Daily narratives from your interns</p>
    </div>

    <div class="card mb-6">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <select id="filter-intern" class="form-input">
            <option value="">All Interns</option>
            ${(interns || []).map(i => `<option value="${i.id}">${i.full_name}</option>`).join('')}
          </select>
        </div>
        <p class="text-sm text-neutral-500" id="narrative-count">${narratives.length} narratives</p>
      </div>
    </div>

    <div id="narratives-list" class="space-y-3"></div>
  `, (el) => {
    renderContent(el);

    el.querySelector('#filter-intern').addEventListener('change', (e) => {
      selectedIntern = e.target.value;
      renderContent(el);
    });
  });
}
