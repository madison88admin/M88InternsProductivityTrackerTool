/**
 * Forgot Password Page
 */
import { resetPassword } from '../lib/auth.js';
import { renderPage } from '../lib/component.js';
import { showToast } from '../lib/toast.js';

export function renderForgotPasswordPage() {
  renderPage(`
    <div class="min-h-screen flex items-center justify-center px-4 py-12" style="background: linear-gradient(135deg, #4338ca 0%, #4f46e5 50%, #6366f1 100%);">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-white/20 backdrop-blur-sm" style="box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
            <span class="text-2xl font-extrabold text-white">M88</span>
          </div>
        </div>
        <div class="bg-white rounded-2xl shadow-2xl p-8" style="border: 1px solid rgba(255,255,255,0.2);">
          <h2 class="text-xl font-bold text-neutral-900 mb-2">Reset Password</h2>
          <p class="text-sm text-neutral-500 mb-6">Enter your email address and we'll send you a link to reset your password.</p>
          
          <form id="reset-form" class="space-y-4">
            <div>
              <label for="email" class="form-label">Email Address</label>
              <input type="email" id="email" class="form-input" placeholder="you@madison88.com" required autocomplete="email" />
            </div>

            <button type="submit" id="reset-btn" class="btn-primary w-full">
              Send Reset Link
            </button>
          </form>

          <div class="mt-4 text-center">
            <a href="#/login" class="text-sm text-primary-600 hover:text-primary-700">
              ← Back to Login
            </a>
          </div>
        </div>
      </div>
    </div>
  `, () => {
    document.getElementById('reset-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const btn = document.getElementById('reset-btn');

      btn.disabled = true;
      btn.textContent = 'Sending...';

      try {
        await resetPassword(email);
        showToast('Password reset link sent! Check your email.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to send reset link', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Send Reset Link';
      }
    });
  });
}
