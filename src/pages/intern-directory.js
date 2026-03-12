/**
 * Intern Directory Page (HR)
 * View and search all interns with OJT progress.
 */
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, debounce, renderAvatar, computeEstimatedEndDate } from '../lib/utils.js';

export async function renderInternDirectoryPage() {
  const { data: interns } = await supabase
    .from('profiles')
    .select('*, department:departments(name), location:locations(name)')
    .eq('role', 'intern')
    .order('full_name');

  // Fetch supervisors separately to avoid self-referencing FK join issues
  const supervisorIds = [...new Set((interns || []).map(i => i.supervisor_id).filter(Boolean))];
  let supervisorMap = {};
  if (supervisorIds.length > 0) {
    const { data: supervisors } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', supervisorIds);
    (supervisors || []).forEach(s => { supervisorMap[s.id] = s.full_name; });
  }

  // Fetch hours and days worked per intern (approved attendance)
  const internIds = (interns || []).map(i => i.id);
  let hoursMap = {};
  let daysWorkedMap = {};
  if (internIds.length > 0) {
    const { data: attendance } = await supabase
      .from('attendance_records')
      .select('intern_id, total_hours, date')
      .in('intern_id', internIds)
      .eq('status', 'approved');
    (attendance || []).forEach(r => {
      hoursMap[r.intern_id] = (hoursMap[r.intern_id] || 0) + (r.total_hours || 0);
      if (!daysWorkedMap[r.intern_id]) daysWorkedMap[r.intern_id] = new Set();
      daysWorkedMap[r.intern_id].add(r.date);
    });
  }

  let searchTerm = '';
  let statusFilter = '';

  function getFiltered() {
    let list = interns || [];
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      list = list.filter(i => i.full_name?.toLowerCase().includes(q) || i.email?.toLowerCase().includes(q) || i.school?.toLowerCase().includes(q));
    }
    if (statusFilter === 'active') list = list.filter(i => i.is_active);
    if (statusFilter === 'inactive') list = list.filter(i => !i.is_active);
    return list;
  }

  function renderContent(el) {
    const filtered = getFiltered();
    const container = el.querySelector('#intern-grid');

    if (filtered.length === 0) {
      container.innerHTML = '<div class="col-span-full text-center text-neutral-400 py-12">No interns found</div>';
      el.querySelector('#intern-count').textContent = '0 interns';
      return;
    }

    container.innerHTML = filtered.map(i => {
      const completed = hoursMap[i.id] || 0;
      const required = i.hours_required || 500;
      const pct = Math.min(100, (completed / required) * 100);
      const daysWorked = daysWorkedMap[i.id] ? daysWorkedMap[i.id].size : 0;
      const estEnd = computeEstimatedEndDate(required, completed, daysWorked);

      return `
        <div class="card">
          <div class="flex items-center gap-3 mb-3">
            ${renderAvatar(i, 'w-10 h-10', 'text-sm')}
            <div class="flex-1 min-w-0">
              <h4 class="font-medium text-neutral-900 truncate">${i.full_name}</h4>
              <p class="text-xs text-neutral-400 truncate">${i.email}</p>
            </div>
            <span class="badge-${i.is_active ? 'success' : 'danger'} text-xs">${i.is_active ? 'Active' : 'Inactive'}</span>
          </div>
          <div class="space-y-1 text-sm text-neutral-600">
            ${i.school ? `<p>${icons.building} ${i.school}</p>` : ''}
            ${i.course ? `<p>Course: ${i.course}</p>` : ''}
            ${i.department?.name ? `<p>Dept: ${i.department.name}</p>` : ''}
            ${i.location?.name ? `<p>${icons.location} ${i.location.name}</p>` : ''}
            ${supervisorMap[i.supervisor_id] ? `<p>Supervisor: ${supervisorMap[i.supervisor_id]}</p>` : ''}
            ${i.ojt_start_date ? `<p>${icons.calendar} ${formatDate(i.ojt_start_date)} – ${formatDate(i.ojt_end_date)}</p>` : ''}
          </div>
          <div class="mt-3 pt-3 border-t border-neutral-200">
            <div class="flex justify-between text-xs mb-1">
              <span>OJT Progress</span>
              <span>${pct.toFixed(1)}%</span>
            </div>
            <div class="progress-bar-track">
              <div class="progress-bar-fill" style="width: ${pct.toFixed(1)}%"></div>
            </div>
            <p class="text-xs text-neutral-400 mt-1">${formatHoursDisplay(completed)} / ${formatHoursDisplay(required)}</p>
            ${estEnd ? `<p class="text-xs text-primary-500 mt-1">${icons.calendar} Est. completion: ${formatDate(estEnd)}</p>` : completed >= required && required > 0 ? `<p class="text-xs text-success-500 mt-1">✅ Completed</p>` : ''}
          </div>
        </div>
      `;
    }).join('');

    el.querySelector('#intern-count').textContent = `${filtered.length} intern${filtered.length !== 1 ? 's' : ''}`;
  }

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">Intern Directory</h1>
      <p class="page-subtitle">All registered interns and their OJT progress</p>
    </div>

    <div class="card mb-6">
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex-1 min-w-50">
          <div class="relative">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">${icons.search}</span>
            <input type="text" id="search-intern" class="form-input pl-10" placeholder="Search by name, email, school..." />
          </div>
        </div>
        <select id="filter-status" class="form-input w-auto">
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <p class="text-sm text-neutral-500" id="intern-count">${(interns || []).length} interns</p>
      </div>
    </div>

    <div id="intern-grid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>
  `, (el) => {
    renderContent(el);

    const debouncedSearch = debounce(() => renderContent(el), 300);
    el.querySelector('#search-intern').addEventListener('input', (e) => {
      searchTerm = e.target.value;
      debouncedSearch();
    });
    el.querySelector('#filter-status').addEventListener('change', (e) => {
      statusFilter = e.target.value;
      renderContent(el);
    });
  }, '/intern-directory');
}
