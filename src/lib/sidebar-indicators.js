import { supabase } from './supabase.js';
import { getTodayDate } from './utils.js';

const INDICATOR_TYPES = {
  tasks: 'tasks',
  narratives: 'narratives',
  allowance: 'allowance',
};

function getStorageKey(userId, type) {
  return `sidebar_indicator_seen:${userId}:${type}`;
}

function readSeenAt(userId, type) {
  try {
    const value = localStorage.getItem(getStorageKey(userId, type));
    return value || '1970-01-01T00:00:00.000Z';
  } catch {
    return '1970-01-01T00:00:00.000Z';
  }
}

export function markSidebarIndicatorSeen(userId, type, seenAt = new Date().toISOString()) {
  if (!userId || !type) return;

  try {
    localStorage.setItem(getStorageKey(userId, type), seenAt);
  } catch {
    // Ignore storage failures and keep app behavior non-blocking.
  }
}

export async function fetchInternSidebarIndicators(profile) {
  if (!profile?.id) {
    return { tasks: false, narratives: false, allowance: false };
  }

  const internId = profile.id;
  const seenTasksAt = readSeenAt(internId, INDICATOR_TYPES.tasks);
  const seenNarrativesAt = readSeenAt(internId, INDICATOR_TYPES.narratives);
  const seenAllowanceAt = readSeenAt(internId, INDICATOR_TYPES.allowance);
  const today = getTodayDate();

  const [tasksRes, narrativesRes, allowanceRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('assigned_to', internId)
      .or('is_self_submitted.is.null,is_self_submitted.eq.false')
      .or('is_archived.is.null,is_archived.eq.false')
      .gt('created_at', seenTasksAt),
    supabase
      .from('narratives')
      .select('id', { count: 'exact', head: true })
      .eq('intern_id', internId)
      .eq('status', 'approved')
      .gt('approved_at', seenNarrativesAt),
    supabase
      .from('allowance_periods')
      .select('id', { count: 'exact', head: true })
      .eq('intern_id', internId)
      .eq('status', 'approved')
      .lte('week_start', today)
      .gte('week_end', today)
      .gt('updated_at', seenAllowanceAt),
  ]);

  return {
    tasks: !tasksRes.error && (tasksRes.count || 0) > 0,
    narratives: !narrativesRes.error && (narrativesRes.count || 0) > 0,
    allowance: !allowanceRes.error && (allowanceRes.count || 0) > 0,
  };
}

export const sidebarIndicatorTypes = INDICATOR_TYPES;