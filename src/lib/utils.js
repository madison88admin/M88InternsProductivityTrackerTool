/**
 * Utility helpers used across the application.
 */
import { supabase } from './supabase.js';

/**
 * Format a date to a readable string.
 * @param {string|Date} date
 * @param {object} [options]
 * @returns {string}
 */
export function formatDate(date, options = {}) {
  const d = new Date(date);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

/**
 * Format a time to HH:MM AM/PM.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format a datetime to readable string.
 * @param {string|Date} date
 * @returns {string}
 */
export function formatDateTime(date) {
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Calculate hours between two timestamps.
 * @param {string|Date} start
 * @param {string|Date} end
 * @returns {number} Hours (decimal)
 */
export function calculateHours(start, end) {
  const ms = new Date(end) - new Date(start);
  return Math.max(0, ms / (1000 * 60 * 60));
}

/**
 * Get the Monday of the week for a given date.
 * @param {Date} date
 * @returns {Date}
 */
export function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the Friday of the week for a given date.
 * @param {Date} date
 * @returns {Date}
 */
export function getFriday(date) {
  const monday = getMonday(date);
  monday.setDate(monday.getDate() + 4);
  monday.setHours(23, 59, 59, 999);
  return monday;
}

/**
 * Debounce a function.
 * @param {Function} fn
 * @param {number} delay
 * @returns {Function}
 */
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate a simple UUID v4.
 * @returns {string}
 */
export function uuid() {
  return crypto.randomUUID();
}

/**
 * Check if a time is considered "late" (9:00 AM or later).
 * @param {string|Date} timestamp
 * @returns {boolean}
 */
export function isLateArrival(timestamp) {
  const d = new Date(timestamp);
  return d.getHours() >= 9;
}

/**
 * Check if a time is outside allowed hours (before 7AM or after 6PM).
 * @param {string|Date} timestamp
 * @returns {boolean}
 */
export function isOutsideAllowedHours(timestamp) {
  const d = new Date(timestamp);
  const hour = d.getHours();
  return hour < 7 || hour >= 18;
}

/**
 * Format hours to display (e.g., 8.5 → "8h 30m").
 * @param {number} hours
 * @returns {string}
 */
export function formatHoursDisplay(hours) {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Get today's date as YYYY-MM-DD string.
 * @returns {string}
 */
export function getTodayDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Compute the estimated OJT end date.
 * Uses average daily hours rendered (or 8 hrs/day default) and skips weekends.
 * @param {number} hoursRequired
 * @param {number} hoursRendered
 * @param {number} daysWorked - Distinct days with approved attendance
 * @returns {Date|null}
 */
export function computeEstimatedEndDate(hoursRequired, hoursRendered, daysWorked) {
  if (hoursRequired <= 0) return null;
  const remaining = hoursRequired - hoursRendered;
  if (remaining <= 0) return null;
  const avgDaily = daysWorked > 0 ? hoursRendered / daysWorked : 8;
  const weekdaysNeeded = Math.ceil(remaining / avgDaily);
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  let added = 0;
  while (added < weekdaysNeeded) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return date;
}

/**
 * Get the public IP address of the current user.
 * @returns {Promise<string>}
 */
export async function getPublicIP() {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return 'unknown';
  }
}

/**
 * Sanitize HTML string to prevent XSS (for display).
 * @param {string} html
 * @returns {string}
 */
export function sanitizeHtml(html) {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
}

/**
 * Truncate text to a specified length.
 * @param {string} text
 * @param {number} maxLength
 * @returns {string}
 */
export function truncate(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return text || '';
  return text.slice(0, maxLength) + '…';
}

/**
 * Render a user avatar as an HTML string.
 * Shows the uploaded profile photo if available, otherwise a gradient initial circle.
 * The image layer sits on top of the initial; if the image fails to load it is removed,
 * revealing the initial underneath.
 *
 * @param {object} user          - Profile object with `full_name` and optional `avatar_url`.
 * @param {string} sizeClass     - Tailwind size classes, e.g. 'w-9 h-9'.
 * @param {string} textClass     - Tailwind text-size class, e.g. 'text-sm'.
 * @returns {string}             - HTML string ready to embed in a template literal.
 */
export function renderAvatar(user, sizeClass = 'w-9 h-9', textClass = 'text-sm') {
  const rawInitial = (user?.full_name || 'U').charAt(0).toUpperCase();
  const initial = rawInitial.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const safeName = (user?.full_name || 'User')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const wrapper = `${sizeClass} rounded-full shrink-0 relative overflow-hidden flex items-center justify-center text-white ${textClass} font-semibold`;
  const gradient = `background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400));`;

  if (user?.avatar_url) {
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(user.avatar_url);
    return `<div class="${wrapper}" style="${gradient}">${initial}<img src="${publicUrl}" alt="${safeName}" class="absolute inset-0 w-full h-full object-cover" onerror="this.remove()" /></div>`;
  }

  return `<div class="${wrapper}" style="${gradient}">${initial}</div>`;
}
