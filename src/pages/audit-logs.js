/**
 * Audit Logs Page (Admin)
 * Browse system audit trail with filters.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDateTime } from '../lib/utils.js';

const PAGE_SIZE = 50;

export async function renderAuditLogsPage() {
  let currentPage = 0;
  let actionFilter = '';
  let dateFrom = '';
  let dateTo = '';

  async function fetchLogs() {
    let query = supabase
      .from('audit_logs')
      .select('*, user:profiles!audit_logs_user_id_fkey(full_name, email)', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE - 1);

    if (actionFilter) query = query.ilike('action', `%${actionFilter}%`);
    if (dateFrom) query = query.gte('created_at', dateFrom);
    if (dateTo) query = query.lte('created_at', dateTo + 'T23:59:59');

    return query;
  }

  async function render() {
    const { data: logs, count } = await fetchLogs();
    const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

    renderLayout(`
      <div class="mb-6">
        <h1 class="text-2xl font-bold text-neutral-800">Audit Logs</h1>
        <p class="text-neutral-500 mt-1">System activity trail</p>
      </div>

      <!-- Filters -->
      <div class="card mb-6">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label class="form-label">Action</label>
            <input type="text" id="filter-action" class="form-input" placeholder="e.g., attendance.approved" value="${actionFilter}" />
          </div>
          <div>
            <label class="form-label">Date From</label>
            <input type="date" id="filter-from" class="form-input" value="${dateFrom}" />
          </div>
          <div>
            <label class="form-label">Date To</label>
            <input type="date" id="filter-to" class="form-input" value="${dateTo}" />
          </div>
          <div class="flex items-end">
            <button id="apply-filters" class="btn-primary w-full">
              ${icons.search}
              <span class="ml-2">Search</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="overflow-x-auto">
          <table class="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              ${(logs || []).map(log => `
                <tr>
                  <td class="whitespace-nowrap text-xs">${formatDateTime(log.created_at)}</td>
                  <td>${log.user?.full_name || log.user?.email || '—'}</td>
                  <td><code class="text-xs bg-neutral-100 px-1.5 py-0.5 rounded">${log.action}</code></td>
                  <td class="text-xs">${log.entity_type || '—'}${log.entity_id ? `<br/><span class="text-neutral-400">${log.entity_id.slice(0, 8)}…</span>` : ''}</td>
                  <td class="text-xs max-w-xs truncate">${log.metadata ? JSON.stringify(log.metadata).slice(0, 80) : '—'}</td>
                  <td class="text-xs text-neutral-400">${log.ip_address || '—'}</td>
                </tr>
              `).join('')}
              ${(logs || []).length === 0 ? '<tr><td colspan="6" class="text-center text-neutral-400 py-8">No logs found</td></tr>' : ''}
            </tbody>
          </table>
        </div>

        <!-- Pagination -->
        ${totalPages > 1 ? `
          <div class="flex items-center justify-between mt-4 pt-4 border-t border-neutral-200">
            <p class="text-sm text-neutral-500">${count} total records</p>
            <div class="flex gap-2">
              <button id="prev-page" class="btn-sm btn-secondary" ${currentPage === 0 ? 'disabled' : ''}>Previous</button>
              <span class="text-sm text-neutral-600 py-1 px-2">${currentPage + 1} / ${totalPages}</span>
              <button id="next-page" class="btn-sm btn-secondary" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
            </div>
          </div>
        ` : ''}
      </div>
    `, (el) => {
      el.querySelector('#apply-filters').addEventListener('click', () => {
        actionFilter = el.querySelector('#filter-action').value;
        dateFrom = el.querySelector('#filter-from').value;
        dateTo = el.querySelector('#filter-to').value;
        currentPage = 0;
        render();
      });

      el.querySelector('#prev-page')?.addEventListener('click', () => {
        if (currentPage > 0) { currentPage--; render(); }
      });

      el.querySelector('#next-page')?.addEventListener('click', () => {
        if (currentPage < totalPages - 1) { currentPage++; render(); }
      });
    }, '/audit-logs');
  }

  await render();
}
