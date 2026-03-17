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
    <div class="min-h-screen flex">
      <!-- Left side — Brand panel -->
      <div class="hidden lg:flex lg:w-1/2 relative overflow-hidden items-center justify-center" style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 50%, #818cf8 100%);">
        <div class="absolute inset-0" style="background: radial-gradient(circle at 30% 20%, rgba(255,255,255,0.1) 0%, transparent 50%), radial-gradient(circle at 70% 80%, rgba(255,255,255,0.08) 0%, transparent 50%);"></div>
        <!-- Decorative shapes -->
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

      <!-- Right side — Admin Setup form -->
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

          <div>
            <h2 class="text-2xl font-bold text-neutral-900">Admin Setup</h2>
            <p class="text-neutral-500 mt-2 text-sm">Create the initial administrator account</p>
          </div>

          <div class="mt-6 bg-warning-50 rounded-xl p-4" style="border: 1px solid rgba(245,158,11,0.2);">
            <p class="text-sm text-warning-600">
              <strong>Important:</strong> This creates a Super Admin account with full system access.
              You need the secret key provided during system deployment.
            </p>
          </div>

          <form id="admin-setup-form" class="mt-6 space-y-5">
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

            <button type="submit" id="setup-btn" class="btn-primary w-full py-3! text-base!">
              <span id="setup-text">Create Admin Account</span>
              <span id="setup-spinner" class="spinner hidden ml-2"></span>
            </button>
          </form>

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
        showToast('Admin account created! You can now log in.', 'success');
        navigateTo('/login');
      } catch (err) {
        showToast(err.message || 'Failed to create admin account', 'error');
        btn.disabled = false;
        text.textContent = 'Create Admin Account';
        spinner.classList.add('hidden');
      }
    });
  });
}
