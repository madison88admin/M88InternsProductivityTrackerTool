/**
 * Authentication Service
 * Handles login, registration, session management, and role-based access.
 */
import { supabase } from './supabase.js';

/** @type {{ user: object|null, profile: object|null }} */
let currentSession = { user: null, profile: null };

const AUTH_AUDIT_TIMEOUT_MS = 1200;
const SIGN_OUT_TIMEOUT_MS = 900;

function isAbortError(err) {
  return err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('aborted');
}

function createTimeoutController(timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeoutId),
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function logAuthAudit(action, userId, details = null) {
  const timeout = createTimeoutController(AUTH_AUDIT_TIMEOUT_MS);
  try {
    const { error } = await supabase.rpc('record_audit_log', {
      p_action: action,
      p_entity_type: 'auth',
      p_entity_id: userId || null,
      p_details: details || null,
    }).abortSignal(timeout.signal);

    if (error) {
      throw error;
    }

    return true;
  } catch (err) {
    if (isAbortError(err)) {
      console.warn('Auth audit timed out, trying REST fallback.');
    } else {
      console.error('Auth audit log failed:', err);
    }
    return false;
  } finally {
    timeout.clear();
  }
}

async function logAuthAuditFallback(action, userId, details = null) {
  // Try RPC first
  const rpcResult = await logAuthAudit(action, userId, details);
  if (rpcResult) {
    return true;
  }

  // Fallback: direct REST insert (no RPC, just raw table insert)
  try {
    const { error } = await supabase
      .from('audit_logs')
      .insert([{
        action,
        entity_type: 'auth',
        entity_id: userId || null,
        user_id: userId || null,
        details: details || null,
      }]);

    if (error) {
      console.warn('Audit fallback insert failed:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Audit fallback failed:', err);
    return false;
  }
}

/**
 * Initialize auth — check for existing session and set up listener.
 */
export async function initAuth() {
  // Get session directly first
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    currentSession.user = session.user;
    await loadProfile(session.user.id);
    if (currentSession.profile?.is_active === false) {
      await supabase.auth.signOut();
      currentSession = { user: null, profile: null };
    }
  }

  // Listen for future auth changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentSession.user = session.user;
      await loadProfile(session.user.id);
      if (currentSession.profile?.is_active === false) {
        await supabase.auth.signOut();
        currentSession = { user: null, profile: null };
      }
    } else if (event === 'SIGNED_OUT') {
      currentSession = { user: null, profile: null };
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      currentSession.user = session.user;
    }
  });
}

/**
 * Load user profile from the profiles table.
 */
async function loadProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, departments(name), locations(name, address)')
    .eq('id', userId)
    .single();

  if (!error && data) {
    currentSession.profile = data;
  }
}

/**
 * Login with email and password.
 */
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;

  currentSession.user = data.user;
  await loadProfile(data.user.id);

  if (!currentSession.profile) {
    await supabase.auth.signOut();
    currentSession = { user: null, profile: null };
    throw new Error('Your account profile could not be loaded. Please try again or contact an administrator.');
  }

  if (currentSession.profile.is_active === false) {
    await supabase.auth.signOut();
    currentSession = { user: null, profile: null };
    throw new Error('Your account has been deactivated. Please contact an administrator.');
  }

  await logAuthAudit('auth.login', data.user.id, {
    email: data.user.email || email.trim(),
    role: currentSession.profile?.role || null,
  });

  return data;
}

/**
 * Register the first admin account with a secret key.
 * Uses an Edge Function with auth.admin.createUser() to bypass signUp() issues.
 */
export async function registerAdmin(email, password, fullName, secretKey) {
  const { data, error } = await supabase.functions.invoke('admin-setup', {
    body: { secretKey, email: email.trim(), password, fullName },
  });

  if (error) throw error;
  if (!data?.ok) throw new Error(data?.error || 'Failed to create admin account');

  return data;
}

/**
 * Invite a new user (admin only). Sends magic link email.
 */
export async function inviteUser(email, role, fullName, departmentId, locationId) {
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: {
      full_name: fullName,
      role,
      department_id: departmentId,
      location_id: locationId,
    },
  });

  if (error) throw error;
  return data;
}

/**
 * Logout the current user.
 * Resilient to session expiration - always succeeds even if audit log or signOut fails.
 */
export async function logout() {
  const userId = currentSession.user?.id || null;
  const details = {
    email: currentSession.user?.email || null,
    role: currentSession.profile?.role || null,
  };

  // Log audit BEFORE clearing session so RPC has auth context
  // Wait with timeout so audit completes before session clears
  if (userId) {
    try {
      await Promise.race([
        logAuthAuditFallback('auth.logout', userId, details),
        wait(1000), // 1s timeout for audit
      ]);
    } catch (err) {
      console.warn('Logout audit timed out, continuing with logout.');
    }
  }

  // Clear app auth state so route guards immediately treat user as logged out.
  currentSession = { user: null, profile: null };

  // Bound signOut wait time to avoid hanging logout UI on stale internal auth state.
  try {
    await Promise.race([
      supabase.auth.signOut({ scope: 'local' }),
      wait(SIGN_OUT_TIMEOUT_MS),
    ]);
  } catch (err) {
    console.warn('SignOut failed during logout:', err);
    // Still clear local session below
  }

  // Force-clear all Supabase auth keys from storage as fallback
  try {
    // Clear all keys that start with 'sb-' from sessionStorage
    const keysToRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('sb-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => sessionStorage.removeItem(key));

    // Also clear from localStorage in case any keys were stored there
    const localKeysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('sb-')) {
        localKeysToRemove.push(key);
      }
    }
    localKeysToRemove.forEach(key => localStorage.removeItem(key));
  } catch (err) {
    console.warn('Failed to clear storage:', err);
  }
}

/**
 * Get the current authenticated user.
 */
export function getCurrentUser() {
  return currentSession.user;
}

/**
 * Get the current user's profile.
 */
export function getProfile() {
  return currentSession.profile;
}

/**
 * Get the current user's role.
 */
export function getUserRole() {
  return currentSession.profile?.role || null;
}

/**
 * Check if the current user has one of the specified roles.
 */
export function hasRole(...roles) {
  const userRole = getUserRole();
  return userRole ? roles.includes(userRole) : false;
}

/**
 * Check if user is authenticated.
 */
export function isAuthenticated() {
  return !!currentSession.user && !!currentSession.profile;
}

/**
 * Refresh the current user's profile from DB.
 */
export async function refreshProfile() {
  if (currentSession.user) {
    await loadProfile(currentSession.user.id);
  }
}

/**
 * Update user password.
 */
export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

