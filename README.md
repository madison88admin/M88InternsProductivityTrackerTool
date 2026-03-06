# M88 Interns Productivity Tracker Tool

Centralized web-based system for tracking OJT intern productivity at Madison 88 Business Solutions Asia Inc.

## Tech Stack

- **Vite 7** — Build tool
- **Tailwind CSS 4** — Styling
- **Supabase** — Database (PostgreSQL), Authentication, Storage, RLS
- **Chart.js** — Dashboard charts
- **SheetJS (xlsx)** — Excel export
- **jsPDF + AutoTable** — PDF export
- **Quill.js 2** — Rich text editor for daily narratives
- **Netlify** — Deployment

## Quick Start

### 1. Clone & Install

```bash
git clone <repo-url>
cd M88InternsProductivityTrackerTool
npm install
```

### 2. Supabase Setup

1. Create a new project at [Supabase](https://supabase.com)
2. Go to **SQL Editor** and run the schema files in order:
   - `supabase/001_schema.sql` — Tables, enums, functions, triggers
   - `supabase/002_rls_policies.sql` — Row-level security policies & storage bucket
3. Copy your project URL and anon key from **Settings → API**

### 3. Environment Variables

```bash
cp .env.example .env
```

Edit `.env`:
```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
VITE_ADMIN_SECRET_KEY=your-secret-key-for-admin-registration
```

### 4. Run Locally

```bash
npm run dev
```

Visit `http://localhost:5173`

### 5. First-Time Setup

1. Navigate to `#/admin-setup`
2. Enter the admin secret key (from `VITE_ADMIN_SECRET_KEY`)
3. Register the first admin account
4. Login and start configuring:
   - **Locations** — Add office locations with allowed IPs
   - **Departments** — Create departments
   - **System Settings** — Configure work hours, late threshold, escalation
   - **User Management** — Invite supervisors, HR, and interns via email

## Deployment (Netlify)

### Option A: Git Deploy
1. Push repo to GitHub
2. Connect to Netlify → Import from Git
3. Build command: `npm run build`
4. Publish directory: `dist`
5. Set environment variables in Netlify dashboard:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ADMIN_SECRET_KEY`

### Option B: Manual Deploy
```bash
npm run build
npx netlify deploy --prod --dir=dist
```

## Email Notifications (Brevo)

To enable email notifications:

1. Create a [Brevo](https://www.brevo.com) account and get an API key
2. Create a Supabase Edge Function:

```bash
supabase functions new send-notification
```

3. In `supabase/functions/send-notification/index.ts`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const { to, subject, html } = await req.json();

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': Deno.env.get('BREVO_API_KEY')!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'M88 Tracker', email: 'noreply@m88.com' },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  return new Response(JSON.stringify({ ok: res.ok }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
```

4. Set the secret:
```bash
supabase secrets set BREVO_API_KEY=your-brevo-api-key
```

5. Deploy:
```bash
supabase functions deploy send-notification
```

## Roles & Permissions

| Role | Access |
|------|--------|
| **Admin** | Full system access — user management, locations, departments, all approvals, audit logs, settings |
| **HR** | Attendance overview, allowance management, reports, intern directory, departments |
| **Supervisor** | Approvals (attendance, narratives, tasks), task management, team views |
| **Intern** | Personal attendance, tasks, narratives, allowance history |

## Project Structure

```
src/
├── main.js                  # App entry point — routes & auth guard
├── styles/main.css          # Tailwind CSS + custom components
├── lib/
│   ├── supabase.js          # Supabase client
│   ├── router.js            # Hash-based SPA router
│   ├── auth.js              # Authentication service
│   ├── toast.js             # Toast notifications
│   ├── audit.js             # Audit logging
│   ├── utils.js             # Date/time/formatting helpers
│   ├── component.js         # Render, modal, dialog helpers
│   └── icons.js             # SVG icon library
├── components/
│   └── layout.js            # App shell with role-based sidebar
├── pages/
│   ├── login.js             # Login
│   ├── admin-setup.js       # First admin registration
│   ├── forgot-password.js   # Password reset
│   ├── dashboard.js         # Role-specific dashboards
│   ├── attendance.js        # Intern attendance (4 punches)
│   ├── my-tasks.js          # Intern task view
│   ├── narratives.js        # Daily narratives (Quill editor)
│   ├── my-allowance.js      # Intern allowance history
│   ├── task-management.js   # Supervisor task CRUD
│   ├── approvals.js         # Supervisor approval workflow
│   ├── team-attendance.js   # Supervisor team attendance view
│   ├── team-narratives.js   # Supervisor team narratives view
│   ├── user-management.js   # Admin user management
│   ├── allowance-management.js # HR allowance config & approval
│   ├── reports.js           # Reports with Chart.js + XLSX/PDF export
│   ├── intern-directory.js  # HR intern listing
│   ├── attendance-overview.js # HR/Admin attendance overview
│   ├── departments.js       # Admin department CRUD
│   ├── locations.js         # Admin location CRUD
│   ├── audit-logs.js        # Admin audit trail viewer
│   ├── system-settings.js   # Admin system configuration
│   ├── notifications.js     # In-app notification center
│   └── profile.js           # User profile & password change
supabase/
├── 001_schema.sql           # Database schema
└── 002_rls_policies.sql     # RLS policies & storage
```

## License

Proprietary — Madison 88 Business Solutions Asia Inc.
