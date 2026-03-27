/**
 * Login Page
 */
import { login } from '../lib/auth.js';
import { renderPage } from '../lib/component.js';
import { showToast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';
import { supabase } from '../lib/supabase.js';

export async function renderLoginPage() {
  // Fetch security settings before rendering
  let forgotPasswordEnabled = true;
  let adminAccountEnabled = true;

  try {
    const { data: settings } = await supabase
      .from('system_settings')
      .select('*');

    const settingsMap = {};
    (settings || []).forEach(s => { settingsMap[s.key] = s; });

    const forgotPasswordSettings = settingsMap.enable_forgot_password?.value || {};
    forgotPasswordEnabled = forgotPasswordSettings.enabled !== false;

    const adminAccountSettings = settingsMap.enable_admin_account_creation?.value || {};
    adminAccountEnabled = adminAccountSettings.enabled !== false;
  } catch (err) {
    console.error('Failed to fetch security settings:', err);
    // Default to enabled for backward compatibility
  }

  /**
   * Show Terms and Conditions modal (view-only)
   * User can read the full terms by clicking the link
   */
  function showTermsModal() {
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const modalOverlay = document.createElement('div');
    modalOverlay.className = 'modal-backdrop';

    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = 'max-width: 52rem; overflow: hidden; display: flex; flex-direction: column; max-height: 88vh;';

    const header = document.createElement('div');
    header.className = 'modal-header flex-shrink-0';
    header.innerHTML = `
      <div>
        <h3 class="text-lg font-bold text-neutral-900">Terms and Conditions</h3>
        <p class="text-xs text-neutral-500 mt-0.5">Madison 88 Business Solutions Asia Inc. — M88 IPT · Effective ${today}</p>
      </div>
      <button type="button" class="modal-close" aria-label="Close">&times;</button>
    `;

    const body = document.createElement('div');
    body.className = 'modal-body flex-1 overflow-y-auto';
    body.innerHTML = `
      <div class="space-y-5 text-sm">

        <!-- Intro -->
        <div class="rounded-xl border p-4 leading-relaxed" style="border-color: var(--color-primary-200); background: var(--color-primary-50); color: var(--color-primary-800);">
          By accessing and using the M88 IPT system, you acknowledge that you have read, understood, and agree to be bound by these Terms and Conditions.
          <strong>You are liable for your actions and may face consequences if you violate any of these terms.</strong>
        </div>

        <!-- Section 1 -->
        <div class="space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: var(--color-primary-600);">1</div>
            <h4 class="font-bold text-neutral-900 text-xs uppercase tracking-wider">System Purpose and User Responsibilities</h4>
          </div>
          <p class="text-neutral-600 leading-relaxed ml-8">The M88 IPT system tracks OJT activities including attendance, task management, work narratives, and allowance computation. As a user, you agree to:</p>
          <div class="ml-8 space-y-4">
            <div>
              <p class="font-semibold text-neutral-800 text-xs uppercase tracking-wide mb-2">a) Accurate Attendance Tracking</p>
              <ul class="space-y-1.5 text-neutral-600">
                <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Record attendance truthfully and punch in/out only when physically present at the designated location</span></li>
                <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Never falsify, manipulate, or misrepresent your attendance records</span></li>
                <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Comply with all holiday lockouts and company-mandated non-working date restrictions</span></li>
              </ul>
            </div>
            <div>
              <p class="font-semibold text-neutral-800 text-xs uppercase tracking-wide mb-2">b) Timely Task Management</p>
              <ul class="space-y-1.5 text-neutral-600">
                <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Submit task statuses and updates within required timeframes</span></li>
                <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Provide honest and detailed task completion narratives</span></li>
                <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Only update task status when work has been genuinely performed</span></li>
              </ul>
            </div>
            <div>
              <p class="font-semibold text-neutral-800 text-xs uppercase tracking-wide mb-2">c) Data Integrity</p>
              <div class="rounded-xl border p-3.5" style="border-color: var(--color-warning-200); background: var(--color-warning-50);">
                <p class="font-semibold text-xs mb-2" style="color: var(--color-warning-800);">⚠  You are personally liable for all data you submit. Falsifying records may result in:</p>
                <div class="grid grid-cols-2 gap-1 text-xs" style="color: var(--color-warning-700);">
                  <div class="flex gap-1.5"><span>•</span><span>Rejection of allowance claims</span></div>
                  <div class="flex gap-1.5"><span>•</span><span>System deactivation</span></div>
                  <div class="flex gap-1.5"><span>•</span><span>Escalation to management</span></div>
                  <div class="flex gap-1.5"><span>•</span><span>Legal investigation</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t" style="border-color: var(--color-neutral-100);"></div>

        <!-- Section 2 -->
        <div class="space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: var(--color-primary-600);">2</div>
            <h4 class="font-bold text-neutral-900 text-xs uppercase tracking-wider">Company Confidentiality and Non-Disclosure</h4>
          </div>
          <p class="text-neutral-600 leading-relaxed ml-8">During your OJT, you will access confidential information belonging to Madison 88 Business Solutions Asia Inc. You agree to protect and never disclose any:</p>
          <ul class="ml-8 space-y-1.5 text-neutral-600">
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Client lists, contact information, and business relationships</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Internal processes, workflows, and operating procedures</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Financial information, strategies, and business plans</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Work product and documents created during your OJT</span></li>
          </ul>
          <p class="ml-8 text-neutral-600">Confidentiality obligations <strong class="text-neutral-900">continue after your OJT ends</strong>. Violations may result in legal action and liability for damages.</p>
        </div>

        <div class="border-t" style="border-color: var(--color-neutral-100);"></div>

        <!-- Section 3 -->
        <div class="space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: var(--color-danger-600);">3</div>
            <h4 class="font-bold text-neutral-900 text-xs uppercase tracking-wider">Consequences of Violations</h4>
          </div>
          <div class="ml-8 rounded-xl border p-4" style="border-color: var(--color-danger-200); background: var(--color-danger-50);">
            <p class="text-xs font-semibold mb-3" style="color: var(--color-danger-800);">Violations of these terms may result in any or all of the following:</p>
            <div class="grid grid-cols-2 gap-y-2 gap-x-4 text-xs" style="color: var(--color-danger-700);">
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Formal written warning</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Temporary or permanent deactivation</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Rejection of allowance claims</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Escalation to HR and management</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Investigation of false submissions</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>OJT program termination</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Legal action for breach</span></div>
              <div class="flex gap-1.5"><span class="shrink-0">⚠</span><span>Reporting to your institution</span></div>
            </div>
          </div>
          <p class="ml-8 text-xs text-neutral-500">All violations are logged in the system audit trail and may be reviewed by administrators at any time.</p>
        </div>

        <div class="border-t" style="border-color: var(--color-neutral-100);"></div>

        <!-- Section 4 -->
        <div class="space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: var(--color-primary-600);">4</div>
            <h4 class="font-bold text-neutral-900 text-xs uppercase tracking-wider">Data Handling and Privacy</h4>
          </div>
          <ul class="ml-8 space-y-1.5 text-neutral-600">
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Your data is stored securely in our cloud infrastructure</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Only authorized personnel and system administrators can access your records</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>E-signatures and approvals in this system are legally binding commitments</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-primary-500);">•</span><span>Data retention follows company data privacy policies</span></li>
          </ul>
        </div>

        <div class="border-t" style="border-color: var(--color-neutral-100);"></div>

        <!-- Section 5 -->
        <div class="space-y-3">
          <div class="flex items-center gap-2.5">
            <div class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0" style="background: var(--color-primary-600);">5</div>
            <h4 class="font-bold text-neutral-900 text-xs uppercase tracking-wider">Acknowledgment and Acceptance</h4>
          </div>
          <p class="ml-8 text-neutral-600 leading-relaxed">By clicking <strong class="text-neutral-900">Accept and Login</strong>, you certify that you have read and understood this entire document and agree to:</p>
          <ul class="ml-8 space-y-1.5 text-neutral-600">
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-success-600);">✓</span><span>Comply with all terms and policies described herein</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-success-600);">✓</span><span>Accept personal liability for violations and their consequences</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-success-600);">✓</span><span>Acknowledge that administrators may update these terms at any time</span></li>
            <li class="flex gap-2"><span class="font-bold mt-px shrink-0" style="color: var(--color-success-600);">✓</span><span>Understand that continued system access constitutes ongoing acceptance</span></li>
          </ul>
        </div>

        <!-- Footer branding -->
        <div class="text-center text-xs pt-2" style="color: var(--color-neutral-400);">
          Madison 88 Business Solutions Asia Inc. — M88 Interns Productivity Tracker System
        </div>

      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = `
      <button type="button" id="terms-close-btn" class="btn-primary">Close</button>
    `;

    modalContent.appendChild(header);
    modalContent.appendChild(body);
    modalContent.appendChild(footer);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);

    const closeBtn = footer.querySelector('#terms-close-btn');
    const headerCloseBtn = header.querySelector('.modal-close');

    // Close on button click
    closeBtn.addEventListener('click', () => {
      modalOverlay.remove();
    });

    // Close on header X click
    headerCloseBtn.addEventListener('click', () => {
      modalOverlay.remove();
    });

    // Close on backdrop click
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });
  }

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
            <h1 class="text-2xl font-bold text-neutral-900">Interns Productivity Tracker</h1>
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
                ${forgotPasswordEnabled ? `
                <a href="#/forgot-password" class="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors">
                  Forgot password?
                </a>
                ` : ''}
              </div>
              <input type="password" id="password" class="form-input" placeholder="Enter your password" required autocomplete="current-password" />
            </div>

            <div class="pt-2">
              <label class="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" id="terms-checkbox" class="w-4 h-4 mt-0.5 shrink-0 cursor-pointer" style="accent-color: var(--color-primary-600);" required />
                <span class="text-sm text-neutral-600 leading-relaxed">
                  I have read and agree to the <button type="button" id="view-terms-link" class="text-primary-600 hover:text-primary-700 font-medium underline">Terms and Conditions</button> of M88 IPT
                </span>
              </label>
            </div>

            <button type="submit" id="login-btn" class="btn-primary w-full py-3! text-base!">
              <span id="login-text">Sign In</span>
              <span id="login-spinner" class="spinner hidden ml-2"></span>
            </button>
          </form>

          <div class="mt-8 pt-6 text-center" style="border-top: 1px solid var(--color-neutral-200);">
            ${adminAccountEnabled ? `
            <a href="#/admin-setup" class="text-xs text-neutral-400 hover:text-neutral-600 transition-colors">
              First time? Set up admin account
            </a>
            ` : ''}
          </div>

          <p class="text-center text-xs text-neutral-400 mt-8">
            &copy; ${new Date().getFullYear()} Madison 88 Business Solutions Asia Inc.
          </p>
        </div>
      </div>
    </div>
  `, () => {
    const form = document.getElementById('login-form');
    const viewTermsLink = document.getElementById('view-terms-link');

    // Open Terms modal when link is clicked
    viewTermsLink.addEventListener('click', (e) => {
      e.preventDefault();
      showTermsModal();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const termsCheckbox = document.getElementById('terms-checkbox');
      const btn = document.getElementById('login-btn');
      const text = document.getElementById('login-text');
      const spinner = document.getElementById('login-spinner');

      // Check if terms are accepted
      if (!termsCheckbox.checked) {
        showToast('You must accept the Terms and Conditions to sign in', 'warning');
        return;
      }

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
