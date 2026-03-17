/**
 * Team Narratives Page (Supervisor / Admin with department)
 * View daily narratives submitted by assigned interns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime, formatHoursDisplay, truncate } from '../lib/utils.js';
import { createModal } from '../lib/component.js';

export async function renderTeamNarrativesPage() {
  const profile = getProfile();
  const isAdmin = profile.role === 'admin';

  // Admins find their interns by department; supervisors by supervisor_id
  let internsQuery = supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'intern')
    .eq('is_active', true)
    .order('full_name');

  // Supervisors and admins in a department see all dept interns; otherwise fall back to supervisor_id
  if (profile.department_id) {
    internsQuery = internsQuery.eq('department_id', profile.department_id);
  } else {
    internsQuery = internsQuery.eq('supervisor_id', profile.id);
  }

  const { data: interns } = await internsQuery;

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
            <span class="font-medium text-neutral-900">${n.intern?.full_name || '—'}</span>
            <span class="text-sm text-neutral-400">${formatDate(n.date)}</span>
            ${n.session ? `<span class="badge bg-neutral-100 text-neutral-600 capitalize">${n.session}</span>` : ''}
            ${n.hours ? `<span class="text-xs text-neutral-400">${formatHoursDisplay(n.hours)}</span>` : ''}
          </div>
          <div class="flex items-center gap-2">
            ${n.is_late_submission ? '<span class="badge bg-warning-50 text-warning-600">Late</span>' : ''}
            <span class="badge-${n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'danger' : 'pending'}">${n.status}</span>
          </div>
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
            <div class="flex items-center gap-4">
              <p class="text-sm"><strong>Status:</strong> <span class="badge-${n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'danger' : 'pending'}">${n.status}</span></p>
              ${n.session ? `<p class="text-sm"><strong>Session:</strong> <span class="capitalize">${n.session}</span></p>` : ''}
              ${n.hours ? `<p class="text-sm"><strong>Hours:</strong> ${formatHoursDisplay(n.hours)}</p>` : ''}
            </div>
            ${n.is_late_submission ? '<p class="text-sm text-warning-600">⚠ Late submission</p>' : ''}
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

  const allInternsLabel = profile.department_id
    ? `All Interns — ${profile.departments?.name || 'Department'}`
    : 'All Interns';

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Team Narratives</h1>
      <p class="page-subtitle">Daily narratives from your interns</p>
    </div>

    <div class="card mb-6">
      <div class="flex items-center gap-4">
        <div class="flex-1">
          <select id="filter-intern" class="form-input">
            <option value="">${allInternsLabel}</option>
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
  }, '/team-narratives');
}
