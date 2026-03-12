/**
 * Login Page
 */
import { login } from '../lib/auth.js';
import { renderPage } from '../lib/component.js';
import { showToast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

export function renderLoginPage() {
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

      <!-- Right side — Login form -->
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
            <h2 class="text-2xl font-bold text-neutral-900">Welcome back</h2>
            <p class="text-neutral-500 mt-2 text-sm">Sign in to your account to continue</p>
          </div>

          <form id="login-form" class="mt-8 space-y-5">
            <div>
              <label for="email" class="form-label">Email Address</label>
              <input type="email" id="email" class="form-input" placeholder="you@madison88.com" required autocomplete="email" />
            </div>
            
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label for="password" class="form-label mb-0!">Password</label>
                <a href="#/forgot-password" class="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">
                  Forgot password?
                </a>
              </div>
              <input type="password" id="password" class="form-input" placeholder="Enter your password" required autocomplete="current-password" />
            </div>

            <button type="submit" id="login-btn" class="btn-primary w-full py-3! text-base!">
              <span id="login-text">Sign In</span>
              <span id="login-spinner" class="spinner hidden ml-2"></span>
            </button>
          </form>

          <div class="mt-8 pt-6 text-center" style="border-top: 1px solid var(--color-neutral-200);">
            <a href="#/admin-setup" class="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
              First time? Set up admin account
            </a>
          </div>

          <p class="text-center text-xs text-neutral-400 mt-8">
            &copy; ${new Date().getFullYear()} Madison 88 Business Solutions Asia Inc.
          </p>
        </div>
      </div>
    </div>
  `, () => {
    const form = document.getElementById('login-form');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const btn = document.getElementById('login-btn');
      const text = document.getElementById('login-text');
      const spinner = document.getElementById('login-spinner');

      btn.disabled = true;
      text.textContent = 'Signing in...';
      spinner.classList.remove('hidden');

      try {
        await login(email, password);
        showToast('Welcome back!', 'success');
        navigateTo('/dashboard');
      } catch (err) {
        showToast(err.message || 'Invalid email or password', 'error');
        btn.disabled = false;
        text.textContent = 'Sign In';
        spinner.classList.add('hidden');
      }
    });
  });
}
