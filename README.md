# Madison 88 Interns Productivity Tracker

A web-based platform for managing OJT intern productivity at Madison 88 Business Solutions Asia Inc. The system centralizes attendance, task tracking, daily accomplishment reporting, approvals, allowance workflow, notifications, and auditability in one role-based application.

## Key Features of the Madison 88 Interns Productivity Tracker

### Core Platform Features

- Role-based access control for Admin, HR, Supervisor, and Intern users
- Secure authentication with password reset, first-admin bootstrap, and protected routes
- Row Level Security (RLS) policies in Supabase for data isolation and access control
- Audit logging for key actions and status changes
- Notification center for approval and workflow events
- Configurable organization data such as locations, departments, and system settings

### Intern Productivity Features

- Daily attendance with status tracking and approval flow
- Task assignment visibility, progress updates, and overdue monitoring
- Daily narrative (DAR) submissions with draft handling and approval workflow
- Personal allowance tracking view
- Morning login briefing modal highlighting pending items and priorities
- OJT completion support with e-signature and submission checks

### Supervisor and HR Features

- Supervisor approvals for attendance, narratives, and task-related records
- Team attendance and team narrative monitoring views
- HR attendance overview and allowance management workflows
- Intern directory and reporting views for operational monitoring

### Reporting and Export Features

- Dashboard analytics with charts
- PDF and Excel export for reports
- Historical records for compliance and internal review

## Tech Stack

- Vite 7 (frontend build tool)
- Tailwind CSS 4 (styling)
- Supabase (PostgreSQL, authentication, storage, RLS)
- Chart.js (data visualization)
- Quill 2 (rich text narratives)
- jsPDF + AutoTable and xlsx (report export)
- Netlify (deployment)

## Requirements

- Node.js 20 or newer
- npm 9 or newer
- A Supabase project (for auth, database, and storage)

## Local Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a local env file from the template:

```bash
cp .env.example .env
```

Set the values in .env:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_ADMIN_SECRET_KEY=change-this-to-a-strong-secret
```

### 3. Initialize Supabase schema and migrations

Run SQL files in the supabase folder in order, starting with:

- supabase/001_schema.sql
- supabase/002_rls_policies.sql
- then every migration up to the latest file

### 4. Start development server

```bash
npm run dev
```

Default local URL:

```text
http://localhost:5173
```

## First-Time System Bootstrap

1. Open the app and go to #/admin-setup
2. Enter the value of VITE_ADMIN_SECRET_KEY
3. Create the first Admin account
4. Log in and configure:
   - locations
   - departments
   - system settings
   - users (supervisor, HR, intern)

## Available Scripts

- npm run dev: start local development server
- npm run build: produce production build in dist
- npm run preview: preview the production build locally

## Deployment (Netlify)

### Option A: Git-based deployment

1. Connect the repository in Netlify
2. Use build command: npm run build
3. Use publish directory: dist
4. Add environment variables:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   - VITE_ADMIN_SECRET_KEY

### Option B: Manual deployment

```bash
npm run build
npx netlify deploy --prod --dir=dist
```

## Security Notes

- Supabase RLS policies restrict records by user role and ownership
- Storage access is protected through authenticated flows
- Sensitive actions are logged to support operational traceability

## Project Structure

```text
src/
  main.js
  components/
    layout.js
  lib/
    auth.js
    audit.js
    login-briefing.js
    ojt-completion.js
    router.js
    storage.js
    supabase.js
    ...
  pages/
    admin-setup.js
    approvals.js
    attendance.js
    dashboard.js
    my-tasks.js
    narratives.js
    reports.js
    system-settings.js
    task-management.js
    team-attendance.js
    team-narratives.js
    user-management.js
    ...
supabase/
  001_schema.sql
  002_rls_policies.sql
  ... latest migration files
docs/manuals/
  admin-user-manual.md
  intern-user-manual.md
  supervisor-user-manual.md
```

## Documentation

- docs/manuals/admin-user-manual.md
- docs/manuals/intern-user-manual.md
- docs/manuals/supervisor-user-manual.md
- TESTING_GUIDE.md
- LOGIN_BRIEFING_GUIDE.md

## License

UNLICENSED. Proprietary software owned by Madison 88 Business Solutions Asia Inc.
