/**
 * Task Draft Management
 * Auto-saves task form data to localStorage to prevent data loss
 */

const DRAFT_KEY = 'task_draft';
const DRAFT_TIMESTAMP_KEY = 'task_draft_timestamp';

/**
 * Save task draft to localStorage
 * @param {Object} formData - Task form data
 * @param {string} formData.title - Task title
 * @param {string} formData.description - Task description
 * @param {string} formData.assignedTo - Assigned intern ID
 * @param {string} formData.estimatedHours - Estimated hours
 * @param {string} formData.dueDate - Due date
 */
export function saveTaskDraft(formData) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    localStorage.setItem(DRAFT_TIMESTAMP_KEY, new Date().toISOString());
  } catch (err) {
    console.error('Failed to save task draft:', err);
  }
}

/**
 * Load task draft from localStorage
 * @returns {Object|null} - Draft form data or null if no draft exists
 */
export function loadTaskDraft() {
  try {
    const draft = localStorage.getItem(DRAFT_KEY);
    if (!draft) return null;

    return JSON.parse(draft);
  } catch (err) {
    console.error('Failed to load task draft:', err);
    return null;
  }
}

/**
 * Clear task draft from localStorage
 */
export function clearTaskDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
    localStorage.removeItem(DRAFT_TIMESTAMP_KEY);
  } catch (err) {
    console.error('Failed to clear task draft:', err);
  }
}

/**
 * Check if a task draft exists
 * @returns {boolean}
 */
export function hasDraft() {
  return localStorage.getItem(DRAFT_KEY) !== null;
}

/**
 * Get draft timestamp
 * @returns {Date|null}
 */
export function getDraftTimestamp() {
  try {
    const timestamp = localStorage.getItem(DRAFT_TIMESTAMP_KEY);
    if (!timestamp) return null;
    return new Date(timestamp);
  } catch (err) {
    return null;
  }
}

/**
 * Format draft age (e.g., "5 minutes ago", "2 hours ago")
 * @returns {string}
 */
export function getDraftAge() {
  const timestamp = getDraftTimestamp();
  if (!timestamp) return '';

  const now = new Date();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'just now';
}
