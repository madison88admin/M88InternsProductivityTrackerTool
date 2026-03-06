/**
 * Login Page
 */
import { login } from '../lib/auth.js';
import { renderPage } from '../lib/component.js';
import { showToast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

export function renderLoginPage() {
  renderPage(`
    <div class="min-h-screen flex items-center justify-center bg-linear-to-br from-primary-600 to-primary-800 px-4">
      <div class="w-full max-w-md">
        <div class="text-center mb-8">
          <div class="inline-flex items-center justify-center rounded-2xl shadow-lg mb-4 px-5 py-3" style="background: white;">
            <img src="/logo.png" alt="Madison 88" class="h-12 w-auto object-contain" />
          </div>
          <h1 class="text-2xl font-bold text-white">Interns Productivity Tracker</h1>
          <p class="text-primary-200 mt-1">Madison 88 Business Solutions Asia Inc.</p>
        </div>

        <div class="card shadow-xl">
          <h2 class="text-xl font-semibold text-neutral-800 mb-6">Sign In</h2>
          
          <form id="login-form" class="space-y-4">
            <div>
              <label for="email" class="form-label">Email Address</label>
              <input type="email" id="email" class="form-input" placeholder="you@madison88.com" required autocomplete="email" />
            </div>
            
            <div>
              <label for="password" class="form-label">Password</label>
              <input type="password" id="password" class="form-input" placeholder="Enter your password" required autocomplete="current-password" />
            </div>

            <button type="submit" id="login-btn" class="btn-primary w-full">
              <span id="login-text">Sign In</span>
              <span id="login-spinner" class="spinner hidden ml-2"></span>
            </button>
          </form>

          <div class="mt-4 text-center">
            <a href="#/forgot-password" class="text-sm text-primary-600 hover:text-primary-700">
              Forgot your password?
            </a>
          </div>

          <div class="mt-6 pt-4 border-t border-neutral-200 text-center">
            <a href="#/admin-setup" class="text-xs text-neutral-400 hover:text-neutral-600">
              Admin Setup
            </a>
          </div>
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
