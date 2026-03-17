/**
 * Idle Timeout Service
 * Automatically logs out the user after 3 minutes of inactivity.
 * A 30-second countdown warning is shown before logout.
 */
import { supabase } from './supabase.js';
import { logout, isAuthenticated } from './auth.js';
import { navigateTo } from './router.js';
import { showToast } from './toast.js';

const IDLE_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const WARN_BEFORE_MS  = 30 * 1000;     // warn 30 seconds before logout

const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];

let idleTimer      = null;
let warnTimer      = null;
let warningEl      = null;
let countdownEl    = null;
let countdownTimer = null;
let secondsLeft    = 30;

// ── Warning Modal ─────────────────────────────────────────────

function showWarning() {
  if (!isAuthenticated() || warningEl) return;

  secondsLeft = 30;

  warningEl = document.createElement('div');
  warningEl.className = 'modal-backdrop';
  warningEl.innerHTML = `
    <div class="modal-content" style="max-width:28rem;text-align:center;">
      <div class="modal-body" style="padding:2.5rem 2rem;">
        <div style="width:64px;height:64px;background:#fef3c7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.25rem;">
          <svg style="width:32px;height:32px;color:#d97706;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
          </svg>
        </div>
        <h2 style="font-size:1.25rem;font-weight:700;color:#111827;margin-bottom:0.5rem;">
          Session Expiring Soon
        </h2>
        <p style="color:#6b7280;margin-bottom:0.75rem;">
          You have been inactive. You will be logged out in
        </p>
        <div id="idle-countdown" style="font-size:3rem;font-weight:800;color:#d97706;line-height:1;margin-bottom:0.75rem;">
          30
        </div>
        <p style="font-size:0.875rem;color:#9ca3af;margin-bottom:1.5rem;">
          seconds. Move your mouse or press any key to stay logged in.
        </p>
        <button id="idle-stay-btn" class="btn-primary" style="width:100%;">
          Stay Logged In
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(warningEl);

  countdownEl = document.getElementById('idle-countdown');
  document.getElementById('idle-stay-btn').addEventListener('click', resetTimer);

  countdownTimer = setInterval(() => {
    secondsLeft--;
    if (countdownEl) countdownEl.textContent = secondsLeft;
    if (secondsLeft <= 0) clearInterval(countdownTimer);
  }, 1000);
}

function dismissWarning() {
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  if (warningEl)      { warningEl.remove(); warningEl = null; }
  countdownEl = null;
}

// ── Timer Logic ───────────────────────────────────────────────

function resetTimer() {
  if (!isAuthenticated()) return;

  clearTimeout(idleTimer);
  clearTimeout(warnTimer);
  dismissWarning();

  warnTimer = setTimeout(showWarning, IDLE_TIMEOUT_MS - WARN_BEFORE_MS);
  idleTimer = setTimeout(performLogout, IDLE_TIMEOUT_MS);
}

async function performLogout() {
  dismissWarning();
  _stopListeners();
  try { await logout(); } catch (_) { /* ignore */ }
  navigateTo('/login');
  showToast('You were logged out due to inactivity.', 'warning');
}

// ── Listener Management ───────────────────────────────────────

function _startListeners() {
  ACTIVITY_EVENTS.forEach(e => document.addEventListener(e, resetTimer, { passive: true }));
}

function _stopListeners() {
  clearTimeout(idleTimer);
  clearTimeout(warnTimer);
  idleTimer = null;
  warnTimer = null;
  ACTIVITY_EVENTS.forEach(e => document.removeEventListener(e, resetTimer));
}

// ── Public API ────────────────────────────────────────────────

/**
 * Initialize the idle timeout system.
 * Call once during app boot. Automatically starts and stops based on auth state.
 */
export function initIdleTimeout() {
  // Start immediately if an active session already exists
  if (isAuthenticated()) {
    _startListeners();
    resetTimer();
  }

  // React to future auth state changes
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN') {
      _startListeners();
      resetTimer();
    } else if (event === 'SIGNED_OUT') {
      _stopListeners();
      dismissWarning();
    }
  });
}
