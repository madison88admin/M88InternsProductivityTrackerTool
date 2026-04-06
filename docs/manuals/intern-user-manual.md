# M88 Interns Productivity Tracker
## Intern User Manual

Document ID: M88-UM-INT-001  
Version: 3.0  
Prepared By: Documentation Team  
Reviewed By: ____________________  
Approved By: ____________________  
Effective Date: April 6, 2026  
Next Review Date: ____________________

---

## Document Control

| Version | Date | Author | Description of Change | Approved By |
|---|---|---|---|---|
| 1.0 | 2026-04-06 | Documentation Team | Initial release | |
| 2.0 | 2026-04-06 | Documentation Team | Expanded procedures and troubleshooting | |
| 3.0 | 2026-04-06 | Documentation Team | Reorganized to standardized manual structure | |

---

## Table of Contents

1. System Overview  
2. Getting Started  
2.1 Logging In  
2.2 Setting Your Password (New Users)  
2.3 Resetting Your Password  
2.4 Logging Out  
3. Navigation and Layout  
3.1 Sidebar Navigation  
3.2 Topbar and Page Header  
3.3 Mobile Behavior  
4. Intern Role Guide  
4.1 Role Overview  
4.2 Dashboard  
4.3 Attendance  
4.4 My Tasks  
4.5 Daily Narratives  
4.6 My Allowance  
4.7 My DAR Draft (If Enabled)  
4.8 Notifications  
4.9 Profile and Security  
5. Frequently Asked Questions and Troubleshooting  
Appendix A - Field Reference Tables  
Appendix B - Role Permissions Matrix  
Appendix C - Report and DAR Reference

---

## 1. System Overview

The M88 Interns Productivity Tracker is a role-based web system used to manage intern attendance, daily work records, task progress, approvals, and allowance workflow.

As an intern, your main daily activities are:
- recording attendance in correct sequence
- updating assigned task status
- submitting morning and afternoon narratives
- monitoring notifications and review outcomes
- checking allowance and DAR status

Core compliance principles:
- entries must be accurate and timely
- rejected records must be corrected and resubmitted
- all actions are tracked for audit and review

[SCREENSHOT-INT-001: Login page with Email, Password, Terms checkbox, and Sign In button]

---

## 2. Getting Started

### 2.1 Logging In

1. Open the official system URL.
2. Enter your assigned email address.
3. Enter your password.
4. Tick the Terms and Conditions checkbox.
5. Click Sign In.

Expected result:
- dashboard loads
- your profile name appears in sidebar

If login fails:
- verify email and password spelling
- check Caps Lock
- retry after refresh

[SCREENSHOT-INT-002: Successful intern login and dashboard landing]

### 2.2 Setting Your Password (New Users)

New users typically receive an invite link.

1. Open invite link from email.
2. Enter new password and confirm.
3. Ensure password meets complexity requirements.
4. Save and proceed to login.

Password requirements:
- minimum 8 characters
- uppercase letter
- lowercase letter
- number
- special character

[SCREENSHOT-INT-003: Set password page for invited user]

### 2.3 Resetting Your Password

1. Click Forgot Password on login page.
2. Enter your registered email.
3. Open reset email and click provided link.
4. Enter new password and confirmation.
5. Submit and login again.

If reset email is not received:
- check spam/junk folder
- confirm correct email
- contact admin if repeated

[SCREENSHOT-INT-004: Reset password form with validation indicators]

### 2.4 Logging Out

1. Click Sign Out from sidebar.
2. Wait for redirect to login page.

If delayed:
- do not click repeatedly
- wait for completion

[SCREENSHOT-INT-005: Sign Out action and redirect]

---

## 3. Navigation and Layout

### 3.1 Sidebar Navigation

Intern sidebar modules:
- Dashboard
- Notifications
- Attendance
- My Tasks
- Daily Narratives
- My Allowance
- My DAR Draft (if enabled)
- Profile
- Sign Out

Guidelines:
- use sidebar as primary navigation
- unread notification dot indicates pending items

[SCREENSHOT-INT-006: Intern sidebar with menu groups]

### 3.2 Topbar and Page Header

The system uses page headers and action rows in each module rather than a heavy topbar.

Common header items include:
- page title
- filter controls
- action buttons (submit, export, mark read)
- status badges

Read header notes before taking action, especially on attendance and narratives.

[SCREENSHOT-INT-007: Module header with filters and action controls]

### 3.3 Mobile Behavior

System usage policy:
- desktop/laptop is recommended
- phone browsers may be restricted by system guard
- use supported modern browser and stable internet

If mobile access is blocked, continue from desktop device.

---

## 4. Intern Role Guide

### 4.1 Role Overview

Intern role is responsible for accurate daily entries and prompt correction of rejected records.

Daily sequence recommendation:
1. Attendance
2. My Tasks
3. Daily Narratives
4. Notifications
5. Allowance check (weekly)

### 4.2 Dashboard

Purpose:
- provides quick view of attendance, task, narrative, and OJT progress

How to use:
1. Review OJT progress card.
2. Check attendance indicators for current week.
3. Review task and narrative summary cards.
4. Use week filter to inspect previous week performance.

Interpretation tips:
- red indicators usually require action in attendance/tasks/narratives
- pending counts should be followed through notifications

[SCREENSHOT-INT-008: Dashboard KPI cards and week filter]

### 4.3 Attendance

Purpose:
- records official daily time entries used for review and allowance processing

Required punch sequence:
1. Time In 1
2. Time Out 1
3. Time In 2
4. Time Out 2

Attendance workflow:
1. Open Attendance.
2. Click currently available punch action.
3. Wait for success toast.
4. Confirm entry appears in today record.
5. Repeat when next punch becomes available.

Validation rules:
- out-of-sequence punches are blocked
- duplicate punches are blocked
- cutoff lock may apply
- holiday restrictions may block attendance
- IP consistency checks may flag records

Week review process:
1. Review weekly table.
2. Check each day status.
3. Open rejected items and note reason.

Status definitions:
- Pending
- Approved
- Rejected

[SCREENSHOT-INT-009: Attendance page with today punches]
[SCREENSHOT-INT-010: Weekly attendance table with statuses]

### 4.4 My Tasks

Purpose:
- displays assigned work and allows progress updates

Task status meanings:
- Not Started
- In Progress
- Completed
- Pending Review (if intern task submission is enabled)

Start task:
1. Open task details.
2. Click Start Task.
3. Confirm status update.

Complete task:
1. Confirm output is finished.
2. Open task details.
3. Click Complete Task.
4. Confirm status update.

Rules:
- holiday lock may block action
- overdue tasks are highlighted
- locked/completed tasks may have limited edits

[SCREENSHOT-INT-011: My Tasks list with status badges]
[SCREENSHOT-INT-012: Task details with Start and Complete actions]

### 4.5 Daily Narratives

Purpose:
- captures detailed morning and afternoon work logs

Submit narrative workflow:
1. Open Daily Narratives.
2. Select session (morning or afternoon).
3. Select related task.
4. Enter clear narrative content.
5. Submit and confirm Pending status.

Quality standard:
- objective for session
- key actions performed
- output/result
- blockers/issues if any

Rejected narrative correction:
1. Open rejected entry.
2. Read rejection reason.
3. Edit content to address feedback.
4. Resubmit.

Rules:
- empty content is invalid
- task selection is required
- holiday rule may block submission
- future-date submission may be restricted

[SCREENSHOT-INT-013: Narrative submission modal]
[SCREENSHOT-INT-014: Rejected narrative with reason and resubmit]

### 4.6 My Allowance

Purpose:
- shows weekly allowance computation and approval status

How to review:
1. Open My Allowance.
2. Check week period, hours, rate, amount, and status.
3. Open notes if rejected.

DAR download:
1. Locate Approved week.
2. Click Download DAR.

Status guidance:
- Computed: generated, not final
- Under Review: waiting admin review
- Approved: finalized
- Rejected: requires correction in source workflow

[SCREENSHOT-INT-015: My Allowance table with status badges]

### 4.7 My DAR Draft (If Enabled)

Purpose:
- preview DAR content before final approval

Usage:
1. Open My DAR Draft.
2. Verify week range.
3. Use zoom controls to review details.

Notes:
- visibility depends on admin toggle
- preview does not mean final approval

[SCREENSHOT-INT-016: My DAR Draft preview and zoom controls]

### 4.8 Notifications

Purpose:
- surfaces approvals, rejections, and reminders

Process:
1. Open Notifications.
2. Switch between All and Unread tabs.
3. Open unread entries first.
4. Use Mark All Read when completed.

Best practice:
- check notifications before lunch and before sign out

[SCREENSHOT-INT-017: Notifications with unread tab and mark all read]

### 4.9 Profile and Security

Profile update:
1. Open Profile.
2. Edit allowed personal fields.
3. Save and verify.

Password change:
1. Enter current password.
2. Enter and confirm new password.
3. Save.

Avatar update:
1. Click avatar upload area.
2. Select valid image file.
3. Save and verify display.

[SCREENSHOT-INT-018: Profile page with personal info and password section]

---

## 5. Frequently Asked Questions and Troubleshooting

### FAQ

Q: Why can I not see My DAR Draft?  
A: The feature may be disabled in system settings.

Q: Why was my narrative rejected?  
A: Check the rejection reason and resubmit with required corrections.

Q: Why am I auto-logged out?  
A: Inactivity timeout was reached.

Q: Why can I not punch attendance now?  
A: Possible reasons are sequence rule, cutoff lock, holiday lock, or already logged stage.

### Troubleshooting Table

| Issue | Possible Cause | Resolution |
|---|---|---|
| Cannot login | credentials mismatch or terms unchecked | verify inputs and tick terms checkbox |
| Auto logout | inactivity timeout | login again and continue |
| Attendance action blocked | sequence/cutoff/holiday rule | follow prompt and retry at valid step/time |
| Task action blocked | holiday or lock state | review status and notify supervisor if needed |
| DAR download unavailable | week not approved | wait for approval cycle |

---

## Appendix A - Field Reference Tables

### A.1 Attendance Fields

| Field | Meaning |
|---|---|
| Time In 1 | first morning check-in |
| Time Out 1 | morning check-out |
| Time In 2 | afternoon check-in |
| Time Out 2 | end-of-day check-out |
| Status | pending, approved, or rejected |
| Rejection Reason | reviewer explanation for correction |

### A.2 Narrative Fields

| Field | Meaning |
|---|---|
| Date | work date of narrative |
| Session | morning or afternoon |
| Task | related task reference |
| Content | detailed work description |
| Status | pending, approved, rejected |

---

## Appendix B - Role Permissions Matrix

| Module | Intern | Supervisor | Admin |
|---|---|---|---|
| Dashboard | View | View | View |
| Attendance (Self) | Create/View | No | No |
| Team Attendance | No | View/Review | View/Review |
| My Tasks | View/Update own | No | No |
| Task Management | No | Manage scoped | Manage wider scope |
| Daily Narratives | Create/Edit own | No | No |
| Team Narratives | No | Review scoped | Review wider scope |
| Approvals | No | Review scoped | Review all/scope |
| User Maintenance | No | No | Manage |
| System Settings | No | No | Manage |

---

## Appendix C - Report and DAR Reference

| Item | Intern Access | Notes |
|---|---|---|
| My Allowance | Yes | weekly status and amount |
| DAR Download | Yes (approved week only) | downloadable after approval |
| DAR Draft Preview | Conditional | controlled by admin feature toggle |
| System Reports | No | handled by admin role |

---

## Acknowledgment

I have read and understood this manual.

Name: ____________________  
Signature: ____________________  
Date: ____________________
