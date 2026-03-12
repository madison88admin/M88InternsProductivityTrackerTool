/**
 * Admin Setup Page
 * Protected registration route for the first admin account.
 */
import { registerAdmin } from '../lib/auth.js';
import { renderPage } from '../lib/component.js';
import { showToast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

export function renderAdminSetupPage() {
  renderPage(`
    <div class="min-h-screen flex items-center justify-center px-4 py-12" style="background: linear-gradient(135deg, #4338ca 0%, #4f46e5 50%, #6366f1 100%);">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 bg-white/20 backdrop-blur-sm" style="box-shadow: 0 8px 32px rgba(0,0,0,0.1);">
            <span class="text-2xl font-extrabold text-white">M88</span>
          </div>
          <h1 class="text-2xl font-bold text-white">Admin Setup</h1>
          <p class="text-white/60 mt-1">Create the initial administrator account</p>
        </div>

        <div class="bg-white rounded-2xl shadow-2xl p-8" style="border: 1px solid rgba(255,255,255,0.2);">
          <div class="bg-warning-50 rounded-xl p-4 mb-6" style="border: 1px solid rgba(245,158,11,0.2);">
            <p class="text-sm text-warning-600">
              <strong>Important:</strong> This creates a Super Admin account with full system access.
              You need the secret key provided during system deployment.
            </p>
          </div>

          <form id="admin-setup-form" class="space-y-4">
            <div>
              <label for="secret-key" class="form-label">Secret Key</label>
              <input type="password" id="secret-key" class="form-input" placeholder="Enter the deployment secret key" required />
            </div>

            <div>
              <label for="full-name" class="form-label">Full Name</label>
              <input type="text" id="full-name" class="form-input" placeholder="Enter your full name" required />
            </div>

            <div>
              <label for="email" class="form-label">Email Address</label>
              <input type="email" id="email" class="form-input" placeholder="admin@madison88.com" required autocomplete="email" />
            </div>
            
            <div>
              <label for="password" class="form-label">Password</label>
              <input type="password" id="password" class="form-input" placeholder="Minimum 8 characters" required minlength="8" autocomplete="new-password" />
            </div>

            <div>
              <label for="confirm-password" class="form-label">Confirm Password</label>
              <input type="password" id="confirm-password" class="form-input" placeholder="Re-enter your password" required minlength="8" autocomplete="new-password" />
            </div>

            <button type="submit" id="setup-btn" class="btn-primary w-full">
              <span id="setup-text">Create Admin Account</span>
              <span id="setup-spinner" class="spinner hidden ml-2"></span>
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
    const form = document.getElementById('admin-setup-form');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const secretKey = document.getElementById('secret-key').value;
      const fullName = document.getElementById('full-name').value.trim();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const confirmPassword = document.getElementById('confirm-password').value;
      const btn = document.getElementById('setup-btn');
      const text = document.getElementById('setup-text');
      const spinner = document.getElementById('setup-spinner');

      if (password !== confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }

      if (password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }

      btn.disabled = true;
      text.textContent = 'Creating account...';
      spinner.classList.remove('hidden');

      try {
        await registerAdmin(email, password, fullName, secretKey);
        showToast('Admin account created! Please check your email to verify, then login.', 'success');
        navigateTo('/login');
      } catch (err) {
        // A 500 from Supabase usually means the handle_new_user database trigger
        // failed. Run supabase/004_fix_handle_new_user_trigger.sql in the
        // Supabase SQL Editor to resolve it.
        const msg = err.status === 500
          ? 'Server error creating account. Run the 004_fix_handle_new_user_trigger.sql migration in your Supabase SQL Editor, then try again.'
          : (err.message || 'Failed to create admin account');
        showToast(msg, 'error');
        btn.disabled = false;
        text.textContent = 'Create Admin Account';
        spinner.classList.add('hidden');
      }
    });
  });
}
