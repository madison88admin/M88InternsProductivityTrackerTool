/**
 * Authentication Service
 * Handles login, registration, session management, and role-based access.
 */
import { supabase } from './supabase.js';

/** @type {{ user: object|null, profile: object|null }} */
let currentSession = { user: null, profile: null };

/**
 * Initialize auth — check for existing session and set up listener.
 */
export async function initAuth() {
  const { data: { session } } = await supabase.auth.getSession();

  if (session?.user) {
    currentSession.user = session.user;
    await loadProfile(session.user.id);
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session?.user) {
      currentSession.user = session.user;
      await loadProfile(session.user.id);
    } else if (event === 'SIGNED_OUT') {
      currentSession = { user: null, profile: null };
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

  return data;
}

/**
 * Register the first admin account with a secret key.
 */
export async function registerAdmin(email, password, fullName, secretKey) {
  const expectedKey = import.meta.env.VITE_ADMIN_SECRET_KEY;

  if (!expectedKey || secretKey !== expectedKey) {
    throw new Error('Invalid secret key.');
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      data: { full_name: fullName, role: 'admin' },
    },
  });

  if (error) throw error;

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
 */
export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  currentSession = { user: null, profile: null };
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

/**
 * Request password reset email.
 */
export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/#/reset-password`,
  });
  if (error) throw error;
}
