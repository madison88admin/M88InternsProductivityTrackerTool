-- ============================================================
-- M88 Interns Productivity Tracker Tool
-- Row-Level Security (RLS) Policies
-- ============================================================
-- Run this AFTER 001_schema.sql
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE narratives ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE allowance_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Helper function to get current user's role
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to get current user's location
CREATE OR REPLACE FUNCTION get_user_location()
RETURNS UUID AS $$
  SELECT location_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- PROFILES POLICIES
-- ============================================================

-- Everyone can read profiles (needed for display names, etc.)
CREATE POLICY profiles_select ON profiles FOR SELECT
  USING (true);

-- Users can update their own profile (limited fields handled in app)
CREATE POLICY profiles_update_own ON profiles FOR UPDATE
  USING (id = auth.uid());

-- Admin can update any profile
CREATE POLICY profiles_update_admin ON profiles FOR UPDATE
  USING (get_user_role() = 'admin');

-- Admin can insert profiles
CREATE POLICY profiles_insert_admin ON profiles FOR INSERT
  WITH CHECK (get_user_role() = 'admin' OR id = auth.uid());

-- ============================================================
-- LOCATIONS POLICIES
-- ============================================================

CREATE POLICY locations_select ON locations FOR SELECT
  USING (true);

CREATE POLICY locations_insert ON locations FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY locations_update ON locations FOR UPDATE
  USING (get_user_role() = 'admin');

CREATE POLICY locations_delete ON locations FOR DELETE
  USING (get_user_role() = 'admin');

-- ============================================================
-- DEPARTMENTS POLICIES
-- ============================================================

CREATE POLICY departments_select ON departments FOR SELECT
  USING (true);

CREATE POLICY departments_insert ON departments FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY departments_update ON departments FOR UPDATE
  USING (get_user_role() = 'admin');

CREATE POLICY departments_delete ON departments FOR DELETE
  USING (get_user_role() = 'admin');

-- ============================================================
-- ATTENDANCE RECORDS POLICIES
-- ============================================================

-- Interns see their own; supervisors see their team; admin sees all (within location)
CREATE POLICY attendance_select ON attendance_records FOR SELECT
  USING (
    intern_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Interns can insert their own attendance
CREATE POLICY attendance_insert ON attendance_records FOR INSERT
  WITH CHECK (intern_id = auth.uid() AND get_user_role() = 'intern');

-- Interns can update their own pending records; supervisors can approve/reject
CREATE POLICY attendance_update ON attendance_records FOR UPDATE
  USING (
    (intern_id = auth.uid() AND status = 'pending')
    OR supervisor_id = auth.uid()
    OR get_user_role() IN ('admin')
  );

-- ============================================================
-- ATTENDANCE CORRECTIONS POLICIES
-- ============================================================

CREATE POLICY corrections_select ON attendance_corrections FOR SELECT
  USING (
    intern_id = auth.uid()
    OR reviewed_by = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY corrections_insert ON attendance_corrections FOR INSERT
  WITH CHECK (intern_id = auth.uid());

CREATE POLICY corrections_update ON attendance_corrections FOR UPDATE
  USING (
    reviewed_by = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- TASKS POLICIES
-- ============================================================

CREATE POLICY tasks_select ON tasks FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY tasks_insert ON tasks FOR INSERT
  WITH CHECK (get_user_role() IN ('admin', 'supervisor'));

CREATE POLICY tasks_update ON tasks FOR UPDATE
  USING (
    created_by = auth.uid()
    OR assigned_to = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- NARRATIVES POLICIES
-- ============================================================

CREATE POLICY narratives_select ON narratives FOR SELECT
  USING (
    intern_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY narratives_insert ON narratives FOR INSERT
  WITH CHECK (intern_id = auth.uid() AND get_user_role() = 'intern');

CREATE POLICY narratives_update ON narratives FOR UPDATE
  USING (
    (intern_id = auth.uid() AND status IN ('pending', 'rejected'))
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- APPROVALS POLICIES
-- ============================================================

CREATE POLICY approvals_select ON approvals FOR SELECT
  USING (
    intern_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY approvals_insert ON approvals FOR INSERT
  WITH CHECK (
    intern_id = auth.uid()
    OR get_user_role() IN ('admin', 'supervisor')
  );

CREATE POLICY approvals_update ON approvals FOR UPDATE
  USING (
    supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- ============================================================
-- ALLOWANCE CONFIG POLICIES
-- ============================================================

CREATE POLICY allowance_config_select ON allowance_config FOR SELECT
  USING (true);

CREATE POLICY allowance_config_insert ON allowance_config FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY allowance_config_update ON allowance_config FOR UPDATE
  USING (get_user_role() = 'admin');

-- ============================================================
-- ALLOWANCE PERIODS POLICIES
-- ============================================================

CREATE POLICY allowance_periods_select ON allowance_periods FOR SELECT
  USING (
    intern_id = auth.uid()
    OR get_user_role() = 'admin'
  );

CREATE POLICY allowance_periods_insert ON allowance_periods FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY allowance_periods_update ON allowance_periods FOR UPDATE
  USING (get_user_role() = 'admin');

-- ============================================================
-- NOTIFICATIONS POLICIES
-- ============================================================

CREATE POLICY notifications_select ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY notifications_update ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- ============================================================
-- AUDIT LOGS POLICIES
-- ============================================================

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (get_user_role() = 'admin');

CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (true);

-- ============================================================
-- SYSTEM SETTINGS POLICIES
-- ============================================================

CREATE POLICY settings_select ON system_settings FOR SELECT
  USING (true);

CREATE POLICY settings_update ON system_settings FOR UPDATE
  USING (get_user_role() = 'admin');

CREATE POLICY settings_insert ON system_settings FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

-- ============================================================
-- STORAGE BUCKET for profile avatars
-- ============================================================

INSERT INTO storage.buckets (id, name, public) 
VALUES ('avatars', 'avatars', true)
ON CONFLICT DO NOTHING;

CREATE POLICY avatar_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY avatar_select ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY avatar_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
