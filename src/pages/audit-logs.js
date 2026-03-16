/**
 * Audit Logs Page (Admin)
 * Browse system audit trail with filters.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDateTime } from '../lib/utils.js';

const PAGE_SIZE = 50;

const ACTION_GROUPS = [
  {
    label: 'Attendance',
    actions: [
      'attendance.time_in',
      'attendance.time_out',
      'attendance.auto_submitted',
      'attendance.correction_requested',
      'attendance.admin_edited',
      'attendance.supervisor_filled_eod',
      'attendance.escalated_to_admin',
    ],
  },
  {
    label: 'Task',
    actions: [
      'task.created',
      'task.updated',
      'task.archived',
      'task.unarchived',
      'task.started',
      'task.self_submitted',
      'task.status_change_requested',
    ],
  },
  { label: 'Approval', actions: ['approval.approved', 'approval.rejected'] },
  {
    label: 'Allowance',
    actions: [
      'allowance.approved',
      'allowance.rejected',
      'allowance.rate_set',
      'allowance.individual_rates_set',
      'allowance.computed',
    ],
  },
  { label: 'Narrative', actions: ['narrative.submitted', 'narrative.resubmitted'] },
  {
    label: 'User',
    actions: [
      'user.invited',
      'user.updated',
      'user.activated',
      'user.deactivated',
      'intern.marked_voluntary',
    ],
  },
  { label: 'Profile', actions: ['profile.updated'] },
  {
    label: 'Department',
    actions: ['department.created', 'department.updated', 'department.deleted'],
  },
  {
    label: 'Location',
    actions: ['location.created', 'location.updated', 'location.deleted'],
  },
  {
    label: 'Holiday',
    actions: ['holiday.created', 'holiday.updated', 'holiday.deleted'],
  },
  { label: 'Settings', actions: ['settings.updated'] },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function weekLabel(start, end) {
  const y = end.getFullYear();
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${MONTHS[start.getMonth()]} ${y}`;
  }
  return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${y}`;
}

function generateWeekOptions() {
  const options = [{ label: 'All time', value: '' }];
  const today = new Date();
  const dow = today.getDay();
  const daysToMon = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysToMon);
  monday.setHours(0, 0, 0, 0);

  for (let i = 0; i < 16; i++) {
    const start = new Date(monday);
    start.setDate(monday.getDate() - i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const from = start.toISOString().slice(0, 10);
    const to = end.toISOString().slice(0, 10);
    const label =
      i === 0 ? `This week (${weekLabel(start, end)})`
      : i === 1 ? `Last week (${weekLabel(start, end)})`
      : weekLabel(start, end);
    options.push({ label, value: `${from}|${to}` });
  }
  return options;
}

function actionBadgeClass(action) {
  const suffix = action.split('.').pop();
  if (['deleted', 'deactivated', 'rejected'].includes(suffix)) return 'badge-danger';
  if (['created', 'approved', 'activated', 'invited', 'time_in', 'marked_voluntary'].includes(suffix)) return 'badge-success';
  if (['updated', 'admin_edited', 'resubmitted', 'filled_eod', 'computed', 'rate_set', 'time_out'].includes(suffix)) return 'badge-warning';
  if (['escalated_to_admin', 'status_change_requested', 'correction_requested', 'auto_submitted'].includes(suffix)) return 'badge-pending';
  const prefix = action.split('.')[0];
  const prefixMap = {
    attendance: 'badge-info',
    task: 'badge-primary',
    allowance: 'badge-warning',
    narrative: 'badge-secondary',
  };
  return prefixMap[prefix] || 'badge-secondary';
}

// Handles both legacy double-encoded strings and modern JSONB objects
function parseDetails(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return { value: raw }; }
}

function openDetailsModal(raw) {
  const details = parseDetails(raw);
  if (!details) return;
  const entries = Object.entries(details);

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width:28rem">
      <div class="modal-header">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
            ${icons.eye}
          </div>
          <div>
            <h3 class="font-semibold text-neutral-800">Log Details</h3>
            <p class="text-xs text-neutral-400">${entries.length} field${entries.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button class="close-modal-btn btn-ghost p-1.5">${icons.x}</button>
      </div>
      <div class="modal-body">
        ${entries.length === 0
          ? '<p class="text-sm text-neutral-400 text-center py-4">No details recorded.</p>'
          : `<div class="divide-y divide-neutral-100">
              ${entries.map(([key, value]) => `
                <div class="flex gap-4 py-3">
                  <span class="text-xs font-semibold text-neutral-400 uppercase tracking-wider w-32 shrink-0 pt-0.5">
                    ${key.replace(/_/g, ' ')}
                  </span>
                  <div class="text-sm text-neutral-800 break-all flex-1">
                    ${value === null || value === undefined
                      ? '<em class="text-neutral-300 font-sans text-xs">null</em>'
                      : typeof value === 'object'
                        ? `<pre class="text-xs bg-neutral-50 border border-neutral-200 rounded-lg p-2.5 overflow-x-auto whitespace-pre-wrap font-mono">${JSON.stringify(value, null, 2)}</pre>`
                        : `<span class="font-mono text-xs">${String(value)}</span>`}
                  </div>
                </div>
              `).join('')}
            </div>`}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.close-modal-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
}

export async function renderAuditLogsPage() {
  let currentPage = 0;
  let actionFilter = '';
  let weekFilter = '';
  let userFilter = '';

  const weekOptions = generateWeekOptions();

  // Fetch all users for the dropdown filter
  const { data: allUsers } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .order('full_name');

  function getDateRange() {
    if (!weekFilter) return { from: '', to: '' };
    const [from, to] = weekFilter.split('|');
    return { from, to };
  }

  async function fetchLogs() {
    const { from, to } = getDateRange();
    let query = supabase
      .from('audit_logs')
      .select('*, user:profiles!audit_logs_user_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (actionFilter) query = query.eq('action', actionFilter);
    if (userFilter) query = query.eq('user_id', userFilter);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to + 'T23:59:59');

    return query;
  }

  async function render() {
    const { data: logs, count } = await fetchLogs();
    const totalPages = Math.ceil((count || 0) / PAGE_SIZE);
    const startEntry = count ? currentPage * PAGE_SIZE + 1 : 0;
    const endEntry = Math.min((currentPage + 1) * PAGE_SIZE, count || 0);
    const hasFilters = actionFilter || weekFilter || userFilter;

    renderLayout(`
      <!-- Page Header -->
      <div class="page-header animate-fade-in-up">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 class="page-title">Audit Logs</h1>
            <p class="page-subtitle">Complete system activity trail for compliance and transparency</p>
          </div>
          <div class="badge badge-secondary text-sm px-3 py-2 mt-1">
            ${icons.audit}
            <span class="ml-1.5">${(count ?? 0).toLocaleString()} total logs</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card mb-6 animate-fade-in-up" style="animation-delay:60ms">
        <div class="flex items-center gap-2 mb-4">
          <span class="text-neutral-400">${icons.filter}</span>
          <span class="text-sm font-semibold text-neutral-700">Filters</span>
          ${hasFilters ? `<span class="badge badge-primary ml-auto">Active</span>` : ''}
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label class="form-label">Action Type</label>
            <select id="filter-action" class="form-input">
              <option value="">All action types</option>
              ${ACTION_GROUPS.map(group => `
                <optgroup label="── ${group.label}">
                  ${group.actions.map(action => `
                    <option value="${action}" ${actionFilter === action ? 'selected' : ''}>${action}</option>
                  `).join('')}
                </optgroup>
              `).join('')}
            </select>
          </div>

          <div>
            <label class="form-label">User</label>
            <select id="filter-user" class="form-input">
              <option value="">All users</option>
              ${(allUsers || []).map(u => `
                <option value="${u.id}" ${userFilter === u.id ? 'selected' : ''}>
                  ${u.full_name || u.email}
                </option>
              `).join('')}
            </select>
          </div>

          <div>
            <label class="form-label">Week</label>
            <select id="filter-week" class="form-input">
              ${weekOptions.map(w => `
                <option value="${w.value}" ${weekFilter === w.value ? 'selected' : ''}>${w.label}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="flex items-center justify-end gap-2">
          ${hasFilters ? `
            <button id="clear-filters" class="btn-secondary btn-sm inline-flex items-center gap-1.5">
              ${icons.x}
              <span>Clear</span>
            </button>
          ` : ''}
          <button id="apply-filters" class="btn-primary btn-sm inline-flex items-center gap-1.5">
            ${icons.search}
            <span>Apply filters</span>
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="card animate-fade-in-up" style="animation-delay:120ms">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              ${(logs || []).map((log, i) => {
                const details = parseDetails(log.details);
                const hasDetails = details && Object.keys(details).length > 0;
                return `
                  <tr>
                    <td class="whitespace-nowrap align-top">
                      <span class="text-xs font-medium text-neutral-700">${formatDateTime(log.created_at)}</span>
                    </td>
                    <td class="align-top">
                      <div class="text-sm font-medium text-neutral-800">${log.user?.full_name || '—'}</div>
                      ${log.user?.email ? `<div class="text-xs text-neutral-400 mt-0.5">${log.user.email}</div>` : ''}
                    </td>
                    <td class="align-top">
                      <span class="badge ${actionBadgeClass(log.action)} text-xs">
                        ${log.action}
                      </span>
                    </td>
                    <td class="align-top">
                      <div class="text-xs font-semibold text-neutral-700">${log.entity_type || '—'}</div>
                      ${log.entity_id
                        ? `<div class="text-xs text-neutral-400 font-mono mt-0.5">${log.entity_id.slice(0, 8)}…</div>`
                        : ''}
                    </td>
                    <td class="align-top">
                      ${hasDetails
                        ? `<button class="view-details-btn inline-flex items-center gap-1.5 text-xs text-primary-600 hover:text-primary-800 font-semibold transition-colors" data-idx="${i}">
                            ${icons.eye}
                            <span>View</span>
                          </button>`
                        : `<span class="text-neutral-300 text-xs">—</span>`}
                    </td>
                    <!-- IP Address column (hidden by default)
                    <td class="align-top">
                      ${log.ip_address
                        ? `<span class="font-mono text-xs bg-neutral-100 border border-neutral-200 text-neutral-700 px-2 py-1 rounded-lg inline-block">${log.ip_address}</span>`
                        : `<span class="text-neutral-300 text-xs">—</span>`}
                    </td> -->
                  </tr>
                `;
              }).join('')}

              ${(logs || []).length === 0 ? `
                <tr>
                  <td colspan="6" class="py-0 px-0">
                    <div class="empty-state">
                      ${icons.audit}
                      <p class="empty-state-title">No logs found</p>
                      <p class="empty-state-desc">
                        ${hasFilters ? 'No records match your current filters. Try adjusting them.' : 'No activity has been recorded yet.'}
                      </p>
                      ${hasFilters ? `<button id="clear-from-empty" class="btn-secondary btn-sm mt-4">${icons.x} <span class="ml-1.5">Clear filters</span></button>` : ''}
                    </div>
                  </td>
                </tr>
              ` : ''}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mt-5 pt-4 border-t border-neutral-100">
          <p class="text-sm text-neutral-500">
            ${count
              ? `Showing <strong class="text-neutral-700">${startEntry.toLocaleString()}–${endEntry.toLocaleString()}</strong> of <strong class="text-neutral-700">${count.toLocaleString()}</strong> records`
              : '<span class="text-neutral-400">No records found</span>'}
          </p>
          ${totalPages > 1 ? `
            <div class="flex items-center gap-1.5">
              <button id="first-page" class="btn-sm btn-secondary px-2.5" title="First page" ${currentPage === 0 ? 'disabled' : ''}>«</button>
              <button id="prev-page" class="btn-sm btn-secondary" ${currentPage === 0 ? 'disabled' : ''}>‹ Prev</button>
              <span class="text-xs font-semibold text-primary-700 bg-primary-50 border border-primary-200 px-3 py-1.5 rounded-lg">
                ${currentPage + 1} / ${totalPages}
              </span>
              <button id="next-page" class="btn-sm btn-secondary" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next ›</button>
              <button id="last-page" class="btn-sm btn-secondary px-2.5" title="Last page" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>»</button>
            </div>
          ` : ''}
        </div>
      </div>
    `, (el) => {
      el.querySelector('#apply-filters').addEventListener('click', () => {
        actionFilter = el.querySelector('#filter-action').value;
        userFilter = el.querySelector('#filter-user').value;
        weekFilter = el.querySelector('#filter-week').value;
        currentPage = 0;
        render();
      });

      const clearFilters = () => {
        actionFilter = '';
        userFilter = '';
        weekFilter = '';
        currentPage = 0;
        render();
      };
      el.querySelector('#clear-filters')?.addEventListener('click', clearFilters);
      el.querySelector('#clear-from-empty')?.addEventListener('click', clearFilters);

      el.querySelector('#first-page')?.addEventListener('click', () => { currentPage = 0; render(); });
      el.querySelector('#prev-page')?.addEventListener('click', () => { if (currentPage > 0) { currentPage--; render(); } });
      el.querySelector('#next-page')?.addEventListener('click', () => { if (currentPage < totalPages - 1) { currentPage++; render(); } });
      el.querySelector('#last-page')?.addEventListener('click', () => { currentPage = totalPages - 1; render(); });

      el.querySelectorAll('.view-details-btn').forEach(btn => {
        btn.addEventListener('click', () => openDetailsModal(logs[parseInt(btn.dataset.idx, 10)].details));
      });
    }, '/audit-logs');
  }

  await render();
}
