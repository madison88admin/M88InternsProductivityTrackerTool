/**
 * Audit Logger
 * Logs all user actions to the audit_logs table for compliance.
 */
import { supabase } from './supabase.js';

// Cache the client IP for the session — fetched once, reused on every log call
let cachedIp = null;
const AUDIT_INSERT_TIMEOUT_MS = 1500;

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), timeoutMs)),
  ]);
}

async function getClientIp() {
  if (cachedIp) return cachedIp;
  try {
    const res = await withTimeout(fetch('https://api.ipify.org?format=json'), 1200);
    if (!res) return null;
    const { ip } = await res.json();
    cachedIp = ip;
    return ip;
  } catch {
    return null;
  }
}

// Warm IP cache early without blocking user actions
getClientIp().catch(() => {});

/**
 * Log an action to the audit trail.
 * @param {string} action - e.g., 'attendance.time_in', 'task.created', 'approval.approved'
 * @param {string} entityType - e.g., 'attendance', 'task', 'narrative', 'approval'
 * @param {string} [entityId] - The ID of the affected entity
 * @param {object} [details] - Additional context (old values, new values, etc.)
 */
export async function logAudit(action, entityType, entityId = null, details = null) {
  const ip = cachedIp || null;

  try {
    const result = await withTimeout(
      supabase.rpc('record_audit_log', {
        p_action: action,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_details: details || null,
        p_ip_address: ip,
      }),
      AUDIT_INSERT_TIMEOUT_MS,
    );

    if (!result) {
      return;
    }

    if (result.error) {
      throw result.error;
    }
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}

export function queueAudit(action, entityType, entityId = null, details = null) {
  logAudit(action, entityType, entityId, details).catch((err) => {
    console.error('Audit log failed:', err);
  });
}
