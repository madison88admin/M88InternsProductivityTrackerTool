# M88 Interns Productivity Tracker
## Administrator User Manual

Document ID: M88-UM-ADM-001  
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
| 2.0 | 2026-04-06 | Documentation Team | Expanded procedures and governance notes | |
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
4. Admin Role Guide  
4.1 Role Overview  
4.2 Dashboard  
4.3 Attendance Overview  
4.4 Approvals  
4.5 Allowance Management  
4.6 Task Management  
4.7 User Maintenance  
4.8 Intern Directory  
4.9 Team Attendance and Team Narratives  
4.10 Holiday Calendar  
4.11 Reports  
4.12 Departments and Locations  
4.13 Audit Logs  
4.14 Settings  
4.15 Notifications  
4.16 Profile and Security  
5. Frequently Asked Questions and Troubleshooting  
Appendix A - Field Reference Tables  
Appendix B - Role Permissions Matrix  
Appendix C - Report Column Reference

---

## 1. System Overview

The M88 Interns Productivity Tracker is a centralized platform for intern operations, approvals, and compliance management.

Admin responsibilities include:
- managing access and user lifecycle
- ensuring approval workflows are timely and consistent
- maintaining attendance and allowance governance
- configuring organization and system settings
- preserving traceability via audit logs and reports

[SCREENSHOT-ADM-001: Admin dashboard landing]

---

## 2. Getting Started

### 2.1 Logging In

1. Open system URL.
2. Enter admin email and password.
3. Tick Terms and Conditions.
4. Click Sign In.

Expected result:
- admin modules are available in sidebar

### 2.2 Setting Your Password (New Users)

1. Open invite/setup link.
2. Enter and confirm password.
3. Save and continue.

For first platform admin creation, setup may require an admin secret key.

### 2.3 Resetting Your Password

1. Click Forgot Password.
2. Enter email.
3. Open reset link from mailbox.
4. Set and confirm new password.
5. Login again.

### 2.4 Logging Out

1. Click Sign Out.
2. Confirm return to login page.

[SCREENSHOT-ADM-002: Admin sign out and redirect]

---

## 3. Navigation and Layout

### 3.1 Sidebar Navigation

Admin modules typically include:
- Dashboard
- Notifications
- Attendance
- Allowance
- Tasks
- Approvals
- Holiday Calendar
- Reports
- User Maintenance
- Intern Directory
- Departments
- Locations
- Audit Logs
- Settings
- Team Attendance (if scope supports)
- Team Narratives (if scope supports)
- Profile
- Sign Out

[SCREENSHOT-ADM-003: Admin sidebar with grouped modules]

### 3.2 Topbar and Page Header

Most admin pages include operational headers with:
- counters and status summary
- date/filter controls
- primary action buttons
- export controls where applicable

Before taking bulk action, verify current filters and scope.

### 3.3 Mobile Behavior

- desktop/laptop operation is recommended
- phone browsers may be restricted
- use stable connection and supported browser

---

## 4. Admin Role Guide

### 4.1 Role Overview

Admin role governs system integrity, policy enforcement, and operational throughput.

Daily recommended sequence:
1. review notifications and escalations
2. clear approvals queue
3. inspect attendance and allowance exceptions
4. process user and organization requests
5. verify settings changes and audit history

### 4.2 Dashboard

Purpose:
- high-level operations and compliance summary

Use:
1. review pending and escalated counters
2. compare trend indicators
3. navigate to modules requiring immediate action

[SCREENSHOT-ADM-004: Dashboard KPI and summary cards]

### 4.3 Attendance Overview

Purpose:
- monitor attendance across teams and periods

Workflow:
1. open Attendance
2. apply period/status/department filters
3. review summary metrics and row data
4. investigate anomalies
5. export if needed

Indicators to monitor:
- high pending ratio
- late trend spikes
- IP mismatch concentration
- missing punch patterns

[SCREENSHOT-ADM-005: Attendance overview table and filters]

### 4.4 Approvals

Purpose:
- final review and decision for pending and escalated records

Workflow:
1. open Approvals
2. prioritize oldest and escalated records
3. validate details
4. approve or reject
5. include reviewer rationale

Bulk workflow:
1. filter eligible homogeneous records
2. use Approve All/Reject All as policy permits
3. confirm results

[SCREENSHOT-ADM-006: Admin approvals queue and detail panel]

### 4.5 Allowance Management

Purpose:
- configure rates and finalize weekly allowance outcomes

End-to-end process:
1. choose rate mode (global or individual)
2. update rates
3. compute target periods
4. review computed outputs
5. approve or reject periods with notes

Controls:
- invalid rates are blocked
- finalized periods should not be re-approved
- exceptions need explicit rationale

[SCREENSHOT-ADM-007: Allowance management with rate and status controls]

### 4.6 Task Management

Purpose:
- operational oversight of tasks across allowed scope

Workflow:
1. create and assign tasks
2. edit permitted fields where needed
3. monitor overdue status
4. archive completed tasks

[SCREENSHOT-ADM-008: Task management list and create/edit actions]

### 4.7 User Maintenance

Purpose:
- manage user lifecycle and role assignments

Invite workflow:
1. click Invite User
2. enter details
3. assign role and mappings
4. submit invite

Edit workflow:
1. search user
2. open edit form
3. update fields
4. save

Activation workflow:
1. deactivate/reactivate as needed
2. confirm action

Deletion workflow:
1. choose delete if policy allows
2. confirm warning

Common constraints:
- duplicate email blocked
- self-deactivation blocked
- linked records may block deletion

[SCREENSHOT-ADM-009: User maintenance table and invite/edit modal]

### 4.8 Intern Directory

Purpose:
- intern-centric view for progress and controlled interventions

Workflow:
1. search/filter intern list
2. review OJT progress and estimated completion
3. perform approved manual logging if required
4. document intervention reason

[SCREENSHOT-ADM-010: Intern directory cards and progress bars]

### 4.9 Team Attendance and Team Narratives

Purpose:
- extended oversight similar to supervisor views

Use Team Attendance to:
- inspect scoped team records
- support correction/escalation handling

Use Team Narratives to:
- evaluate narrative quality trends
- identify repeat rejection patterns

[SCREENSHOT-ADM-011: Team attendance admin view]
[SCREENSHOT-ADM-012: Team narratives admin view]

### 4.10 Holiday Calendar

Purpose:
- define holiday dates that affect intern workflows

Workflow:
1. select date
2. add holiday name
3. save
4. edit/delete entries when needed

Controls:
- holiday name required
- duplicate date blocked

[SCREENSHOT-ADM-013: Holiday calendar and holiday entry modal]

### 4.11 Reports

Purpose:
- generate operational and compliance reports

Workflow:
1. select report type
2. set date and filters
3. generate
4. validate output
5. export (XLSX/PDF)

Common report types:
- attendance summary
- hours logged
- task status
- allowance summary
- DAR outputs

[SCREENSHOT-ADM-014: Reports module with export controls]

### 4.12 Departments and Locations

Departments workflow:
1. create/edit department
2. set active status
3. delete only if dependency-free

Locations workflow:
1. create/edit location
2. maintain allowed IP entries
3. manage active status

Constraints:
- validation and uniqueness checks apply
- linked users may block deletion/deactivation

[SCREENSHOT-ADM-015: Departments and locations management pages]

### 4.13 Audit Logs

Purpose:
- immutable history of system actions and events

Workflow:
1. open Audit Logs
2. filter by date/action/user
3. review sequence and details
4. document findings for incidents

[SCREENSHOT-ADM-016: Audit logs table with filters]

### 4.14 Settings

Purpose:
- control global behavior and feature availability

Common settings groups:
- work hours
- attendance thresholds
- escalation parameters
- data retention
- feature toggles

Controlled change process:
1. verify change request approval
2. update value
3. validate range/format
4. save and confirm
5. communicate impact

[SCREENSHOT-ADM-017: Settings page with toggles and numeric fields]

### 4.15 Notifications

Purpose:
- alerts for pending actions and system updates

Workflow:
1. open Notifications
2. review unread first
3. open and process relevant action
4. mark read/mark all read

[SCREENSHOT-ADM-018: Admin notifications list]

### 4.16 Profile and Security

Profile updates:
1. open Profile
2. edit permitted fields
3. save

Password update:
1. enter current password
2. set and confirm new password
3. save

Security reminder:
- do not share credentials
- sign out when leaving workstation

[SCREENSHOT-ADM-019: Admin profile and password area]

---

## 5. Frequently Asked Questions and Troubleshooting

### FAQ

Q: Why is a user unable to open a module?  
A: Role/scope assignment may not include that module.

Q: Why can I not delete a department or location?  
A: Active user or record dependencies still exist.

Q: Why are report results empty?  
A: Current filters may be too narrow.

Q: Should I use bulk approvals for all pending records?  
A: No. Use bulk only for low-risk, validated, homogeneous queues.

### Troubleshooting Table

| Issue | Possible Cause | Resolution |
|---|---|---|
| Module access denied | role or scope mismatch | review role assignment and mappings |
| Approval queue not reducing | repeated validation failures | inspect rejection reasons and upstream data quality |
| Allowance not finalizing | period still under review/invalid data | revalidate source records and recompute where needed |
| Holiday not applied | wrong date or unsaved entry | verify holiday record and save confirmation |
| Export failure | invalid filters/session issue | retry with refined filters and stable connection |

---

## Appendix A - Field Reference Tables

### A.1 User Management Fields

| Field | Meaning |
|---|---|
| Role | access level (intern/supervisor/admin) |
| Department | organizational unit |
| Location | assigned workplace reference |
| Is Active | login permission state |
| Hours Required | OJT target for intern |

### A.2 Approval Fields

| Field | Meaning |
|---|---|
| Type | attendance/narrative/task/correction |
| Status | pending/approved/rejected |
| Submitted At | record submission time |
| Reviewed By | reviewer account |
| Comment | review rationale |

### A.3 Allowance Fields

| Field | Meaning |
|---|---|
| Week Range | covered period |
| Hours | approved duration basis |
| Rate | applied hourly rate |
| Amount | computed total |
| Status | computed, under review, approved, rejected |

---

## Appendix B - Role Permissions Matrix

| Module | Intern | Supervisor | Admin |
|---|---|---|---|
| Dashboard | View | View | View |
| Attendance (Self) | Create/View | No | No |
| Team Attendance | No | Review scoped | Review broad/scope |
| My Tasks | Update own | No | No |
| Task Management | No | Manage scoped | Manage broad/scope |
| Daily Narratives | Create/Edit own | No | No |
| Team Narratives | No | Review scoped | Review broad/scope |
| Approvals | No | Review scoped | Review final/scope |
| Allowance Management | No | No | Manage |
| User Maintenance | No | No | Manage |
| Settings | No | No | Manage |
| Audit Logs | No | Conditional | Manage |

---

## Appendix C - Report Column Reference

### C.1 Attendance Summary

| Column | Description |
|---|---|
| Date | attendance record date |
| Intern Name | owner of record |
| Department | organizational grouping |
| Hours | computed attendance hours |
| Status | pending/approved/rejected |
| Late | late flag indicator |

### C.2 Allowance Summary

| Column | Description |
|---|---|
| Week | covered week period |
| Intern | payee intern |
| Hours | approved basis hours |
| Rate | applied hourly rate |
| Amount | total computed value |
| Status | review/finalization state |

### C.3 Task Status Report

| Column | Description |
|---|---|
| Task Title | task name |
| Assignee | assigned intern |
| Due Date | expected completion date |
| Status | not started/in progress/completed |
| Overdue | deadline breach indicator |

---

## Acknowledgment

I have read and understood this manual.

Name: ____________________  
Signature: ____________________  
Date: ____________________
