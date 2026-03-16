/**
 * Audit Logger
 * Logs all user actions to the audit_logs table for compliance.
 */
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

// Cache the client IP for the session — fetched once, reused on every log call
let cachedIp = null;

async function getClientIp() {
  if (cachedIp) return cachedIp;
  try {
    const res = await fetch('https://api.ipify.org?format=json');
    const { ip } = await res.json();
    cachedIp = ip;
    return ip;
  } catch {
    return null;
  }
}

/**
 * Log an action to the audit trail.
 * @param {string} action - e.g., 'attendance.time_in', 'task.created', 'approval.approved'
 * @param {string} entityType - e.g., 'attendance', 'task', 'narrative', 'approval'
 * @param {string} [entityId] - The ID of the affected entity
 * @param {object} [details] - Additional context (old values, new values, etc.)
 */
export async function logAudit(action, entityType, entityId = null, details = null) {
  const user = getCurrentUser();
  const ip = await getClientIp();

  try {
    await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details || null,
      ip_address: ip,
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
