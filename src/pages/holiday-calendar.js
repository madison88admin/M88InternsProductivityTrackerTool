/**
 * Holiday Calendar Page (Admin)
 * Manage company-wide holiday dates that block intern activities.
 */
import { getProfile } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate } from '../lib/utils.js';
import { createModal, confirmDialog } from '../lib/component.js';
import { getHolidaysForMonth, invalidateHolidayCache } from '../lib/holidays.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const DAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export async function renderHolidayCalendarPage() {
  const profile = getProfile();
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();

  const todayStr = new Date().toISOString().slice(0, 10);

  // Fetch upcoming holidays for the sidebar list
  const { data: upcomingHolidays } = await supabase
    .from('holidays')
    .select('*')
    .gte('date', todayStr)
    .order('date')
    .limit(10);

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <div>
        <h1 class="page-title">Holiday Calendar</h1>
        <p class="page-subtitle">Manage company holidays — interns cannot log work on these dates</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Calendar -->
      <div class="lg:col-span-2 card">
        <div class="flex items-center justify-between mb-4">
          <button id="prev-month" class="btn-secondary btn-sm flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Prev
          </button>
          <h3 id="month-label" class="text-lg font-bold text-neutral-900"></h3>
          <div class="flex gap-2">
            <button id="today-btn" class="btn-secondary btn-sm">Today</button>
            <button id="next-month" class="btn-secondary btn-sm flex items-center gap-1">
              Next
              ${icons.chevronRight}
            </button>
          </div>
        </div>
        <div id="calendar-grid"></div>
      </div>

      <!-- Upcoming Holidays -->
      <div class="card">
        <h3 class="text-base font-bold text-neutral-900 mb-4">Upcoming Holidays</h3>
        <div id="upcoming-list" class="space-y-3">
          ${renderUpcomingList(upcomingHolidays)}
        </div>
      </div>
    </div>
  `, async (el) => {
    await renderCalendar(el, currentYear, currentMonth, profile);

    el.querySelector('#prev-month').addEventListener('click', async () => {
      currentMonth--;
      if (currentMonth < 0) { currentMonth = 11; currentYear--; }
      await renderCalendar(el, currentYear, currentMonth, profile);
    });

    el.querySelector('#next-month').addEventListener('click', async () => {
      currentMonth++;
      if (currentMonth > 11) { currentMonth = 0; currentYear++; }
      await renderCalendar(el, currentYear, currentMonth, profile);
    });

    el.querySelector('#today-btn').addEventListener('click', async () => {
      currentYear = new Date().getFullYear();
      currentMonth = new Date().getMonth();
      await renderCalendar(el, currentYear, currentMonth, profile);
    });

    bindUpcomingDeleteButtons(el);
  }, '/holiday-calendar');
}

/**
 * Render the calendar grid for a given month.
 */
async function renderCalendar(el, year, month, profile) {
  const label = el.querySelector('#month-label');
  label.textContent = `${MONTH_NAMES[month]} ${year}`;

  const holidays = await getHolidaysForMonth(year, month);
  const grid = el.querySelector('#calendar-grid');

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().slice(0, 10);

  let html = '<div class="grid grid-cols-7 gap-1 mb-1">';
  DAY_HEADERS.forEach(d => {
    html += `<div class="text-center text-xs font-semibold text-neutral-500 py-2">${d}</div>`;
  });
  html += '</div><div class="grid grid-cols-7 gap-1">';

  // Empty cells before the 1st
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="min-h-17.5"></div>';
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const holidayName = holidays.get(dateStr);
    const isHoliday = !!holidayName;

    html += `
      <div class="calendar-day p-2 min-h-17.5 border rounded-lg cursor-pointer transition-colors
        ${isHoliday ? 'bg-danger-50 border-danger-200 hover:bg-danger-100' : 'border-neutral-100 hover:bg-primary-50'}
        ${isToday ? 'ring-2 ring-primary-500' : ''}"
        data-date="${dateStr}" data-holiday="${holidayName || ''}">
        <span class="text-sm font-medium ${isToday ? 'text-primary-600' : 'text-neutral-700'}">${day}</span>
        ${isHoliday ? `<p class="text-xs text-danger-600 mt-1 truncate font-medium">${holidayName}</p>` : ''}
      </div>
    `;
  }

  html += '</div>';
  grid.innerHTML = html;

  // Bind click on each day cell
  grid.querySelectorAll('.calendar-day').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const existingHoliday = cell.dataset.holiday;
      if (existingHoliday) {
        openEditHolidayModal(date, existingHoliday, profile);
      } else {
        openAddHolidayModal(date, profile);
      }
    });
  });
}

/**
 * Render the upcoming holidays sidebar list.
 */
function renderUpcomingList(holidays) {
  if (!holidays || holidays.length === 0) {
    return '<p class="text-sm text-neutral-400 text-center py-4">No upcoming holidays</p>';
  }
  return holidays.map(h => `
    <div class="flex items-center justify-between p-3 rounded-lg bg-neutral-50 border border-neutral-100">
      <div>
        <p class="text-sm font-semibold text-neutral-800">${h.name}</p>
        <p class="text-xs text-neutral-400">${formatDate(h.date)}</p>
      </div>
      <button class="btn-sm btn-danger delete-holiday-btn" data-id="${h.id}" data-name="${h.name}" data-date="${h.date}">
        ${icons.trash}
      </button>
    </div>
  `).join('');
}

/**
 * Bind delete buttons in the upcoming holidays list.
 */
function bindUpcomingDeleteButtons(el) {
  el.querySelectorAll('.delete-holiday-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmDialog(
        `Remove holiday "${btn.dataset.name}" on ${formatDate(btn.dataset.date)}?`,
        async () => {
          try {
            const { error } = await supabase.from('holidays').delete().eq('id', btn.dataset.id);
            if (error) throw error;
            invalidateHolidayCache();
            await logAudit('holiday.deleted', 'holiday', btn.dataset.id, { date: btn.dataset.date, name: btn.dataset.name });
            showToast('Holiday removed', 'success');
            renderHolidayCalendarPage();
          } catch (err) {
            showToast(err.message || 'Failed to remove holiday', 'error');
          }
        },
        'Remove'
      );
    });
  });
}

/**
 * Open modal to add a holiday on the given date.
 */
function openAddHolidayModal(dateString, profile) {
  createModal('Add Holiday', `
    <form id="holiday-form" class="space-y-4">
      <div>
        <label class="form-label">Date</label>
        <p class="text-sm font-medium text-neutral-700">${formatDate(dateString)}</p>
      </div>
      <div>
        <label class="form-label">Holiday Name <span class="text-danger-500">*</span></label>
        <input type="text" id="holiday-name" class="form-input" placeholder="e.g., New Year's Day" required />
      </div>
      <div class="flex justify-end gap-3 pt-2">
        <button type="button" id="holiday-cancel" class="btn-secondary">Cancel</button>
        <button type="submit" class="btn-primary">Add Holiday</button>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#holiday-cancel').addEventListener('click', close);
    el.querySelector('#holiday-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = el.querySelector('#holiday-name').value.trim();
      if (!name) { showToast('Please enter a holiday name', 'error'); return; }
      try {
        const { data, error } = await supabase.from('holidays').insert({
          date: dateString,
          name,
          created_by: profile.id,
        }).select().single();
        if (error) {
          if (error.code === '23505') {
            showToast('A holiday already exists on this date', 'error');
          } else {
            throw error;
          }
          return;
        }
        invalidateHolidayCache();
        await logAudit('holiday.created', 'holiday', data.id, { date: dateString, name });
        showToast(`Holiday "${name}" added`, 'success');
        close();
        renderHolidayCalendarPage();
      } catch (err) {
        showToast(err.message || 'Failed to add holiday', 'error');
      }
    });
  });
}

/**
 * Open modal to edit or remove an existing holiday.
 */
function openEditHolidayModal(dateString, currentName, profile) {
  createModal('Edit Holiday', `
    <form id="holiday-form" class="space-y-4">
      <div>
        <label class="form-label">Date</label>
        <p class="text-sm font-medium text-neutral-700">${formatDate(dateString)}</p>
      </div>
      <div>
        <label class="form-label">Holiday Name <span class="text-danger-500">*</span></label>
        <input type="text" id="holiday-name" class="form-input" value="${currentName}" required />
      </div>
      <div class="flex justify-between pt-2">
        <button type="button" id="holiday-remove" class="btn-danger">Remove Holiday</button>
        <div class="flex gap-3">
          <button type="button" id="holiday-cancel" class="btn-secondary">Cancel</button>
          <button type="submit" class="btn-primary">Update</button>
        </div>
      </div>
    </form>
  `, (el, close) => {
    el.querySelector('#holiday-cancel').addEventListener('click', close);

    // Remove button
    el.querySelector('#holiday-remove').addEventListener('click', () => {
      close();
      confirmDialog(
        `Remove holiday "${currentName}" on ${formatDate(dateString)}?`,
        async () => {
          try {
            const { data: existing } = await supabase.from('holidays').select('id').eq('date', dateString).single();
            if (!existing) { showToast('Holiday not found', 'error'); return; }
            const { error } = await supabase.from('holidays').delete().eq('id', existing.id);
            if (error) throw error;
            invalidateHolidayCache();
            await logAudit('holiday.deleted', 'holiday', existing.id, { date: dateString, name: currentName });
            showToast('Holiday removed', 'success');
            renderHolidayCalendarPage();
          } catch (err) {
            showToast(err.message || 'Failed to remove holiday', 'error');
          }
        },
        'Remove'
      );
    });

    // Update form
    el.querySelector('#holiday-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newName = el.querySelector('#holiday-name').value.trim();
      if (!newName) { showToast('Please enter a holiday name', 'error'); return; }
      if (newName === currentName) { close(); return; }
      try {
        const { data: existing } = await supabase.from('holidays').select('id').eq('date', dateString).single();
        if (!existing) { showToast('Holiday not found', 'error'); return; }
        const { error } = await supabase.from('holidays').update({ name: newName }).eq('id', existing.id);
        if (error) throw error;
        invalidateHolidayCache();
        await logAudit('holiday.updated', 'holiday', existing.id, { date: dateString, old_name: currentName, new_name: newName });
        showToast('Holiday updated', 'success');
        close();
        renderHolidayCalendarPage();
      } catch (err) {
        showToast(err.message || 'Failed to update holiday', 'error');
      }
    });
  });
}
