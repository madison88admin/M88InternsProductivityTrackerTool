# Login Briefing Modal - Feature Documentation

## Overview
A morning briefing pop-up window appears when interns log in to the M88 IPT system. This modal displays critical information they need to know immediately, including pending approvals, new tasks, and overdue items. Interns can dismiss it with a "don't show again" checkbox.

---

## What Interns See

### Modal Title
**📋 Morning Briefing**

### Content Sections

#### 1. **Greeting**
- Personalized greeting with the intern's first name
- Brief message about what to expect

#### 2. **Items Requiring Attention**
Displays alerts for:
- **Pending Attendance Records** - Records waiting for approval
- **Pending Narratives** - Work narratives awaiting supervisor review
- **Overdue Tasks** - Tasks past their due date (highlighted in red)
- **New Tasks to Start** - Recently assigned tasks not yet started

Each alert shows:
- Icon and count
- Quick description
- Clickable link to relevant page

#### 3. **All Caught Up Message**
If no items require attention, displays a success message congratulating the intern.

#### 4. **Quick Action Buttons**
Four quick-access buttons to navigate to:
- **My Tasks** - View and manage assigned tasks
- **Narratives** - Submit or review narratives
- **Attendance** - View attendance status
- **Allowance** - Check computed allowance

#### 5. **Don't Show This Briefing Again**
- Checkbox to suppress the modal on next login
- Helpful note that it can be reset in settings
- Preference stored locally (not in database)

---

## How It Works

### When It Appears
- **Trigger**: Dashboard loads after login
- **Who sees it**: Interns only (supervisors and admins do NOT see this)
- **Frequency**: Once per session (after page refresh or new login)

### Preference Storage
- **Storage method**: Browser localStorage
- **Key format**: `briefing_dismissed_{internId}`
- **Data stored**: 
  ```json
  {
    "dismissed": true,
    "timestamp": "2025-04-08T08:30:00Z"
  }
  ```

### How to Reset (For Testing)
If you need to show the briefing again:
1. Open browser Developer Tools (F12)
2. Go to Console tab
3. Run: `localStorage.removeItem('briefing_dismissed_<internId>')`
4. Refresh the page

Or programmatically via JavaScript console:
```javascript
import { resetBriefingPreference } from './src/lib/login-briefing.js';
resetBriefingPreference('intern-uuid-here');
```

---

## Data Displayed

### Pending Attendance
- Shows up to 5 most recent pending attendance records
- Source: `attendance_records` table where `status = 'pending'`

### Pending Narratives
- Shows up to 5 most recent pending narratives
- Source: `narratives` table where `status = 'pending'`

### Overdue Tasks
- Shows up to 5 overdue tasks
- Criteria: `due_date < today` AND `status != 'completed'` AND `is_archived = false`
- Highlighted in red (danger color) as high priority

### New Tasks to Start
- Shows up to 5 not-started tasks
- Source: `tasks` table where `status = 'not_started'` AND `is_archived = false`
- Ordered by due date (nearest first)

---

## User Experience

### First Login (After Set Password)
1. Intern logs in
2. Dashboard loads
3. **Morning Briefing modal appears automatically**
4. Intern can:
   - Click on any alert to navigate to that page
   - Use quick action buttons
   - Check "don't show again" and close
   - Click the X button to close modal

### Subsequent Logins
- If "don't show again" was checked: **Modal does NOT appear**
- If "don't show again" was NOT checked: **Modal appears again**
- Interns can always clear their preference in browser settings

---

## File Structure

```
src/
├── lib/
│   └── login-briefing.js      (NEW - Main modal component)
│
└── pages/
    └── dashboard.js            (MODIFIED - Integrates briefing modal)
```

---

## Code Reference

### Main Component: `/src/lib/login-briefing.js`

#### Key Functions

**`openLoginBriefingModal(internId, internName)`**
- Opens the briefing modal
- Fetches pending data from Supabase
- Parameters:
  - `internId` (UUID) - Intern's user ID
  - `internName` (string) - Intern's display name

**`shouldShowBriefing(userId)`**
- Returns: `true` if modal should show, `false` if dismissed
- Checks localStorage for dismissal record

**`dismissBriefing(userId)`**
- Marks briefing as dismissed in localStorage
- Called when intern checks "don't show again"

**`resetBriefingPreference(userId)`**
- Removes dismissal record from localStorage
- Useful for testing or admin reset features
- **Export**: Yes (can be called from outside)

### Dashboard Integration: `/src/pages/dashboard.js`

```javascript
// Imported
import { openLoginBriefingModal, shouldShowBriefing } from '../lib/login-briefing.js';

// In renderLayout callback (interns only)
if (role === 'intern' && profile && shouldShowBriefing(profile.id)) {
  requestAnimationFrame(() => {
    openLoginBriefingModal(profile.id, profile.full_name || 'Intern');
  });
}
```

---

## Customization Guide

### Change Alert Types
Edit the `fetchBriefingData()` function in `login-briefing.js` to modify what data is fetched.

### Modify Colors
Search for `color-primary`, `color-danger`, etc. in the HTML template (styled inline).

### Add More Quick Actions
Add buttons in the "Quick Links Section" of the modal content.

### Change localStorage Behavior
Modify the `dismissBriefing()` and `shouldShowBriefing()` functions to use a different storage mechanism (e.g., database table).

---

## Testing Checklist

### ✓ Modal Display
- [ ] Login as intern
- [ ] Dashboard loads
- [ ] Modal appears automatically
- [ ] Modal displays after page refresh

### ✓ Content Display
- [ ] Greeting shows intern's name
- [ ] Pending items display with correct counts
- [ ] "All caught up!" shows when no items pending
- [ ] Quick action buttons visible and clickable

### ✓ Dismissal Feature
- [ ] Check "don't show again" checkbox
- [ ] Close modal
- [ ] Refresh page / log out and log in again
- [ ] Modal does NOT appear

### ✓ Reset for Testing
- [ ] Open browser console (F12)
- [ ] Run: `localStorage.removeItem('briefing_dismissed_<id>')`
- [ ] Refresh page
- [ ] Modal appears again

### ✓ Role-Based Display
- [ ] Login as supervisor → Modal should NOT appear
- [ ] Login as admin → Modal should NOT appear
- [ ] Login as intern → Modal should appear

### ✓ Data Accuracy
- [ ] Pending attendance count matches actual pending records
- [ ] Pending narratives count is accurate
- [ ] Overdue tasks are correctly identified
- [ ] New tasks list includes only not_started items

---

## Troubleshooting

### Modal Not Appearing
1. Verify you're logged in as an **intern** (not supervisor/admin)
2. Check localStorage isn't blocking the check:
   ```javascript
   localStorage.getItem('briefing_dismissed_<internId>')
   ```
   If it returns a value, the modal was dismissed. Clear it to reset.
3. Check browser console for errors (F12)
4. Ensure JavaScript is enabled

### Data Not Showing
1. Check Supabase connection (network tab in F12)
2. Verify RLS policies allow reading pending records
3. Check if any records actually exist in database
4. Look for console errors (F12 → Console tab)

### Modal Appears Multiple Times
1. This shouldn't happen unless page reloads/navigates
2. Each dashboard load triggers the check once per session
3. If concerned, check localStorage keys

---

## Security & Privacy

### Data Fetched
- Only the current intern's own records
- Filtered by `intern_id = profile.id`
- RLS policies enforce data access constraints

### Storage Method
- localStorage (client-side, no server transmission)
- Contains only dismissal flag and timestamp
- NOT a security credential

### No Database Changes
- Feature uses existing tables only
- No new schema modifications needed

---

## Future Enhancements

Potential improvements for future iterations:

1. **Persistent Preference** - Store "don't show again" in database instead of localStorage
2. **Auto-Dismiss** - Automatically close after 30 seconds
3. **Sound Alert** - Play a notification sound for overdue tasks
4. **Email Integration** - Email briefing to intern at start of day
5. **Customizable Alerts** - Let admins configure which alerts to show
6. **Multiple Themes** - Dark mode support for the modal
7. **Modal Timing** - Show at specific times rather than always on login
8. **Historical View** - Show yesterday's pending items that have been resolved

---

## Contact & Support

For questions about implementation or customization, refer to:
- Component Source: `src/lib/login-briefing.js`
- Integration Point: `src/pages/dashboard.js` (lines ~27-31)
- Modal System: Reuses existing `createModal()` from `src/lib/component.js`
