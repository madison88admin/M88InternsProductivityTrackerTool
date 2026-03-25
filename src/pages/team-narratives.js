/**
 * Team Narratives Page (Supervisor / Admin with department)
 * View daily narratives submitted by assigned interns.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatDateTime, formatHoursDisplay, truncate, formatDateKey } from '../lib/utils.js';
import { createModal } from '../lib/component.js';
import { showToast } from '../lib/toast.js';

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

  // Generate date range options
  const dateRangeOptions = [
    { value: '7', label: 'Last 7 Days' },
    { value: '14', label: 'Last 14 Days' },
    { value: '30', label: 'Last 30 Days' },
    { value: '60', label: 'Last 60 Days' },
    { value: '90', label: 'Last 90 Days' },
    { value: 'all', label: 'All Time' },
  ];

  // Filter state
  let selectedIntern = '';
  let selectedStatus = '';
  let selectedSession = '';
  let selectedDateRange = '30'; // Default to last 30 days
  let showLateOnly = false;
  let narratives = [];

  async function loadNarratives() {
    if (internIds.length === 0) {
      narratives = [];
      return;
    }

    let query = supabase
      .from('narratives')
      .select('*, intern:profiles!narratives_intern_id_fkey(full_name), task:tasks(title)')
      .in('intern_id', internIds)
      .neq('status', 'draft')  // Hide drafts from supervisors
      .order('date', { ascending: false });

    // Apply date range filter
    if (selectedDateRange !== 'all') {
      const daysAgo = parseInt(selectedDateRange);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysAgo);
      query = query.gte('date', formatDateKey(cutoffDate));
    }

    const { data } = await query.limit(500);
    narratives = data || [];
  }

  // Load initial narratives
  await loadNarratives();

  function getFiltered() {
    let filtered = narratives;
    if (selectedIntern) filtered = filtered.filter(n => n.intern_id === selectedIntern);
    if (selectedStatus) filtered = filtered.filter(n => n.status === selectedStatus);
    if (selectedSession) filtered = filtered.filter(n => n.session === selectedSession);
    if (showLateOnly) filtered = filtered.filter(n => n.is_late_submission);
    return filtered;
  }

  function getStats(records) {
    const totalHours = records.reduce((sum, n) => sum + (n.hours || 0), 0);
    return {
      total: records.length,
      pending: records.filter(n => n.status === 'pending').length,
      approved: records.filter(n => n.status === 'approved').length,
      rejected: records.filter(n => n.status === 'rejected').length,
      late: records.filter(n => n.is_late_submission).length,
      avgHours: records.length > 0 ? (totalHours / records.length).toFixed(1) : 0,
    };
  }

  function renderContent(el) {
    const filtered = getFiltered();
    const stats = getStats(filtered);
    const container = el.querySelector('#narratives-list');

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="card">
          <div class="text-center text-neutral-400 py-16">
            <div class="flex flex-col items-center gap-3">
              <svg class="w-16 h-16 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <p class="text-lg font-medium">No narratives found</p>
              <p class="text-sm">Try adjusting your filters to see more results</p>
            </div>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="space-y-3">
          ${filtered.map(n => {
            const sessionColors = {
              'am': 'bg-blue-100 text-blue-700',
              'pm': 'bg-purple-100 text-purple-700',
              'eod': 'bg-green-100 text-green-700'
            };
            const sessionColor = sessionColors[n.session] || 'bg-neutral-100 text-neutral-600';

            return `
              <div class="card hover:shadow-md transition-all cursor-pointer narrative-card group" data-id="${n.id}">
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-3 mb-2 flex-wrap">
                      <div class="flex items-center gap-2">
                        <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
                        </svg>
                        <span class="font-semibold text-neutral-900">${n.intern?.full_name || '—'}</span>
                      </div>
                      <div class="flex items-center gap-2 text-neutral-500">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                        </svg>
                        <span class="text-sm font-medium">${formatDate(n.date)}</span>
                      </div>
                      ${n.session ? `<span class="badge ${sessionColor} text-xs font-medium uppercase tracking-wide">${n.session}</span>` : ''}
                      ${n.hours ? `
                        <div class="flex items-center gap-1 text-xs text-neutral-500">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          <span class="font-medium">${formatHoursDisplay(n.hours)}</span>
                        </div>
                      ` : ''}
                    </div>
                    ${n.task?.title ? `
                      <div class="flex items-center gap-1 mb-2 text-sm text-primary-600">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                        </svg>
                        <span class="font-medium">${truncate(n.task.title, 60)}</span>
                      </div>
                    ` : ''}
                    <p class="text-sm text-neutral-600 leading-relaxed line-clamp-2">${truncate(n.content?.replace(/<[^>]*>/g, '') || '', 200)}</p>
                  </div>
                  <div class="flex flex-col items-end gap-2">
                    <span class="badge-${n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'danger' : 'pending'} text-xs capitalize whitespace-nowrap">${n.status}</span>
                    ${n.is_late_submission ? '<span class="badge-warning text-xs whitespace-nowrap">Late</span>' : ''}
                    <svg class="w-5 h-5 text-neutral-400 group-hover:text-primary-600 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

      // click to view full
      container.querySelectorAll('.narrative-card').forEach(card => {
        card.addEventListener('click', () => {
          const n = filtered.find(x => x.id === card.dataset.id);
          if (!n) return;

          const sessionColors = {
            'am': 'bg-blue-100 text-blue-700',
            'pm': 'bg-purple-100 text-purple-700',
            'eod': 'bg-green-100 text-green-700'
          };
          const sessionColor = sessionColors[n.session] || 'bg-neutral-100 text-neutral-600';

          createModal(`
            <div class="flex items-center gap-3">
              <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <div>
                <h3 class="font-semibold text-lg">${n.intern?.full_name}</h3>
                <p class="text-sm text-neutral-500">${formatDate(n.date)}</p>
              </div>
            </div>
          `, `
            <div class="space-y-4">
              <!-- Metadata -->
              <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-neutral-50 rounded-lg">
                <div>
                  <p class="text-xs text-neutral-500 uppercase tracking-wide mb-1">Status</p>
                  <span class="badge-${n.status === 'approved' ? 'success' : n.status === 'rejected' ? 'danger' : 'pending'} text-sm capitalize">${n.status}</span>
                </div>
                ${n.session ? `
                  <div>
                    <p class="text-xs text-neutral-500 uppercase tracking-wide mb-1">Session</p>
                    <span class="badge ${sessionColor} text-sm uppercase">${n.session}</span>
                  </div>
                ` : ''}
                ${n.hours ? `
                  <div>
                    <p class="text-xs text-neutral-500 uppercase tracking-wide mb-1">Hours</p>
                    <p class="text-sm font-semibold text-neutral-900">${formatHoursDisplay(n.hours)}</p>
                  </div>
                ` : ''}
                ${n.is_late_submission ? `
                  <div>
                    <p class="text-xs text-neutral-500 uppercase tracking-wide mb-1">Submission</p>
                    <span class="badge-warning text-sm">Late</span>
                  </div>
                ` : ''}
              </div>

              ${n.task?.title ? `
                <div class="p-4 bg-primary-50 border border-primary-200 rounded-lg">
                  <p class="text-xs text-primary-600 uppercase tracking-wide mb-1">Associated Task</p>
                  <p class="text-sm font-medium text-primary-900">${n.task.title}</p>
                </div>
              ` : ''}

              ${n.rejection_reason ? `
                <div class="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p class="text-xs text-red-600 uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p class="text-sm text-red-900">${n.rejection_reason}</p>
                </div>
              ` : ''}

              <!-- Content -->
              <div>
                <p class="text-xs text-neutral-500 uppercase tracking-wide mb-2">Narrative Content</p>
                <div class="prose prose-sm max-w-none border border-neutral-200 rounded-lg p-4 bg-white">
                  ${n.content || '<em class="text-neutral-400">No content provided</em>'}
                </div>
              </div>

              <!-- Timestamp -->
              <div class="flex items-center gap-2 text-xs text-neutral-400">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>Submitted: ${formatDateTime(n.submitted_at || n.created_at)}</span>
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-neutral-200">
              <button id="close-narrative" class="btn-secondary">Close</button>
            </div>
          `, (el, close) => {
            el.querySelector('#close-narrative').addEventListener('click', close);
          });
        });
      });
    }

    // Update stats cards
    el.querySelector('#stat-total').textContent = stats.total;
    el.querySelector('#stat-pending').textContent = stats.pending;
    el.querySelector('#stat-approved').textContent = stats.approved;
    el.querySelector('#stat-rejected').textContent = stats.rejected;
    el.querySelector('#stat-late').textContent = stats.late;
    el.querySelector('#stat-avg-hours').textContent = stats.avgHours + ' hrs';
  }

  const allInternsLabel = profile.department_id
    ? `All Interns — ${profile.departments?.name || 'Department'}`
    : 'All Interns';

  const stats = getStats(narratives);

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <div class="flex items-center gap-3">
        <div class="w-12 h-12 bg-linear-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg">
          <svg class="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
        </div>
        <div>
          <h1 class="page-title mb-1">Team Narratives</h1>
          <p class="page-subtitle text-sm">Review and monitor daily narratives from your interns</p>
        </div>
      </div>
    </div>

    <!-- Statistics Cards -->
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6 animate-fade-in-up" style="animation-delay: 0.1s;">
      <div class="card bg-linear-to-br from-blue-50 to-blue-100 border-blue-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-blue-600 uppercase tracking-wide">Total</p>
            <p class="text-2xl font-bold text-blue-900 mt-1" id="stat-total">${stats.total}</p>
          </div>
          <div class="w-10 h-10 bg-blue-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-yellow-50 to-yellow-100 border-yellow-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-yellow-600 uppercase tracking-wide">Pending</p>
            <p class="text-2xl font-bold text-yellow-900 mt-1" id="stat-pending">${stats.pending}</p>
          </div>
          <div class="w-10 h-10 bg-yellow-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-green-50 to-green-100 border-green-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-green-600 uppercase tracking-wide">Approved</p>
            <p class="text-2xl font-bold text-green-900 mt-1" id="stat-approved">${stats.approved}</p>
          </div>
          <div class="w-10 h-10 bg-green-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-red-50 to-red-100 border-red-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-red-600 uppercase tracking-wide">Rejected</p>
            <p class="text-2xl font-bold text-red-900 mt-1" id="stat-rejected">${stats.rejected}</p>
          </div>
          <div class="w-10 h-10 bg-red-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-orange-50 to-orange-100 border-orange-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-orange-600 uppercase tracking-wide">Late</p>
            <p class="text-2xl font-bold text-orange-900 mt-1" id="stat-late">${stats.late}</p>
          </div>
          <div class="w-10 h-10 bg-orange-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
          </div>
        </div>
      </div>

      <div class="card bg-linear-to-br from-purple-50 to-purple-100 border-purple-200">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-xs font-medium text-purple-600 uppercase tracking-wide">Avg Hours</p>
            <p class="text-2xl font-bold text-purple-900 mt-1" id="stat-avg-hours">${stats.avgHours} hrs</p>
          </div>
          <div class="w-10 h-10 bg-purple-200 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
            </svg>
          </div>
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card mb-6 animate-fade-in-up" style="animation-delay: 0.2s;">
      <div class="flex items-center gap-2 mb-4 pb-4 border-b border-neutral-200">
        <svg class="w-5 h-5 text-neutral-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path>
        </svg>
        <h2 class="text-lg font-semibold text-neutral-800">Filters & Options</h2>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
            </svg>
            <span>Date Range</span>
          </label>
          <select id="filter-date-range" class="form-input font-medium">
            ${dateRangeOptions.map(opt => `<option value="${opt.value}" ${opt.value === selectedDateRange ? 'selected' : ''}>${opt.label}</option>`).join('')}
          </select>
          <p class="text-xs text-neutral-500 mt-1">Select time period</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path>
            </svg>
            <span>Intern</span>
          </label>
          <select id="filter-intern" class="form-input">
            <option value="">${allInternsLabel}</option>
            ${(interns || []).map(i => `<option value="${i.id}">${i.full_name}</option>`).join('')}
          </select>
          <p class="text-xs text-neutral-500 mt-1">Filter by intern name</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span>Status</span>
          </label>
          <select id="filter-status" class="form-input">
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <p class="text-xs text-neutral-500 mt-1">Filter by approval status</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707"></path>
            </svg>
            <span>Session</span>
          </label>
          <select id="filter-session" class="form-input">
            <option value="">All Sessions</option>
            <option value="am">AM</option>
            <option value="pm">PM</option>
            <option value="eod">EOD</option>
          </select>
          <p class="text-xs text-neutral-500 mt-1">Filter by session type</p>
        </div>

        <div>
          <label class="form-label flex items-center gap-2">
            <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <span>Late Submissions</span>
          </label>
          <label class="flex items-center gap-2 mt-2 cursor-pointer">
            <input type="checkbox" id="filter-late" class="w-4 h-4 text-primary-600 border-neutral-300 rounded focus:ring-primary-500">
            <span class="text-sm text-neutral-700">Show late only</span>
          </label>
          <p class="text-xs text-neutral-500 mt-1">Filter late submissions</p>
        </div>

        <div class="flex items-end">
          <button id="reset-filters" class="btn-secondary w-full">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Reset Filters
          </button>
        </div>
      </div>
    </div>

    <!-- Loading Indicator -->
    <div id="loading-indicator" class="hidden text-center py-8">
      <div class="inline-flex items-center gap-2 text-primary-600">
        <svg class="animate-spin w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
        </svg>
        <span class="font-medium">Loading narratives...</span>
      </div>
    </div>

    <!-- Narratives List -->
    <div id="narratives-list" class="animate-fade-in-up" style="animation-delay: 0.3s;"></div>
  `, (el) => {
    renderContent(el);

    // Date range filter change handler (requires reload)
    el.querySelector('#filter-date-range').addEventListener('change', async (e) => {
      selectedDateRange = e.target.value;
      const loadingIndicator = el.querySelector('#loading-indicator');
      const narrativesList = el.querySelector('#narratives-list');

      loadingIndicator.classList.remove('hidden');
      narrativesList.classList.add('hidden');

      await loadNarratives();
      renderContent(el);

      loadingIndicator.classList.add('hidden');
      narrativesList.classList.remove('hidden');

      const label = dateRangeOptions.find(opt => opt.value === selectedDateRange)?.label || 'selected period';
      showToast(`Loaded narratives for ${label}`, 'success');
    });

    // Intern filter change handler
    el.querySelector('#filter-intern').addEventListener('change', (e) => {
      selectedIntern = e.target.value;
      renderContent(el);
    });

    // Status filter change handler
    el.querySelector('#filter-status').addEventListener('change', (e) => {
      selectedStatus = e.target.value;
      renderContent(el);
    });

    // Session filter change handler
    el.querySelector('#filter-session').addEventListener('change', (e) => {
      selectedSession = e.target.value;
      renderContent(el);
    });

    // Late filter change handler
    el.querySelector('#filter-late').addEventListener('change', (e) => {
      showLateOnly = e.target.checked;
      renderContent(el);
    });

    // Reset filters button
    el.querySelector('#reset-filters').addEventListener('click', async () => {
      selectedDateRange = '30';
      selectedIntern = '';
      selectedStatus = '';
      selectedSession = '';
      showLateOnly = false;

      el.querySelector('#filter-date-range').value = '30';
      el.querySelector('#filter-intern').value = '';
      el.querySelector('#filter-status').value = '';
      el.querySelector('#filter-session').value = '';
      el.querySelector('#filter-late').checked = false;

      const loadingIndicator = el.querySelector('#loading-indicator');
      const narrativesList = el.querySelector('#narratives-list');

      loadingIndicator.classList.remove('hidden');
      narrativesList.classList.add('hidden');

      await loadNarratives();
      renderContent(el);

      loadingIndicator.classList.add('hidden');
      narrativesList.classList.remove('hidden');

      showToast('Filters reset to defaults', 'success');
    });
  }, '/team-narratives');
}
