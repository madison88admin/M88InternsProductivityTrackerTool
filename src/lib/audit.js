/**
 * Audit Logger
 * Logs all user actions to the audit_logs table for compliance.
 */
import { supabase } from './supabase.js';
import { getCurrentUser } from './auth.js';

/**
 * Log an action to the audit trail.
 * @param {string} action - e.g., 'attendance.time_in', 'task.created', 'approval.approved'
 * @param {string} entityType - e.g., 'attendance', 'task', 'narrative', 'approval'
 * @param {string} [entityId] - The ID of the affected entity
 * @param {object} [details] - Additional context (old values, new values, etc.)
 */
export async function logAudit(action, entityType, entityId = null, details = null) {
  const user = getCurrentUser();

  try {
    await supabase.from('audit_logs').insert({
      user_id: user?.id || null,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details: details ? JSON.stringify(details) : null,
      ip_address: null, // Will be populated by Supabase edge function or RLS
    });
  } catch (err) {
    console.error('Audit log failed:', err);
  }
}
