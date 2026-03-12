-- ============================================================
-- Migration: Remove HR Role
-- Reassigns all 'hr' users to 'admin', drops the 'hr' value
-- from the user_role ENUM, and updates affected RLS policies.
--
-- For an EXISTING database: run this file only (003).
-- For a FRESH database:     run 001, then 002 (003 not needed).
-- ============================================================

-- Step 1: Reassign any existing HR users to admin
UPDATE profiles
SET role = 'admin'
WHERE role = 'hr';

-- Step 2: Drop the DEFAULT so the column can be retyped
ALTER TABLE profiles
  ALTER COLUMN role DROP DEFAULT;

-- Step 3: Rename the existing ENUM to free up the name
ALTER TYPE user_role RENAME TO user_role_old;

-- Step 4: Create the new ENUM without 'hr'
CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'intern');

-- Step 5: Migrate the column to use the new ENUM
ALTER TABLE profiles
  ALTER COLUMN role TYPE user_role
  USING role::text::user_role;

-- Step 6: Restore the DEFAULT using the new ENUM
ALTER TABLE profiles
  ALTER COLUMN role SET DEFAULT 'intern';

-- Step 7: Drop the old ENUM
DROP TYPE user_role_old;

-- Step 8: Recreate the trigger function so it references the new ENUM
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'intern')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- Step 9: Update RLS policies that referenced 'hr'
-- (DROP then recreate each affected policy)
-- ============================================================

-- Locations
DROP POLICY IF EXISTS locations_insert ON locations;
DROP POLICY IF EXISTS locations_update ON locations;
CREATE POLICY locations_insert ON locations FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY locations_update ON locations FOR UPDATE
  USING (get_user_role() = 'admin');

-- Departments
DROP POLICY IF EXISTS departments_insert ON departments;
DROP POLICY IF EXISTS departments_update ON departments;
CREATE POLICY departments_insert ON departments FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY departments_update ON departments FOR UPDATE
  USING (get_user_role() = 'admin');

-- Attendance records
DROP POLICY IF EXISTS attendance_select ON attendance_records;
CREATE POLICY attendance_select ON attendance_records FOR SELECT
  USING (
    intern_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Attendance corrections
DROP POLICY IF EXISTS corrections_select ON attendance_corrections;
CREATE POLICY corrections_select ON attendance_corrections FOR SELECT
  USING (
    intern_id = auth.uid()
    OR reviewed_by = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Tasks
DROP POLICY IF EXISTS tasks_select ON tasks;
CREATE POLICY tasks_select ON tasks FOR SELECT
  USING (
    assigned_to = auth.uid()
    OR created_by = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Narratives
DROP POLICY IF EXISTS narratives_select ON narratives;
CREATE POLICY narratives_select ON narratives FOR SELECT
  USING (
    intern_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Approvals
DROP POLICY IF EXISTS approvals_select ON approvals;
CREATE POLICY approvals_select ON approvals FOR SELECT
  USING (
    intern_id = auth.uid()
    OR supervisor_id = auth.uid()
    OR get_user_role() = 'admin'
  );

-- Allowance config
DROP POLICY IF EXISTS allowance_config_insert ON allowance_config;
DROP POLICY IF EXISTS allowance_config_update ON allowance_config;
CREATE POLICY allowance_config_insert ON allowance_config FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY allowance_config_update ON allowance_config FOR UPDATE
  USING (get_user_role() = 'admin');

-- Allowance periods
DROP POLICY IF EXISTS allowance_periods_select ON allowance_periods;
DROP POLICY IF EXISTS allowance_periods_insert ON allowance_periods;
DROP POLICY IF EXISTS allowance_periods_update ON allowance_periods;
CREATE POLICY allowance_periods_select ON allowance_periods FOR SELECT
  USING (
    intern_id = auth.uid()
    OR get_user_role() = 'admin'
  );
CREATE POLICY allowance_periods_insert ON allowance_periods FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
CREATE POLICY allowance_periods_update ON allowance_periods FOR UPDATE
  USING (get_user_role() = 'admin');

-- Audit logs
DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT
  USING (get_user_role() = 'admin');
