/**
 * Holiday Check Utility
 * Provides cached holiday lookups used across the application.
 */
import { supabase } from './supabase.js';

/** @type {Map<string, {isHoliday: boolean, name: string}>} */
const holidayCache = new Map();
let cacheLoaded = false;
let cachePromise = null;

/**
 * Load all holidays into the cache.
 * Called once; subsequent calls return the same promise.
 */
async function loadCache() {
  if (cachePromise) return cachePromise;
  cachePromise = (async () => {
    const { data, error } = await supabase
      .from('holidays')
      .select('date, name')
      .order('date');
    if (!error && data) {
      holidayCache.clear();
      data.forEach(h => {
        holidayCache.set(h.date, { isHoliday: true, name: h.name });
      });
    }
    cacheLoaded = true;
  })();
  return cachePromise;
}

/**
 * Check if a date is a holiday.
 * @param {string} dateString - YYYY-MM-DD format
 * @returns {Promise<{isHoliday: boolean, name: string}>}
 */
export async function isHoliday(dateString) {
  if (!cacheLoaded) await loadCache();
  return holidayCache.get(dateString) || { isHoliday: false, name: '' };
}

/**
 * Get all holidays for a specific month.
 * @param {number} year
 * @param {number} month - 0-indexed (0=Jan, 11=Dec)
 * @returns {Promise<Map<string, string>>} Map of date string to holiday name
 */
export async function getHolidaysForMonth(year, month) {
  if (!cacheLoaded) await loadCache();
  const result = new Map();
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  for (const [date, info] of holidayCache) {
    if (date.startsWith(prefix)) {
      result.set(date, info.name);
    }
  }
  return result;
}

/**
 * Invalidate the cache (call after add/edit/delete).
 */
export function invalidateHolidayCache() {
  cacheLoaded = false;
  cachePromise = null;
  holidayCache.clear();
}
