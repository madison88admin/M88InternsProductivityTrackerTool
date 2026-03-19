/**
 * Reset Password Page
 * Handles the password reset flow: validates reset token, shows password form
 * with real-time strength checking, and updates the password on submit.
 */
import { supabase } from '../lib/supabase.js';
import { renderPage } from '../lib/component.js';
import { showToast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

/** Extract the reset token from the URL hash query string (e.g. /#/reset-password?token=xxx). */
function getTokenFromUrl() {
  const hash = window.location.hash; // e.g. "#/reset-password?token=abc123"
  const queryStart = hash.indexOf('?');
  if (queryStart === -1) return null;
  return new URLSearchParams(hash.slice(queryStart)).get('token');
}

/** Check which password requirements are met. */
function checkRequirements(password) {
  return {
    length:    password.length >= 8,
    upper:     /[A-Z]/.test(password),
    lower:     /[a-z]/.test(password),
    number:    /[0-9]/.test(password),
    special:   /[^A-Za-z0-9]/.test(password),
  };
}

function allMet(reqs) {
  return reqs.length && reqs.upper && reqs.lower && reqs.number && reqs.special;
}

export function renderResetPasswordPage() {
  renderPage(`
    <div class="min-h-screen flex">
      <!-- Left side — Brand panel -->
      <div class="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center" style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%);">
        <div class="absolute inset-0" style="background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.08) 0%, transparent 50%);"></div>
        <div class="absolute top-20 left-16 w-64 h-64 rounded-full opacity-10 bg-white"></div>
        <div class="absolute bottom-32 right-20 w-48 h-48 rounded-full opacity-5 bg-white"></div>
        <div class="absolute top-1/3 right-16 w-32 h-32 rounded-2xl rotate-12 opacity-10 bg-white"></div>
        <div class="relative z-10 max-w-md text-center px-8">
          <div class="flex justify-center mb-8">
            <img src="/favicon.png" alt="Logo" class="w-25 h-25 object-contain brightness-0 invert drop-shadow-lg" />
          </div>
          <h1 class="text-4xl font-extrabold text-white mb-4 leading-tight">Interns Productivity<br/>Tracker</h1>
          <p class="text-lg text-white/70">Streamline your OJT workflow with intelligent tracking, reporting, and collaboration tools.</p>
          <div class="flex items-center justify-center gap-8 mt-12">
            <div class="text-center">
              <div class="text-2xl font-bold text-white whitespace-nowrap">100%</div>
              <div class="text-sm text-white/60 mt-1">Digital</div>
            </div>
            <div class="w-px h-10 bg-white/20 shrink-0"></div>
            <div class="text-center">
              <div class="text-2xl font-bold text-white whitespace-nowrap">Real-time</div>
              <div class="text-sm text-white/60 mt-1">Tracking</div>
            </div>
            <div class="w-px h-10 bg-white/20 shrink-0"></div>
            <div class="text-center">
              <div class="text-2xl font-bold text-white whitespace-nowrap">Smart</div>
              <div class="text-sm text-white/60 mt-1">Reports</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right side — Reset password form -->
      <div class="w-full lg:w-1/2 flex items-center justify-center bg-neutral-50 px-6 py-12">
        <div class="w-full max-w-md">
          <!-- Mobile logo -->
          <div class="lg:hidden text-center mb-10">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style="background: linear-gradient(135deg, #4f46e5, #6366f1); box-shadow: 0 4px 16px rgba(79,70,229,0.3);">
              <img src="/favicon.png" alt="Logo" class="w-10 h-10 object-contain brightness-0 invert" />
            </div>
            <h1 class="text-2xl font-bold text-neutral-900">Productivity Tracker</h1>
            <p class="text-neutral-500 mt-1 text-sm">Madison 88 Business Solutions Asia Inc.</p>
          </div>

          <!-- Loading state -->
          <div id="state-loading">
            <div class="flex flex-col items-center py-6 gap-4">
              <div class="w-10 h-10 border-4 border-primary-200 border-t-primary-600
                          rounded-full animate-spin"></div>
              <p class="text-sm text-neutral-500">Validating your reset link…</p>
            </div>
          </div>

          <!-- Error state (hidden initially) -->
          <div id="state-error" class="hidden">
            <div class="flex flex-col items-center py-4 text-center gap-4">
              <div class="w-14 h-14 rounded-full bg-danger-100 flex items-center justify-center">
                <svg class="w-7 h-7 text-danger-600" fill="none" viewBox="0 0 24 24"
                     stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round"
                        d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
              </div>
              <div>
                <h2 class="text-lg font-bold text-neutral-900 mb-1">Link Unavailable</h2>
                <p id="error-message" class="text-sm text-neutral-500"></p>
              </div>
              <p class="text-xs text-neutral-400 mt-2">
                You can request a new password reset link from the login page.
              </p>
            </div>
          </div>

          <!-- Form state (hidden initially) -->
          <div id="state-form" class="hidden">
            <div>
              <h2 class="text-2xl font-bold text-neutral-900">Reset Your Password</h2>
              <p class="text-neutral-500 mt-2 text-sm">Enter your new password below. It must be strong and unique.</p>
            </div>

            <form id="reset-password-form" class="mt-8 space-y-5" novalidate>

              <!-- Password field -->
              <div>
                <label for="new-password" class="form-label">New Password</label>
                <div class="relative">
                  <input type="password" id="new-password" class="form-input pr-10"
                         placeholder="Create a strong password"
                         autocomplete="new-password" required />
                  <button type="button" id="toggle-password"
                          class="absolute inset-y-0 right-0 pr-3 flex items-center
                                 text-neutral-400 hover:text-neutral-600"
                          tabindex="-1" aria-label="Toggle password visibility">
                    <svg id="eye-open" class="w-5 h-5" fill="none" viewBox="0 0 24 24"
                         stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path stroke-linecap="round" stroke-linejoin="round"
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943
                               9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943
                               -9.542-7z"/>
                    </svg>
                    <svg id="eye-closed" class="w-5 h-5 hidden" fill="none" viewBox="0 0 24 24"
                         stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round"
                            d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943
                               -9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243
                               4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532
                               7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5
                               c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132
                               5.411m0 0L21 21"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Password strength checklist -->
              <div class="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 space-y-2">
                <p class="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-1">
                  Password Requirements
                </p>
                <div id="req-length"  class="req-row flex items-center gap-2">
                  <span class="req-icon w-4 h-4 rounded-full border-2 border-neutral-300
                                shrink-0 transition-colors"></span>
                  <span class="req-text text-sm text-neutral-500 transition-colors">
                    At least 8 characters
                  </span>
                </div>
                <div id="req-case" class="req-row flex items-center gap-2">
                  <span class="req-icon w-4 h-4 rounded-full border-2 border-neutral-300
                                shrink-0 transition-colors"></span>
                  <span class="req-text text-sm text-neutral-500 transition-colors">
                    Uppercase and lowercase letters
                  </span>
                </div>
                <div id="req-number" class="req-row flex items-center gap-2">
                  <span class="req-icon w-4 h-4 rounded-full border-2 border-neutral-300
                                shrink-0 transition-colors"></span>
                  <span class="req-text text-sm text-neutral-500 transition-colors">
                    At least one number
                  </span>
                </div>
                <div id="req-special" class="req-row flex items-center gap-2">
                  <span class="req-icon w-4 h-4 rounded-full border-2 border-neutral-300
                                shrink-0 transition-colors"></span>
                  <span class="req-text text-sm text-neutral-500 transition-colors">
                    At least one special character (!@#$%^&amp;*)
                  </span>
                </div>
              </div>

              <!-- Confirm password -->
              <div>
                <label for="confirm-password" class="form-label">Confirm Password</label>
                <input type="password" id="confirm-password" class="form-input"
                       placeholder="Re-enter your password"
                       autocomplete="new-password" required />
                <p id="confirm-error" class="mt-1 text-xs text-danger-600 hidden">
                  Passwords do not match.
                </p>
              </div>

              <button type="submit" id="submit-btn" class="btn-primary w-full py-3! text-base!" disabled>
                Reset Password
              </button>
            </form>
          </div>

          <div class="mt-8 pt-6 text-center" style="border-top: 1px solid var(--color-neutral-200);">
            <a href="#/login" class="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
              ← Back to Login
            </a>
          </div>

          <p class="text-center text-xs text-neutral-400 mt-8">
            &copy; ${new Date().getFullYear()} Madison 88 Business Solutions Asia Inc.
          </p>
        </div>
      </div>
    </div>
  `, async () => {
    const token = getTokenFromUrl();

    // ── No token in URL ──────────────────────────────────────
    if (!token) {
      showState('error', 'This reset link is invalid or incomplete.');
      return;
    }

    // ── Validate token against the Edge Function ─────────────
    try {
      const { data, error } = await supabase.functions.invoke('validate-reset-token', {
        body: { token },
      });

      if (error) throw new Error(error.message);

      if (!data.valid) {
        const messages = {
          not_found: 'This reset link is invalid or does not exist.',
          used:      'This reset link has already been used.',
          expired:   'This reset link has expired (links are valid for 10 minutes).',
        };
        showState('error', messages[data.error] ?? 'This reset link is no longer valid.');
        return;
      }
    } catch (err) {
      showState('error', 'Unable to validate the reset link. Please try again later.');
      return;
    }

    // ── Show the password form ────────────────────────────────
    showState('form');
    bindFormEvents(token);
  });
}

/** Switch which state card is visible. */
function showState(state, errorMsg = '') {
  ['loading', 'error', 'form'].forEach((s) => {
    document.getElementById(`state-${s}`).classList.add('hidden');
  });
  document.getElementById(`state-${state}`).classList.remove('hidden');
  if (state === 'error' && errorMsg) {
    document.getElementById('error-message').textContent = errorMsg;
  }
}

/** Wire up all form interactivity after the form is visible. */
function bindFormEvents(token) {
  const passwordInput  = document.getElementById('new-password');
  const confirmInput   = document.getElementById('confirm-password');
  const confirmError   = document.getElementById('confirm-error');
  const submitBtn      = document.getElementById('submit-btn');
  const toggleBtn      = document.getElementById('toggle-password');
  const eyeOpen        = document.getElementById('eye-open');
  const eyeClosed      = document.getElementById('eye-closed');

  // ── Show/hide password toggle ────────────────────────────
  toggleBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    eyeOpen.classList.toggle('hidden', isPassword);
    eyeClosed.classList.toggle('hidden', !isPassword);
  });

  // ── Real-time strength indicator ─────────────────────────
  passwordInput.addEventListener('input', () => {
    const reqs = checkRequirements(passwordInput.value);
    updateRequirement('req-length',  reqs.length);
    updateRequirement('req-case',    reqs.upper && reqs.lower);
    updateRequirement('req-number',  reqs.number);
    updateRequirement('req-special', reqs.special);
    validateAndToggleSubmit();
  });

  // ── Confirm password match ───────────────────────────────
  confirmInput.addEventListener('input', () => {
    const matches = confirmInput.value === passwordInput.value;
    confirmError.classList.toggle('hidden', matches || confirmInput.value.length === 0);
    validateAndToggleSubmit();
  });

  function validateAndToggleSubmit() {
    const reqs    = checkRequirements(passwordInput.value);
    const matches = confirmInput.value === passwordInput.value && confirmInput.value.length > 0;
    submitBtn.disabled = !(allMet(reqs) && matches);
  }

  // ── Form submit ──────────────────────────────────────────
  document.getElementById('reset-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const password = passwordInput.value;
    const confirm  = confirmInput.value;

    // Final client-side guards
    if (!allMet(checkRequirements(password))) {
      showToast('Password does not meet all requirements.', 'error');
      return;
    }
    if (password !== confirm) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Resetting password…';

    try {
      const { data, error } = await supabase.functions.invoke('complete-password-reset', {
        body: { token, password },
      });

      if (error) throw new Error(error.message);
      if (!data.ok) {
        const messages = {
          used:    'This reset link has already been used.',
          expired: 'This reset link has expired.',
          not_found: 'This reset link is no longer valid.',
        };
        throw new Error(messages[data.error] ?? data.error ?? 'Failed to reset password.');
      }

      showToast('Password reset successfully! You can now log in with your new password.', 'success');
      navigateTo('/login');
    } catch (err) {
      showToast(err.message || 'Something went wrong. Please try again.', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Reset Password';
    }
  });
}

/** Update a single requirement row's visual state. */
function updateRequirement(id, met) {
  const row  = document.getElementById(id);
  if (!row) return;
  const icon = row.querySelector('.req-icon');
  const text = row.querySelector('.req-text');

  if (met) {
    icon.className = 'req-icon w-4 h-4 rounded-full bg-success-500 flex-shrink-0 ' +
                     'flex items-center justify-center transition-colors';
    icon.innerHTML = `<svg class="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24"
                           stroke="currentColor" stroke-width="3.5">
                        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                      </svg>`;
    text.className = 'req-text text-sm text-success-600 font-medium transition-colors';
  } else {
    icon.className = 'req-icon w-4 h-4 rounded-full border-2 border-neutral-300 ' +
                     'flex-shrink-0 transition-colors';
    icon.innerHTML = '';
    text.className = 'req-text text-sm text-neutral-500 transition-colors';
  }
}
