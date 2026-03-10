# M88 Interns Productivity Tracker Tool — Complete Testing Guide

> **Version:** 1.0  
> **Date:** March 9, 2026  
> **Scope:** Full functional, role-based, and scenario testing for all pages, features, and access-control rules.

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Test User Accounts Required](#2-test-user-accounts-required)
3. [Authentication & Access Control](#3-authentication--access-control)
4. [Admin Setup (First Run)](#4-admin-setup-first-run)
5. [Login & Forgot Password](#5-login--forgot-password)
6. [Dashboard (All Roles)](#6-dashboard-all-roles)
7. [Attendance — Intern](#7-attendance--intern)
8. [My Tasks — Intern](#8-my-tasks--intern)
9. [Daily Narratives — Intern](#9-daily-narratives--intern)
10. [My Allowance — Intern](#10-my-allowance--intern)
11. [Approvals — Supervisor / Admin](#11-approvals--supervisor--admin)
12. [Task Management — Supervisor / Admin](#12-task-management--supervisor--admin)
13. [Team Attendance — Supervisor](#13-team-attendance--supervisor)
14. [Team Narratives — Supervisor](#14-team-narratives--supervisor)
15. [Allowance Management — HR / Admin](#15-allowance-management--hr--admin)
16. [Reports — HR / Admin](#16-reports--hr--admin)
17. [Intern Directory — HR / Admin](#17-intern-directory--hr--admin)
18. [Attendance Overview — HR / Admin](#18-attendance-overview--hr--admin)
19. [Departments — HR / Admin](#19-departments--hr--admin)
20. [User Management — Admin](#20-user-management--admin)
21. [Locations — Admin](#21-locations--admin)
22. [Audit Logs — Admin](#22-audit-logs--admin)
23. [System Settings — Admin](#23-system-settings--admin)
24. [Notifications (All Roles)](#24-notifications-all-roles)
25. [Profile (All Roles)](#25-profile-all-roles)
26. [End-to-End Workflow Scenarios](#26-end-to-end-workflow-scenarios)
27. [Security & RLS Verification](#27-security--rls-verification)
28. [Edge Cases & Negative Tests](#28-edge-cases--negative-tests)

---

## 1. Test Environment Setup

### Prerequisites
| Item | Requirement |
|------|-------------|
| Supabase project | Provisioned with `001_schema.sql` and `002_rls_policies.sql` executed |
| Environment file | `.env` with `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_SECRET_KEY` set |
| Dev server | `npm run dev` running — app accessible at `http://localhost:5173` (or Netlify preview) |
| Browser | Chrome/Edge recommended (DevTools open for console monitoring) |
| Email service | Supabase email configured (for invite magic-link testing; can use Inbucket locally) |

### Before Starting Each Test Session
1. Open browser DevTools → Console tab; watch for JavaScript errors throughout testing.
2. Open Supabase Dashboard → Table Editor for direct DB verification.
3. Clear browser `localStorage` / session if switching user roles: DevTools → Application → Clear Storage.

---

## 2. Test User Accounts Required

Create the following accounts to cover all role scenarios:

| # | Role | Suggested Email | Notes |
|---|------|-----------------|-------|
| 1 | Admin | `admin@test.com` | Created via `/admin-setup` with `VITE_ADMIN_SECRET_KEY` |
| 2 | HR | `hr@test.com` | Invited by Admin |
| 3 | Supervisor A | `supervisor.a@test.com` | Invited by Admin; assigned to Location A |
| 4 | Supervisor B | `supervisor.b@test.com` | Invited by Admin; different team |
| 5 | Intern A | `intern.a@test.com` | Assigned under Supervisor A |
| 6 | Intern B | `intern.b@test.com` | Assigned under Supervisor A (second intern same team) |
| 7 | Intern C | `intern.c@test.com` | Assigned under Supervisor B (cross-team isolation test) |

### Supporting Data Required
- At least **2 Locations** (e.g., "Main Office", "Branch Office")
- At least **2 Departments** (e.g., "IT Department", "Marketing")
- All interns must have `supervisor_id`, `department_id`, `location_id`, `hours_required` set

---

## 3. Authentication & Access Control

### TC-AUTH-001: Unauthenticated User Redirect
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/dashboard` while not logged in | Redirected to `/#/login` |
| 2 | Navigate to `/#/attendance` while not logged in | Redirected to `/#/login` |
| 3 | Navigate to `/#/admin-setup` while not logged in | Loads admin setup page (public route) |
| 4 | Navigate to `/#/forgot-password` while not logged in | Loads forgot password page (public route) |

### TC-AUTH-002: Authenticated User Redirect from Public Routes
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as any user, then navigate to `/#/login` | Redirected to `/#/dashboard` |
| 2 | Log in as any user, then navigate to `/#/forgot-password` | Redirected to `/#/dashboard` |

### TC-AUTH-003: Role-Based Route Enforcement
| Route | Intern | Supervisor | HR | Admin | Expected for Unauthorized |
|-------|--------|------------|----|----|--------------------------|
| `/#/attendance` | ✅ | ❌ | ❌ | ❌ | Toast error + redirect to `/dashboard` |
| `/#/my-tasks` | ✅ | ❌ | ❌ | ❌ | Toast error + redirect |
| `/#/narratives` | ✅ | ❌ | ❌ | ❌ | Toast error + redirect |
| `/#/my-allowance` | ✅ | ❌ | ❌ | ❌ | Toast error + redirect |
| `/#/approvals` | ❌ | ✅ | ❌ | ✅ | Toast error + redirect |
| `/#/task-management` | ❌ | ✅ | ❌ | ✅ | Toast error + redirect |
| `/#/team-attendance` | ❌ | ✅ | ❌ | ❌ | Toast error + redirect |
| `/#/team-narratives` | ❌ | ✅ | ❌ | ❌ | Toast error + redirect |
| `/#/allowance-management` | ❌ | ❌ | ✅ | ✅ | Toast error + redirect |
| `/#/reports` | ❌ | ❌ | ✅ | ✅ | Toast error + redirect |
| `/#/intern-directory` | ❌ | ❌ | ✅ | ✅ | Toast error + redirect |
| `/#/attendance-overview` | ❌ | ❌ | ✅ | ✅ | Toast error + redirect |
| `/#/departments` | ❌ | ❌ | ✅ | ✅ | Toast error + redirect |
| `/#/user-management` | ❌ | ❌ | ❌ | ✅ | Toast error + redirect |
| `/#/locations` | ❌ | ❌ | ❌ | ✅ | Toast error + redirect |
| `/#/audit-logs` | ❌ | ❌ | ❌ | ✅ | Toast error + redirect |
| `/#/system-settings` | ❌ | ❌ | ❌ | ✅ | Toast error + redirect |
| `/#/dashboard` | ✅ | ✅ | ✅ | ✅ | All roles can access |
| `/#/profile` | ✅ | ✅ | ✅ | ✅ | All roles can access |
| `/#/notifications` | ✅ | ✅ | ✅ | ✅ | All roles can access |

**How to test each unauthorized row:**
1. Log in as the role that should NOT have access
2. Manually type the route in the URL bar
3. Verify: toast "You do not have permission to access this page" appears, user lands on `/dashboard`

---

## 4. Admin Setup (First Run)

**Route:** `/#/admin-setup`

### TC-SETUP-001: Valid Admin Registration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/admin-setup` | Admin setup form displayed |
| 2 | Enter valid email, full name, password (8+ chars), and correct `VITE_ADMIN_SECRET_KEY` | Form submits without error |
| 3 | Check Supabase Auth → Users | New user created with `role = 'admin'` in `profiles` table |
| 4 | After success | Redirected to `/login` or `/dashboard` |

### TC-SETUP-002: Wrong Secret Key
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit form with incorrect secret key | Error toast: "Invalid secret key." |
| 2 | No user created in Supabase | Verify in dashboard — no new record |

### TC-SETUP-003: Duplicate Email
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Try to register with an already-existing email | Supabase auth error shown as toast |

---

## 5. Login & Forgot Password

**Routes:** `/#/login`, `/#/forgot-password`

### TC-LOGIN-001: Successful Login
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter valid email + password | Login succeeds |
| 2 | Observer redirect | Lands on `/#/dashboard` |
| 3 | Check profile in sidebar | Name and role badge displayed correctly |

### TC-LOGIN-002: Invalid Credentials
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter valid email + wrong password | Toast error: Supabase auth error message |
| 2 | Enter non-existent email | Toast error shown |

### TC-LOGIN-003: Empty Fields
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit with empty email field | HTML5 validation prevents submission |
| 2 | Submit with empty password | HTML5 validation prevents submission |

### TC-LOGIN-004: Forgot Password Flow
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Forgot Password" link on login page | Navigates to `/#/forgot-password` |
| 2 | Enter registered email | Toast success: "Password reset email sent" |
| 3 | Check email inbox | Reset email received with link to `/#/reset-password` |
| 4 | Enter non-existent email | Supabase error OR toast shown (does not leak user existence) |

---

## 6. Dashboard (All Roles)

### TC-DASH-001: Intern Dashboard
**Login as:** Intern A

| Step | Check | Expected |
|------|-------|---------|
| 1 | Welcome message | "Welcome back, [First Name]!" displayed |
| 2 | Today's Status card | Shows "Not Logged" if no attendance today; "Logged In" if only morning punches done; "Complete" if all 4 punches done |
| 3 | Active Tasks card | Correct count of `not_started + in_progress` tasks |
| 4 | Pending Narratives card | Correct count of narratives with `status = 'pending'` |
| 5 | Notifications card | Correct unread count |
| 6 | OJT Progress bar | Correct % based on `hours_rendered / hours_required` |
| 7 | Quick Action links | Clicking "Log Attendance" → `/#/attendance`; "View Tasks" → `/#/my-tasks`; "Submit Narrative" → `/#/narratives` |
| 8 | Weekly Hours chart | Canvas chart renders without error |

### TC-DASH-002: Supervisor Dashboard
**Login as:** Supervisor A

| Step | Check | Expected |
|------|-------|---------|
| 1 | Heading | "Supervisor Dashboard" |
| 2 | Pending Approvals count | Matches actual pending approvals assigned to this supervisor |
| 3 | Team Size count | Number of active interns with `supervisor_id = this supervisor` |
| 4 | Active Tasks count | Tasks created by this supervisor in `not_started + in_progress` |
| 5 | "Review Approvals" card | Clicking navigates to `/#/approvals` |
| 6 | Team Attendance chart | Renders without console error |
| 7 | Task Status chart | Renders without console error |

### TC-DASH-003: HR Dashboard
**Login as:** HR user

| Step | Check | Expected |
|------|-------|---------|
| 1 | Heading | "HR Dashboard" |
| 2 | Active Interns count | Total active interns across all locations |
| 3 | Pending Allowances count | `allowance_periods` with status `computed` or `under_review` |
| 4 | Quick action cards | "Manage Allowances" → `/#/allowance-management`; "Generate Reports" → `/#/reports` |
| 5 | Charts | Weekly Attendance and Allowance Summary charts render |

### TC-DASH-004: Admin Dashboard
**Login as:** Admin

| Step | Check | Expected |
|------|-------|---------|
| 1 | Heading | "Admin Dashboard" |
| 2 | Total Users count | All `is_active = true` users |
| 3 | Locations count | Active locations |
| 4 | Departments count | Active departments |
| 5 | Pending Approvals | All pending approvals system-wide |

---

## 7. Attendance — Intern

**Route:** `/#/attendance` (Intern only)

### TC-ATT-001: First Punch of the Day (Morning In)
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/attendance` | Today's card shows 4 empty punch slots; "Morning In" button visible |
| 2 | Click "Morning In" button | Button shows spinner; punch recorded |
| 3 | After success | Toast "Morning In recorded successfully"; `time_in_1` slot shows current time |
| 4 | Verify DB | `attendance_records` row created with `intern_id`, `date = today`, `time_in_1` populated |
| 5 | Verify next state | Button now shows "Lunch Out" |

### TC-ATT-002: Sequential Punch Order (All 4 Punches)
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log Morning In | `time_in_1` set; next = "Lunch Out" |
| 2 | Log Lunch Out | `time_out_1` set; next = "Afternoon In" |
| 3 | Log Afternoon In | `time_in_2` set; next = "End of Day" |
| 4 | Log End of Day | `time_out_2` set; no more punch buttons |
| 5 | Check total hours | Calculated automatically in DB trigger |
| 6 | Check status | Still `pending` (awaiting supervisor approval) |
| 7 | Approval entry | `approvals` table has new row with `type = 'attendance'` and `supervisor_id` assigned |

### TC-ATT-003: IP Address Consistency Check
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log Morning In from Network A | `ip_address_in_1` stored |
| 2 | Simulate IP change (use VPN or different network) and attempt Lunch Out | Toast error: "Your IP address has changed. All daily punches must come from the same network." |
| 3 | Punch not recorded | `time_out_1` remains null in DB |

### TC-ATT-004: Late Arrival Flag
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log Morning In **after** the `late_threshold` time defined in system settings (default 9:00 AM) | `is_late = true` in attendance record |
| 2 | Check attendance row | "Late" badge visible in today's card and in recent records table |

### TC-ATT-005: Outside Hours Flag
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log any punch before `work_hours.start` or after `work_hours.end` in system settings | `is_outside_hours = true` |
| 2 | Check attendance row | "Outside Hours" badge visible |

### TC-ATT-006: All Punches Complete — No More Buttons
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | After logging all 4 punches | "✓ All punches logged for today" message shown; no punch button |

### TC-ATT-007: Request Correction
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | With a partial attendance record, click "Request Correction" | Modal opens |
| 2 | Select punch type to correct, enter requested time, and reason | Form validates required fields |
| 3 | Submit | `attendance_corrections` row created with `status = 'pending'`; approval entry created |
| 4 | Notification check | Supervisor receives notification about correction request |

### TC-ATT-008: Recent Attendance Table
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | View recent attendance table | Up to 10 records shown, ordered newest first |
| 2 | Check columns | Date, Morning In, Lunch Out, Afternoon In, End of Day, Total Hours, Status, Flags |
| 3 | Empty state | "No attendance records yet" if no data |

---

## 8. My Tasks — Intern

**Route:** `/#/my-tasks` (Intern only)

### TC-TASK-001: View Assigned Tasks
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/my-tasks` | All tasks assigned to this intern shown |
| 2 | Count tabs | "All (N)", "Not Started (N)", "In Progress (N)", "Completed (N)" show correct counts |
| 3 | Each task card | Shows title, description, assigned by, estimated hours, due date, created date, status badge |

### TC-TASK-002: Status Filter Tabs
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Not Started" tab | Only `not_started` tasks visible |
| 2 | Click "In Progress" tab | Only `in_progress` tasks visible |
| 3 | Click "Completed" tab | Only `completed` tasks visible |
| 4 | Click "All" tab | All tasks visible again |

### TC-TASK-003: Request Status Change — Not Started → In Progress
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Find a `not_started` task | "Start" button visible |
| 2 | Click "Start" | Button disabled; `pending_status = 'in_progress'` set in DB |
| 3 | Approval entry | `approvals` table: `type = 'task_status'`, status `pending` |
| 4 | Notification | Supervisor receives "Task Status Change Request" notification |
| 5 | Task card | Shows "Pending: in_progress" badge; "Start" button disabled |
| 6 | Toast | "Status change request sent to supervisor" |

### TC-TASK-004: Request Status Change — In Progress → Completed
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Find an `in_progress` task | "Complete" button visible |
| 2 | Click "Complete" | `pending_status = 'completed'`; approval created |
| 3 | Pending badge | Shows "Pending: completed" |

### TC-TASK-005: Cannot Re-Request While Pending
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Task already has `pending_status` set | Status change button is disabled |

### TC-TASK-006: No Tasks State
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Intern with no assigned tasks | "No tasks assigned yet. Your supervisor will assign tasks to you." card shown |

---

## 9. Daily Narratives — Intern

**Route:** `/#/narratives` (Intern only)

### TC-NARR-001: Submit New Narrative
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/narratives` | Today's and previous narratives shown |
| 2 | Click "New Narrative" | Modal opens with task dropdown and Quill rich-text editor |
| 3 | Select a task from dropdown | Active tasks only (`not_started`, `in_progress`) |
| 4 | Type at least 10 characters in editor | |
| 5 | Submit | Narrative saved with `status = 'pending'`; approval entry created |
| 6 | Notification | Supervisor receives pending_approval notification |
| 7 | Today's section refresh | New narrative card appears |

### TC-NARR-002: Narrative Requires Task Selection
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open modal, leave task unselected | Toast: "Please select a task" |
| 2 | Form not submitted | |

### TC-NARR-003: Minimum Content Validation
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter fewer than 10 characters | Toast: "Narrative must be at least 10 characters" |
| 2 | Form not submitted | |

### TC-NARR-004: No Active Tasks Warning
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Intern has no `not_started` or `in_progress` tasks | Warning banner shown; "New Narrative" button disabled |

### TC-NARR-005: Edit Rejected Narrative
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Narrative has `status = 'rejected'` | Edit button (pencil icon) visible on card |
| 2 | Click edit | Modal opens pre-filled with existing content |
| 3 | Update text and submit | Narrative updated, status reset to `pending` |
| 4 | Rejection reason section clears | Old rejection reason no longer prominent |

### TC-NARR-006: Edit Pending Narrative (Same Day)
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Today's narrative in `pending` state | Edit button visible |
| 2 | Edit and resubmit | Narrative content updated |

### TC-NARR-007: Cannot Edit Approved Narrative
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Narrative has `status = 'approved'` | No edit button visible |

---

## 10. My Allowance — Intern

**Route:** `/#/my-allowance` (Intern only)

### TC-ALLOW-001: View Allowance Summary
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/my-allowance` | Three summary cards: Total Earnings, Total Hours Logged, Weeks Paid |
| 2 | Total Earnings | Sum of `total_amount` for `status = 'approved'` periods |
| 3 | Total Hours | Sum of `total_hours` for approved periods |
| 4 | Weeks Paid | Count of approved periods |

### TC-ALLOW-002: Weekly Records Table
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | View table | All allowance periods for this intern shown, newest first |
| 2 | Columns | Week range, Hours, Rate (₱), Amount (₱), Status badge |
| 3 | Rejected period | Shows rejection notes under status badge |
| 4 | Empty state | "No allowance records yet" when no data |

### TC-ALLOW-003: Status Badges
| Status | Badge Color/Style |
|--------|-----------------|
| computed | Pending (yellow) |
| under_review | Pending (yellow) |
| approved | Success (green) |
| rejected | Danger (red) with review notes shown |

---

## 11. Approvals — Supervisor / Admin

**Route:** `/#/approvals` (Supervisor + Admin)

### TC-APPR-001: Pending Approvals List
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login as Supervisor A | Only Intern A's and Intern B's approvals shown (assigned interns only) |
| 2 | Login as Admin | ALL approvals system-wide shown |
| 3 | Each approval card | Shows type badge, intern name, escalation badge (if escalated), submitted datetime |

### TC-APPR-002: Approve Individual Item
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click green check (✓) on an attendance approval | Approval `status → approved`, `reviewed_at` set |
| 2 | Underlying attendance record | `status → approved`, `approved_at` set |
| 3 | Notification | Intern receives "attendance approved" notification |
| 4 | Audit log | `attendance.approved` entry in `audit_logs` |
| 5 | Page refresh | Item moves from Pending to Review History |

### TC-APPR-003: Reject Individual Item
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click red X on a narrative approval | Modal opens with reason textarea (required) |
| 2 | Submit without reason | Form validation prevents submission |
| 3 | Enter reason and submit | Approval `status → rejected`; narrative `rejection_reason` set |
| 4 | Notification | Intern receives rejection notification with reason |
| 5 | Toast | "Submission rejected" |

### TC-APPR-004: Approve All Today (Bulk)
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Multiple pending approvals exist for today | "Approve All Today" button visible |
| 2 | Click button | All today's pending items processed as `approved` |
| 3 | Toast | "N items approved" |
| 4 | Missing today items | If none, toast "No pending approvals for today" |

### TC-APPR-005: Task Status Approval
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Intern requested task status change; approval is pending | Appears in list with type `task_status` |
| 2 | Approve | Task `status` updated to `pending_status` value; `pending_status → null` |
| 3 | Reject | Task `pending_status → null`; status unchanged |

### TC-APPR-006: Attendance Correction Approval
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Intern submitted correction; approval type `attendance_correction` | Appears in list |
| 2 | Approve | Specific punch field in `attendance_records` updated to correction's `requested_value`; `attendance_corrections.status → approved` |
| 3 | Reject | `attendance_corrections.status → rejected`; `review_comment` set |

### TC-APPR-007: Escalated Items
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Approval older than `escalation_hours` (default 24h) | `is_escalated = true`, "Escalated" badge visible on card |

### TC-APPR-008: Review History Table
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Approved / rejected items | Shows in Review History table (up to 50) |
| 2 | Columns | Type, Intern, Status, Comments, Submitted, Reviewed |

---

## 12. Task Management — Supervisor / Admin

**Route:** `/#/task-management` (Supervisor + Admin)

### TC-TMGMT-001: View Task List
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login as Supervisor A | Only tasks created by Supervisor A shown |
| 2 | Login as Admin | All tasks system-wide shown |
| 3 | Columns | Title, Assigned To, Status, Est. Hours, Due Date, Created, Actions |

### TC-TMGMT-002: Create Task
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Create Task" | Modal opens |
| 2 | Fill title (required), description (optional), assign to intern (required) | |
| 3 | Optionally set estimated hours and due date | |
| 4 | Submit | Task `status = 'not_started'` created; intern can see it in My Tasks |
| 5 | Audit log | `task.created` entry |
| 6 | Notification | Intern receives task assignment notification |

### TC-TMGMT-003: Create Task — Validation
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit without title | HTML5 required validation |
| 2 | Submit without assigning an intern | HTML5 required validation |

### TC-TMGMT-004: No Interns Available
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Supervisor with no assigned interns | "Create Task" button disabled with tooltip "No interns available" |

### TC-TMGMT-005: Edit Task
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click edit (pencil) on a task | Modal pre-filled with current values |
| 2 | Modify title or description | |
| 3 | Save | Task updated in DB |

### TC-TMGMT-006: Filter by Status
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "In Progress" from status dropdown | Only in-progress tasks visible |
| 2 | Select "Completed" | Only completed tasks visible |
| 3 | Select "" (All) | All show again |

### TC-TMGMT-007: Filter by Intern
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select specific intern from filter | Only that intern's tasks shown |

### TC-TMGMT-008: Pending Status Badge
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Task has `pending_status` awaiting approval | Yellow "→ in_progress" (or other status) badge shown in status column |

---

## 13. Team Attendance — Supervisor

**Route:** `/#/team-attendance` (Supervisor only)

### TC-TATT-001: Default View (This Week)
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/team-attendance` | Shows current week (Monday–Friday) header |
| 2 | Table | Attendance records for all assigned interns within that week |
| 3 | Record count indicator | "N records" shown |

### TC-TATT-002: Cross-Team Isolation
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login as Supervisor A | Intern C's attendance (under Supervisor B) NOT visible |
| 2 | Login as Supervisor B | Only Intern C's attendance shown |

### TC-TATT-003: Filter by Intern
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select specific intern from filter | Table filters to only that intern's records |
| 2 | Record count updates | Reflects filtered number |

### TC-TATT-004: Filter by Status
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Pending" | Only pending records shown |
| 2 | Select "Approved" | Only approved records shown |
| 3 | Select "Rejected" | Only rejected records shown |

### TC-TATT-005: Late/Outside Hour Badges
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Attendance with `is_late = true` | "Late" badge shown in Status column |

### TC-TATT-006: Empty State
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | No records for this week | "No attendance records" in table body |

---

## 14. Team Narratives — Supervisor

**Route:** `/#/team-narratives` (Supervisor only)

### TC-TNARR-001: View Team Narratives
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/team-narratives` | Narratives from assigned interns listed |
| 2 | Cross-team check | No narratives from other supervisors' interns |
| 3 | Narrative details | Intern name, task title, date, content preview, status badge |

### TC-TNARR-002: Filter Options
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Filter by intern | Only selected intern's narratives shown |
| 2 | Filter by status (pending/approved/rejected) | Correct subset shown |
| 3 | Filter by date range | Only narratives in range shown |

---

## 15. Allowance Management — HR / Admin

**Route:** `/#/allowance-management` (HR + Admin)

### TC-AMGMT-001: Current Rate Display
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | Current hourly rate displayed prominently (₱X.XX) |
| 2 | If no rate set | Shows ₱0.00 |
| 3 | Effective date | Shows "Effective from [date]" |

### TC-AMGMT-002: Set Hourly Rate
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Set Rate" | Modal opens with rate, effective date, and notes fields |
| 2 | Enter valid rate (e.g., 75.00) and effective date | |
| 3 | Submit | New `allowance_config` record created; rate on page updates |
| 4 | Audit log | `allowance.rate_set` entry |

### TC-AMGMT-003: Compute Weekly Allowances
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Compute Weekly" | Processes approved attendance for the current week |
| 2 | For each intern | `allowance_periods` row created/updated with `total_hours`, `hourly_rate`, `total_amount` |
| 3 | Status | New periods start as `computed` |
| 4 | Notification | Interns notified "allowance_ready" |

### TC-AMGMT-004: Cannot Compute Without Rate
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Compute Weekly" when no rate configured | Toast error: "Please configure an hourly rate first" |

### TC-AMGMT-005: Approve Individual Period
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Pending period in table | Green check button visible |
| 2 | Click approve | `status → approved`; `reviewed_by`, `reviewed_at` set |
| 3 | Intern's My Allowance | Status shows "approved"; earnings count updated |
| 4 | Audit log | `allowance.approved` entry |

### TC-AMGMT-006: Reject Individual Period
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click red X on pending period | Modal with reason textarea |
| 2 | Submit with reason | `status → rejected`; `review_notes` set |
| 3 | Intern's view | Shows "rejected" badge with review notes |
| 4 | Audit log | `allowance.rejected` entry |

### TC-AMGMT-007: Approve All
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Multiple pending periods exist | "Approve All" button visible |
| 2 | Click | All pending → approved in bulk |
| 3 | Pending table | Clears to "No pending allowances" |

### TC-AMGMT-008: Approved History
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Scroll to "Approved Allowances" table | Approved periods listed with intern name, week, hours, rate, amount, approved-on date |

---

## 16. Reports — HR / Admin

**Route:** `/#/reports` (HR + Admin)

### TC-REP-001: Generate Attendance Summary Report
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Attendance Summary", set date range | |
| 2 | Click "Generate" | Table and chart rendered |
| 3 | Chart | Bar/line chart with attendance data per day |
| 4 | Table | Date, Intern, Morning In, Lunch Out, Afternoon In, End of Day, Total Hours, Status columns |

### TC-REP-002: Generate Hours Logged Report
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Hours Logged", set date range | |
| 2 | Click "Generate" | Chart shows hours per intern |
| 3 | Table | Name | Total Hours for period |
| 4 | Counts only approved attendance | Pending/rejected records excluded |

### TC-REP-003: Generate Task Status Report
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Task Status", set date range | |
| 2 | Click "Generate" | Counts for not_started / in_progress / completed shown |
| 3 | Chart | Doughnut or bar chart with task distribution |

### TC-REP-004: Generate Allowance Summary Report
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Allowance Summary", set date range | |
| 2 | Click "Generate" | Approved allowances in range listed |
| 3 | Table | Intern, Week, Hours, Rate, Amount |

### TC-REP-005: Filter by Location
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Set location filter before generating | Data filtered to interns at that location only |

### TC-REP-006: Date Range Required
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Generate" without setting dates | Toast: "Please select date range" |

### TC-REP-007: Export XLSX
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | After generating a report | "Export XLSX" button enabled |
| 2 | Click it | `.xlsx` file downloaded with current report data |
| 3 | Before generating | Button remains disabled |

### TC-REP-008: Export PDF
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | After generating a report | "Export PDF" button enabled |
| 2 | Click it | PDF downloaded with report data |

---

## 17. Intern Directory — HR / Admin

**Route:** `/#/intern-directory` (HR + Admin)

### TC-DIR-001: View All Interns
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | All intern profiles listed |
| 2 | Each card/row | Name, email, department, location, supervisor, OJT progress %, status |

### TC-DIR-002: Filter by Status
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Filter by "active" | Only active interns (status = active, is_active = true) |
| 2 | Filter by "inactive" | Inactive interns only |

### TC-DIR-003: Search by Name
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Type in search box | Table/list filters in real time |
| 2 | Partial name match | Results include all matching interns |

### TC-DIR-004: View Intern Detail
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click on an intern | Detail view or modal showing full profile, attendance summary, task status, OJT progress |

---

## 18. Attendance Overview — HR / Admin

**Route:** `/#/attendance-overview` (HR + Admin)

### TC-AOVR-001: System-Wide Attendance View
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | Attendance across all interns and locations visible |
| 2 | Filters | Filter by location, intern, date range, status |
| 3 | Summary stats | Total present, absent, late, outside-hours counts |

### TC-AOVR-002: Location Filter
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Filter to "Main Office" location | Only interns at that location shown |

---

## 19. Departments — HR / Admin

**Route:** `/#/departments` (HR + Admin)

### TC-DEPT-001: View Departments
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | All departments listed with name, linked location, active status |

### TC-DEPT-002: Create Department
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Add Department" / "New" | Form/modal opens |
| 2 | Enter name and select location | |
| 3 | Submit | Department created; appears in list |
| 4 | Duplicate name in same location | Error: unique constraint violation |

### TC-DEPT-003: Edit Department
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click edit on a department | Form pre-filled |
| 2 | Change name | Updated in DB |

### TC-DEPT-004: Deactivate Department
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Toggle `is_active` to false (if UI supports) | Department hidden from active lists |
| 2 | Existing users in this department | Unaffected; department shows in their profile as historical |

---

## 20. User Management — Admin

**Route:** `/#/user-management` (Admin only)

### TC-UMGMT-001: View All Users
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | All users listed: name, email, role badge, department, location, active status, created date |

### TC-UMGMT-002: Invite New User
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Invite User" | Modal opens |
| 2 | Fill email, full name, role | Required fields |
| 3 | Select location and department | Optional |
| 4 | For intern role | Supervisor dropdown appears and can be assigned |
| 5 | Submit | `supabase.auth.admin.inviteUserByEmail` called; magic link email sent |
| 6 | User receives email | Can set password via magic link |
| 7 | After invitation | Profile created in `profiles` table with correct role |

### TC-UMGMT-003: Invite — Required Field Validation
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit without email | HTML5 validation |
| 2 | Submit without name | HTML5 validation |
| 3 | Submit without role | HTML5 validation |

### TC-UMGMT-004: Edit User
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click edit (pencil) on any user | Modal pre-filled with current values |
| 2 | Change role, department, location, or supervisor | |
| 3 | Save | Profile updated in DB |
| 4 | Audit log | `user.updated` entry |

### TC-UMGMT-005: Deactivate User
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click deactivate button on active user | Confirmation dialog appears |
| 2 | Confirm | `is_active → false`; status badge changes to "Inactive" |
| 3 | Deactivated user tries to login | Supabase denies if email disabled, or user sees inactive profile (app-level check) |
| 4 | Audit log | `user.deactivated` entry |

### TC-UMGMT-006: Activate User
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click activate on inactive user | `is_active → true` |
| 2 | Audit log | `user.activated` entry |

### TC-UMGMT-007: Self-Deactivation Prevention
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Admin views their own row | Toggle button disabled (`current user's row`) |

### TC-UMGMT-008: Filter Users by Role
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Intern" from role filter | Only intern rows visible |
| 2 | Select "Supervisor" | Only supervisor rows |

### TC-UMGMT-009: Filter Users by Status
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select "Active" | Only active users |
| 2 | Select "Inactive" | Only inactive users |

### TC-UMGMT-010: Search by Name / Email
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Type in search box | Filters rows in real time (case-insensitive, name and email) |

---

## 21. Locations — Admin

**Route:** `/#/locations` (Admin only)

### TC-LOC-001: View Locations
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | All locations shown with name, address, active status |

### TC-LOC-002: Create Location
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click "Add Location" | Form/modal opens |
| 2 | Enter name and address (both required) | |
| 3 | Submit | Location created and listed |

### TC-LOC-003: Edit Location
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click edit | Pre-filled modal; update name/address |
| 2 | Save | Updated in DB |

### TC-LOC-004: Toggle Active Status
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Deactivate a location | `is_active → false`; location excluded from dropdowns in new user forms |
| 2 | Activate | `is_active → true` |

### TC-LOC-005: Cannot Delete Location with Departments
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Try to delete location that has departments | DB constraint `ON DELETE RESTRICT` prevents deletion; error shown |

---

## 22. Audit Logs — Admin

**Route:** `/#/audit-logs` (Admin only)

### TC-AUDIT-001: View Logs
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | Most recent 50 logs shown (page 1) |
| 2 | Columns | Timestamp, User, Action, Entity Type + ID (truncated), Details (JSON), IP Address |
| 3 | Actions are code-formatted | Each action in `<code>` tag (e.g., `attendance.time_in_1`) |

### TC-AUDIT-002: Filter by Action
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Type "attendance" in action filter and click Search | Only logs with "attendance" in action shown (ILIKE `%attendance%`) |
| 2 | Type "user.deactivated" | Exact match logs shown |

### TC-AUDIT-003: Filter by Date Range
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Set from/to dates | Only logs in that range returned |

### TC-AUDIT-004: Pagination
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | More than 50 logs | "Previous" and "Next" buttons and page indicator shown |
| 2 | Click "Next" | Next 50 logs loaded |
| 3 | On last page | "Next" button disabled |
| 4 | On first page | "Previous" button disabled |

### TC-AUDIT-005: Verify Audit Entries Are Created
Perform these actions and verify corresponding audit log entries:

| Action Performed | Expected Audit Log Action |
|------------------|--------------------------|
| Intern logs time_in_1 | `attendance.time_in_1` |
| Intern logs time_out_2 | `attendance.time_out_2` |
| Supervisor approves attendance | `attendance.approved` |
| Supervisor rejects narrative | (logged via processApproval) |
| Admin creates user | `user.created` |
| Admin deactivates user | `user.deactivated` |
| Admin activates user | `user.activated` |
| HR sets allowance rate | `allowance.rate_set` |
| HR approves allowance | `allowance.approved` |
| HR rejects allowance | `allowance.rejected` |
| Admin saves system settings | `settings.updated` |
| Supervisor creates task | `task.created` |
| Intern requests task status change | `task.status_change_requested` |
| User updates profile | `profile.updated` |

---

## 23. System Settings — Admin

**Route:** `/#/system-settings` (Admin only)

### TC-SETTINGS-001: View Current Settings
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | Four setting sections loaded: Work Hours, Attendance Rules, Escalation, Data Retention |
| 2 | Values pre-filled | Reflect current DB values from `system_settings` table |

### TC-SETTINGS-002: Update Work Hours
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Change Start Time to "08:00", End Time to "17:00" | |
| 2 | Click "Save Settings" | `system_settings` key `work_hours` updated with new JSON |
| 3 | Toast | "Settings saved" |
| 4 | Audit log | `settings.updated` entry |

### TC-SETTINGS-003: Update Attendance Rules
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Set Late Threshold to 15 minutes | |
| 2 | Set Required Punches to 4 | |
| 3 | Save | `attendance_rules` updated in DB |

### TC-SETTINGS-004: Update Escalation Hours
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Set escalation to 48 hours | |
| 2 | Save | `escalation_hours` updated |

### TC-SETTINGS-005: Update Data Retention
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Set data retention to 24 months | |
| 2 | Save | `data_retention_months` updated |

### TC-SETTINGS-006: Settings Persist After Reload
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Save new settings | |
| 2 | Reload page | Fields show updated values (not defaults) |

---

## 24. Notifications (All Roles)

**Route:** `/#/notifications`

### TC-NOTIF-001: View Notifications
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to page | All notifications for current user listed (up to 100) |
| 2 | Unread count | Header shows "N unread notifications" |
| 3 | Unread items | Left blue border + blue dot indicator + full opacity |
| 4 | Read items | No border, 60% opacity |

### TC-NOTIF-002: Mark Individual Notification as Read
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click on an unread notification | `is_read → true` in DB |
| 2 | Visual update | Border and dot removed; item fades |

### TC-NOTIF-003: Mark All as Read
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Unread notifications exist | "Mark All Read" button visible |
| 2 | Click button | All notifications `is_read → true` |
| 3 | Toast | "All marked as read" |
| 4 | Button | "Mark All Read" button disappears (no more unread) |

### TC-NOTIF-004: Notification Icons by Type
| Type | Expected Icon |
|------|-------------|
| attendance-related | Clock icon |
| task-related | Tasks/checkbox icon |
| narrative-related | Narrative/document icon |
| allowance-related | Money/peso icon |
| escalation | Alert icon |
| default | Bell icon |

### TC-NOTIF-005: Empty State
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | User with no notifications | "No notifications yet" message with bell icon |

### TC-NOTIF-006: Notifications Created Automatically
| Trigger Action | Notification Recipient | Type |
|----------------|----------------------|------|
| Intern logs all 4 punches (time_out_2) | Supervisor | `pending_approval` |
| Intern submits narrative | Supervisor | `pending_approval` |
| Intern requests task status change | Supervisor | `pending_approval` |
| Supervisor approves attendance | Intern | `approval_result` |
| Supervisor rejects attendance | Intern | `approval_result` |
| Supervisor approves narrative | Intern | `approval_result` |
| Supervisor rejects narrative | Intern | `approval_result` |
| Supervisor approves task status | Intern | `approval_result` |
| HR approves allowance | Intern | `allowance_ready` |

---

## 25. Profile (All Roles)

**Route:** `/#/profile`

### TC-PROF-001: View Own Profile
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/profile` | Profile card shows avatar, name, email, role badge |
| 2 | Intern profile | OJT Progress bar shows computed progress from approved attendance hours |
| 3 | Non-intern | OJT progress section not shown |

### TC-PROF-002: Edit Personal Information
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Update Full Name | |
| 2 | Update Phone | |
| 3 | For interns: update School and Course | |
| 4 | Click "Save Changes" | Profile updated in DB (`profiles` table) |
| 5 | Toast | "Profile updated" |
| 6 | Audit log | `profile.updated` entry |
| 7 | Reload profile page | Updated values shown |

### TC-PROF-003: Read-Only Fields
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Email field | Disabled (cannot be changed via UI) |
| 2 | OJT Start Date | Disabled |
| 3 | OJT End Date | Disabled |

### TC-PROF-004: Change Password
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter new password (8+ chars) and matching confirm | |
| 2 | Click "Update Password" | Password updated via Supabase auth |
| 3 | Toast | "Password updated" |
| 4 | Logout and re-login with new password | Login succeeds |

### TC-PROF-005: Password Mismatch
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter different values in new/confirm password fields | Toast: "Passwords do not match" |
| 2 | Password NOT updated | |

### TC-PROF-006: Upload Avatar
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click avatar edit icon → select file (PNG/JPG/WebP under 2MB) | Upload starts |
| 2 | Success | Avatar image displayed in profile card |
| 3 | `avatar_url` | Updated in `profiles` table and `avatars` storage bucket |

### TC-PROF-007: Avatar — File Size Limit
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select image file over 2MB | Toast: "Image must be under 2MB" |
| 2 | Upload cancelled | Avatar unchanged |

---

## 26. End-to-End Workflow Scenarios

These multi-step scenarios simulate real usage flows.

---

### E2E-001: Complete Intern Daily Workflow

**Actors:** Admin, Supervisor A, Intern A  
**Pre-conditions:** All accounts created, intern assigned to supervisor, task assigned

| Step | Actor | Action | Verification |
|------|-------|--------|-------------|
| 1 | Intern A | Log Morning In | `time_in_1` set; no approval yet |
| 2 | Intern A | Log Lunch Out | `time_out_1` set |
| 3 | Intern A | Log Afternoon In | `time_in_2` set |
| 4 | Intern A | Log End of Day | All 4 punches; `approvals` row created for Supervisor A |
| 5 | Supervisor A | Opens `/#/approvals` | Intern A's attendance appears as pending |
| 6 | Intern A | Work on task; click "Start" on a `not_started` task | `pending_status = 'in_progress'`; approval created |
| 7 | Intern A | Submit narrative for that task | Narrative saved (pending); approval created for supervisor |
| 8 | Supervisor A | Approves attendance | `attendance_records.status → approved`; intern notified |
| 9 | Supervisor A | Approves task status change | Task `status → in_progress`; intern notified |
| 10 | Supervisor A | Approves narrative | `narratives.status → approved`; intern notified |
| 11 | Intern A | Checks notifications | 3 approval result notifications present; all markable as read |
| 12 | HR | Runs Compute Weekly | `allowance_periods` row created for Intern A |
| 13 | HR | Approves allowance | `status → approved`; Intern A notified |
| 14 | Intern A | Checks `/#/my-allowance` | Week appears as approved with correct amount |
| 15 | Admin | Checks `/#/audit-logs` | Full trail of all above actions logged |

---

### E2E-002: Attendance Correction Workflow

**Actors:** Intern A, Supervisor A

| Step | Actor | Action | Verification |
|------|-------|--------|-------------|
| 1 | Intern A | Logs Morning In with wrong time (simulated) | `time_in_1` recorded |
| 2 | Intern A | Logs Lunch Out | Partial record exists |
| 3 | Intern A | Clicks "Request Correction" | Modal opens |
| 4 | Intern A | Selects `time_in_1`, enters correct time + reason | |
| 5 | Intern A | Submits correction | `attendance_corrections` row created (pending) |
| 6 | Supervisor A | Opens `/#/approvals` | Correction appears as `type = 'attendance_correction'` |
| 7 | Supervisor A | Approves correction | `attendance_records.time_in_1` updated; correction `status → approved` |
| 8 | Intern A | Checks attendance | Corrected punch time shown |

---

### E2E-003: Task Rejection and Resubmission

| Step | Actor | Action | Verification |
|------|-------|--------|-------------|
| 1 | Intern A | Requests "Complete" status on `in_progress` task | Approval pending |
| 2 | Supervisor A | Rejects with reason "Task not fully documented" | Task `pending_status → null`; status unchanged |
| 3 | Intern A | Notified of rejection | Notification received |
| 4 | Intern A | Submits improved narrative, then requests "Complete" again | New approval created |
| 5 | Supervisor A | Approves | Task `status → completed` |

---

### E2E-004: New Intern Onboarding (Admin Flow)

| Step | Actor | Action | Verification |
|------|-------|--------|-------------|
| 1 | Admin | Creates location "Branch Office" | Location in DB |
| 2 | Admin | Creates department "Design" under Branch Office | Dept in DB |
| 3 | Admin | Invites Supervisor C to `/#/user-management` | Magic link email sent |
| 4 | Supervisor C | Accepts invite, sets password | Profile created with role `supervisor` |
| 5 | Admin | Invites Intern D, assigns to Supervisor C, Design dept, Branch Office | |
| 6 | Intern D | Accepts invite, sets password | Profile with role `intern`, `supervisor_id` set |
| 7 | Supervisor C | Logs in; dashboard shows Intern D in team count | |
| 8 | Supervisor C | Assigns task to Intern D | Intern D sees task in `/#/my-tasks` |
| 9 | Admin | Checks audit logs | All onboarding actions logged |

---

### E2E-005: Allowance Computation with Rate Change

| Step | Actor | Action | Verification |
|------|-------|--------|-------------|
| 1 | HR | Sets rate to ₱50.00/hr effective this week | `allowance_config` row created |
| 2 | Multiple interns complete attendance and get approved | Approved attendance for week exists |
| 3 | HR | Clicks "Compute Weekly" | `allowance_periods` rows created: `total_amount = total_hours × 50` |
| 4 | HR | Reviews pending table | Correct amounts shown |
| 5 | HR | Changes rate to ₱75.00/hr | New rate effective from next week |
| 6 | HR | Approves previous week at ₱50 | Approved at original rate (not new rate) |
| 7 | Each intern | Checks `/#/my-allowance` | Correct approved amount shown |

---

### E2E-006: Cross-Team Data Isolation

| Step | Actor | Action | Verification |
|------|-------|--------|-------------|
| 1 | Intern C (under Supervisor B) | Logs attendance and submits narratives | Records saved with Supervisor B as supervisor |
| 2 | Supervisor A | Opens `/#/approvals` | Intern C's items NOT visible |
| 3 | Supervisor A | Opens `/#/team-attendance` | Intern C NOT in team list |
| 4 | Supervisor B | Opens `/#/approvals` | Intern C's items visible; Intern A/B NOT visible |
| 5 | Admin | Opens `/#/approvals` | All interns visible |

---

## 27. Security & RLS Verification

### TC-SEC-001: RLS — Intern Cannot Read Other Intern's Data
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as Intern A | |
| 2 | Using browser DevTools → Supabase JS client, query `attendance_records` without filters | Only Intern A's own records returned |
| 3 | Query `narratives` without filters | Only Intern A's own returned |
| 4 | Query `allowance_periods` | Only Intern A's own returned |

### TC-SEC-002: RLS — Intern Cannot Write Other Intern's Attendance
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Attempt to insert `attendance_records` with `intern_id` set to Intern B's UUID | RLS policy `attendance_insert` blocks it; Supabase returns permission error |

### TC-SEC-003: RLS — Supervisor Can Only View Assigned Team
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as Supervisor A | |
| 2 | Direct query on `attendance_records` | Returns only records where `supervisor_id = Supervisor A's id` OR `intern_id = auth.uid()` |
| 3 | Does NOT return Intern C's records | Confirmed by RLS policy |

### TC-SEC-004: RLS — Only Admin Can Modify Profiles of Others
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as Supervisor A | |
| 2 | Attempt to update Intern A's `role` via direct DB call | RLS policy `profiles_update_admin` blocks it |
| 3 | Log in as Admin | Same update succeeds |

### TC-SEC-005: RLS — Tasks Can Only Be Created by Supervisor/Admin
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as Intern A | |
| 2 | Attempt to insert into `tasks` table directly | RLS policy `tasks_insert` denies; only `supervisor` and `admin` roles allowed |

### TC-SEC-006: RLS — Notifications are User-Private
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log in as Intern A | |
| 2 | Query `notifications` table | Only this user's notifications returned (RLS: `user_id = auth.uid()`) |

### TC-SEC-007: Admin Secret Key Required for Admin Registration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to `/#/admin-setup` with wrong VITE_ADMIN_SECRET_KEY value | Error: "Invalid secret key" — no account created |
| 2 | Key check happens client-side before Supabase call | No auth request made with wrong key |

### TC-SEC-008: IP Address Validation on Attendance
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Log Morning In from IP A | IP stored in `ip_address_in_1` |
| 2 | Attempt any subsequent punches from different IP | UI blocks the punch with error toast |
| 3 | No DB write occurs | Subsequent punch field remains null |

---

## 28. Edge Cases & Negative Tests

### TC-EDGE-001: Attendance Already Complete — No More Punches
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | All 4 punches logged today | No punch button rendered |
| 2 | No way to log a 5th punch | Confirmed — `getNextPunch()` returns null; button not rendered |

### TC-EDGE-002: Narrative Without Supervisor
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Intern with no `supervisor_id` submits narrative | Approval created but `supervisor_id` is null |
| 2 | Notification to supervisor | Skipped (no supervisor_id to notify) |
| 3 | Admin can review from Approvals page | Admin sees all approvals including those with no supervisor |

### TC-EDGE-003: Task Status Request Already Pending
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Task has `pending_status` set | "Start" or "Complete" button is disabled |
| 2 | Cannot submit duplicate pending request | Prevented by UI |

### TC-EDGE-004: Compute Weekly With No Approved Attendance
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | HR clicks "Compute Weekly" with no approved attendance records this week | Either no periods created, or periods created with `total_hours = 0` |

### TC-EDGE-005: Empty Date Range in Reports
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Generate report with `date_from = date_to = same_day` with no data | Empty table; chart with no data rendered gracefully |

### TC-EDGE-006: Narrative Rich Text (Quill Editor)
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Submit narrative with bold, italic, bullet list formatting | HTML content saved in `narratives.content` |
| 2 | View narrative card | Formatted content rendered correctly via `innerHTML` |

### TC-EDGE-007: Pagination on Audit Logs — Large Dataset
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Create 60+ audit log entries (various actions) | Page 1 shows 50; "Next" and page indicator appear |
| 2 | Navigate to page 2 | Logs 51-60+ shown |

### TC-EDGE-008: User Cannot Deactivate Themselves
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Admin views their own row in user management | Deactivate button is `disabled` attribute set |
| 2 | Cannot be clicked | No action taken |

### TC-EDGE-009: Loading State Feedback
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to any page | Full-page loading spinner shown immediately while data loads |
| 2 | On slow connection | Spinner persists; no blank page |

### TC-EDGE-010: Route Error Recovery
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Navigate to non-existent route (e.g. `/#/xyz`) | 404 handler shows "Something went wrong" or "Page not found" with Reload button |

### TC-EDGE-011: Password Under 8 Characters
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | In profile change-password form, enter 5-char password | `minlength="8"` HTML5 validation prevents submission |

### TC-EDGE-012: Avatar Upload Wrong File Type
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Select a `.pdf` or `.txt` file for avatar | `accept="image/png,image/jpeg,image/webp"` filter prevents selection |

---

## Test Execution Checklist

Use this checklist to track testing progress:

### Authentication
- [ ] TC-AUTH-001: Unauthenticated redirect
- [✔] TC-AUTH-002: Authenticated redirect from public routes
- [ ] TC-AUTH-003: Role-based route enforcement (all rows)

### Admin Setup & Login
- [ ] TC-SETUP-001 through TC-SETUP-003
- [ ] TC-LOGIN-001 through TC-LOGIN-004

### Dashboards
- [ ] TC-DASH-001: Intern dashboard
- [ ] TC-DASH-002: Supervisor dashboard
- [ ] TC-DASH-003: HR dashboard
- [ ] TC-DASH-004: Admin dashboard

### Attendance
- [ ] TC-ATT-001 through TC-ATT-008

### My Tasks
- [ ] TC-TASK-001 through TC-TASK-006

### Narratives
- [ ] TC-NARR-001 through TC-NARR-007

### My Allowance
- [ ] TC-ALLOW-001 through TC-ALLOW-003

### Approvals
- [ ] TC-APPR-001 through TC-APPR-008

### Task Management
- [ ] TC-TMGMT-001 through TC-TMGMT-008

### Team Attendance
- [ ] TC-TATT-001 through TC-TATT-006

### Team Narratives
- [ ] TC-TNARR-001 through TC-TNARR-002

### Allowance Management
- [ ] TC-AMGMT-001 through TC-AMGMT-008

### Reports
- [ ] TC-REP-001 through TC-REP-008

### Intern Directory
- [ ] TC-DIR-001 through TC-DIR-004

### Attendance Overview
- [ ] TC-AOVR-001 through TC-AOVR-002

### Departments
- [ ] TC-DEPT-001 through TC-DEPT-004

### User Management
- [ ] TC-UMGMT-001 through TC-UMGMT-010

### Locations
- [ ] TC-LOC-001 through TC-LOC-005

### Audit Logs
- [ ] TC-AUDIT-001 through TC-AUDIT-005

### System Settings
- [ ] TC-SETTINGS-001 through TC-SETTINGS-006

### Notifications
- [ ] TC-NOTIF-001 through TC-NOTIF-006

### Profile
- [ ] TC-PROF-001 through TC-PROF-007

### End-to-End Scenarios
- [ ] E2E-001: Complete intern daily workflow
- [ ] E2E-002: Attendance correction workflow
- [ ] E2E-003: Task rejection and resubmission
- [ ] E2E-004: New intern onboarding
- [ ] E2E-005: Allowance computation with rate change
- [ ] E2E-006: Cross-team data isolation

### Security & RLS
- [ ] TC-SEC-001 through TC-SEC-008

### Edge Cases
- [ ] TC-EDGE-001 through TC-EDGE-012

---

## Bug Report Template

When a test fails, document it using this format:

```
Bug ID:        BUG-XXX
Test Case:     TC-XXX-000
Title:         Brief description
Severity:      Critical / High / Medium / Low
Role:          The role under which the bug was found
Steps to Reproduce:
  1. ...
  2. ...
Expected Result:  ...
Actual Result:    ...
Console Errors:   (paste any JS errors from DevTools)
DB State:         (relevant Supabase table state)
Screenshot/Video: (attach if available)
```

---

*End of M88 Interns Productivity Tracker Tool — Testing Guide*
