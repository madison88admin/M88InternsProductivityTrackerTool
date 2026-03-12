/**
 * Profile Page
 * View and edit own profile, upload avatar, change password.
 */
import { getProfile, refreshProfile, updatePassword } from '../lib/auth.js';
import { renderLayout } from '../components/layout.js';
import { supabase } from '../lib/supabase.js';
import { showToast } from '../lib/toast.js';
import { logAudit } from '../lib/audit.js';
import { icons } from '../lib/icons.js';
import { formatDate, formatHoursDisplay, computeEstimatedEndDate } from '../lib/utils.js';

export async function renderProfilePage() {
  const profile = getProfile();

  // Get OJT progress if intern
  let ojtInfo = null;
  if (profile.role === 'intern') {
    const { data: attendance } = await supabase
      .from('attendance_records')
      .select('total_hours')
      .eq('intern_id', profile.id)
      .eq('status', 'approved');
    const completedHours = (attendance || []).reduce((s, r) => s + (r.total_hours || 0), 0);
    const daysWorked = (attendance || []).length;
    ojtInfo = { completed: completedHours, required: profile.hours_required || 500, daysWorked };
  }

  let estimatedEnd = null;
  if (ojtInfo && ojtInfo.completed < ojtInfo.required && ojtInfo.required > 0) {
    estimatedEnd = computeEstimatedEndDate(ojtInfo.required, ojtInfo.completed, ojtInfo.daysWorked);
  }

  const avatarUrl = profile.avatar_url
    ? supabase.storage.from('avatars').getPublicUrl(profile.avatar_url).data.publicUrl
    : null;

  renderLayout(`
    <div class="page-header animate-fade-in-up">
      <h1 class="page-title">My Profile</h1>
      <p class="page-subtitle">Manage your personal information and preferences</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Profile Card -->
      <div class="card text-center">
        <div class="relative inline-block mx-auto mb-5">
          <div id="avatar-container" class="w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold mx-auto overflow-hidden" style="background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-400));">
            ${avatarUrl
              ? `<img src="${avatarUrl}" class="w-full h-full object-cover" alt="Avatar" />`
              : profile.full_name?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <label class="absolute bottom-0 right-0 w-8 h-8 bg-white text-primary-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-primary-50 transition-colors shadow-md" style="border: 2px solid var(--color-primary-100);">
            ${icons.edit}
            <input type="file" id="avatar-input" class="hidden" accept="image/png,image/jpeg,image/webp" />
          </label>
        </div>
        <h2 class="text-xl font-bold text-neutral-900">${profile.full_name}</h2>
        <p class="text-neutral-500 text-sm mt-1">${profile.email}</p>
        <span class="badge-primary mt-3 inline-block capitalize">${profile.role}</span>

        ${ojtInfo ? `
          <div class="mt-6 pt-5" style="border-top: 1px solid var(--color-neutral-100);">
            <p class="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-3">OJT Progress</p>
            <div class="progress-bar-track mb-3">
              <div class="progress-bar-fill" style="width: ${Math.min(100, (ojtInfo.completed / ojtInfo.required * 100)).toFixed(1)}%"></div>
            </div>
            <p class="text-sm font-semibold text-neutral-900">${formatHoursDisplay(ojtInfo.completed)} / ${formatHoursDisplay(ojtInfo.required)}</p>
            <p class="text-xs text-neutral-400 mt-0.5">${Math.min(100, (ojtInfo.completed / ojtInfo.required * 100)).toFixed(1)}% complete</p>
            ${estimatedEnd ? `<p class="text-xs text-primary-500 mt-2">${icons.calendar} Est. completion: ${formatDate(estimatedEnd)}</p>` : ojtInfo.completed >= ojtInfo.required ? `<p class="text-xs text-success-500 mt-2">✅ OJT Completed!</p>` : ''}
          </div>
        ` : ''}
      </div>

      <!-- Edit Profile -->
      <div class="lg:col-span-2 space-y-6">
        <div class="card">
          <h3 class="text-base font-bold text-neutral-900 mb-4">Personal Information</h3>
          <form id="profile-form" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="form-label">Full Name</label>
                <input type="text" id="full-name" class="form-input" value="${profile.full_name || ''}" required />
              </div>
              <div>
                <label class="form-label">Email</label>
                <input type="email" class="form-input bg-neutral-50" value="${profile.email}" disabled />
              </div>
              <div>
                <label class="form-label">Phone</label>
                <input type="tel" id="phone" class="form-input" value="${profile.phone || ''}" />
              </div>
              ${profile.role === 'intern' ? `
                <div>
                  <label class="form-label">School</label>
                  <input type="text" id="school" class="form-input" value="${profile.school || ''}" />
                </div>
                <div>
                  <label class="form-label">Course</label>
                  <input type="text" id="course" class="form-input" value="${profile.course || ''}" />
                </div>
                <div>
                  <label class="form-label">OJT Start Date</label>
                  <input type="date" class="form-input bg-neutral-50" value="${profile.ojt_start_date || ''}" disabled />
                </div>
                <div>
                  <label class="form-label">OJT End Date</label>
                  <input type="date" class="form-input bg-neutral-50" value="${profile.ojt_end_date || ''}" disabled />
                </div>
              ` : ''}
            </div>
            <div class="flex justify-end">
              <button type="submit" class="btn-primary">Save Changes</button>
            </div>
          </form>
        </div>

        <!-- Change Password -->
        <div class="card">
          <h3 class="text-base font-bold text-neutral-900 mb-4">Change Password</h3>
          <form id="password-form" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label class="form-label">New Password</label>
                <input type="password" id="new-password" class="form-input" minlength="8" required />
              </div>
              <div>
                <label class="form-label">Confirm Password</label>
                <input type="password" id="confirm-password" class="form-input" minlength="8" required />
              </div>
            </div>
            <div class="flex justify-end">
              <button type="submit" class="btn-secondary">Update Password</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `, (el) => {
    // Avatar upload
    el.querySelector('#avatar-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 2 * 1024 * 1024) {
        showToast('Image must be under 2MB', 'error');
        return;
      }

      try {
        const ext = file.name.split('.').pop();
        const fileName = `${profile.id}.${ext}`;
        const { error: uploadErr } = await supabase.storage.from('avatars').upload(fileName, file, { upsert: true });
        if (uploadErr) throw uploadErr;

        await supabase.from('profiles').update({ avatar_url: fileName }).eq('id', profile.id);
        await refreshProfile();
        showToast('Avatar updated', 'success');
        renderProfilePage();
      } catch (err) {
        showToast(err.message || 'Failed to upload avatar', 'error');
      }
    });

    // Profile form
    el.querySelector('#profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const updates = {
          full_name: el.querySelector('#full-name').value,
          phone: el.querySelector('#phone')?.value || null,
        };
        if (profile.role === 'intern') {
          updates.school = el.querySelector('#school')?.value || null;
          updates.course = el.querySelector('#course')?.value || null;
        }

        const { error } = await supabase.from('profiles').update(updates).eq('id', profile.id);
        if (error) throw error;

        await refreshProfile();
        await logAudit('profile.updated', 'profile', profile.id);
        showToast('Profile updated', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to update', 'error');
      }
    });

    // Password form
    el.querySelector('#password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPwd = el.querySelector('#new-password').value;
      const confirmPwd = el.querySelector('#confirm-password').value;

      if (newPwd !== confirmPwd) {
        showToast('Passwords do not match', 'error');
        return;
      }

      try {
        await updatePassword(newPwd);
        showToast('Password updated', 'success');
        el.querySelector('#password-form').reset();
      } catch (err) {
        showToast(err.message || 'Failed to update password', 'error');
      }
    });
  }, '/profile');
}
