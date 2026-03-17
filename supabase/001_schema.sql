-- ============================================================
-- M88 Interns Productivity Tracker Tool
-- Supabase Database Schema
-- ============================================================
-- SETUP INSTRUCTIONS:
-- 1. Go to your Supabase project dashboard
-- 2. Navigate to SQL Editor
-- 3. Paste this entire file and click "Run"
-- 4. Then run 002_rls_policies.sql
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUM TYPES
-- ============================================================

CREATE TYPE user_role AS ENUM ('admin', 'supervisor', 'intern');
CREATE TYPE attendance_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE punch_type AS ENUM ('time_in_1', 'time_out_1', 'time_in_2', 'time_out_2');
CREATE TYPE task_status AS ENUM ('not_started', 'in_progress', 'completed');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE approval_type AS ENUM ('attendance', 'narrative', 'task_status', 'attendance_correction', 'daily_bulk');
CREATE TYPE allowance_period_status AS ENUM ('computed', 'under_review', 'approved', 'rejected');
CREATE TYPE notification_type AS ENUM ('pending_approval', 'approval_result', 'missing_submission', 'allowance_ready', 'escalation', 'system');
CREATE TYPE correction_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE intern_status AS ENUM ('active', 'inactive', 'completed', 'archived');

-- ============================================================
-- LOCATIONS TABLE
-- ============================================================

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- DEPARTMENTS TABLE
-- ============================================================

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(name, location_id)
);

-- ============================================================
-- PROFILES TABLE (extends Supabase auth.users)
-- ============================================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'intern',
  avatar_url TEXT,
  signature_url TEXT,
  phone VARCHAR(50),
  school VARCHAR(255),
  course VARCHAR(255),
  hours_required NUMERIC(8,2) DEFAULT 0,
  hours_rendered NUMERIC(8,2) DEFAULT 0,
  ojt_start_date DATE,
  ojt_end_date DATE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
  supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status intern_status NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_role ON profiles(role);
CREATE INDEX idx_profiles_department ON profiles(department_id);
CREATE INDEX idx_profiles_location ON profiles(location_id);
CREATE INDEX idx_profiles_supervisor ON profiles(supervisor_id);

-- ============================================================
-- ATTENDANCE RECORDS TABLE
-- ============================================================

CREATE TABLE attendance_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intern_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time_in_1 TIMESTAMPTZ,
  time_out_1 TIMESTAMPTZ,
  time_in_2 TIMESTAMPTZ,
  time_out_2 TIMESTAMPTZ,
  ip_address_in_1 INET,
  ip_address_out_1 INET,
  ip_address_in_2 INET,
  ip_address_out_2 INET,
  total_hours NUMERIC(5,2) DEFAULT 0,
  is_late BOOLEAN DEFAULT false,
  is_outside_hours BOOLEAN DEFAULT false,
  status attendance_status NOT NULL DEFAULT 'pending',
  supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(intern_id, date)
);

CREATE INDEX idx_attendance_intern ON attendance_records(intern_id);
CREATE INDEX idx_attendance_date ON attendance_records(date);
CREATE INDEX idx_attendance_status ON attendance_records(status);

-- ============================================================
-- ATTENDANCE CORRECTIONS TABLE
-- ============================================================

CREATE TABLE attendance_corrections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attendance_id UUID NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  intern_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  punch_type punch_type NOT NULL,
  original_value TIMESTAMPTZ,
  requested_value TIMESTAMPTZ NOT NULL,
  reason TEXT NOT NULL,
  status correction_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_corrections_attendance ON attendance_corrections(attendance_id);
CREATE INDEX idx_corrections_status ON attendance_corrections(status);

-- ============================================================
-- TASKS TABLE
-- ============================================================

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(500) NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status task_status NOT NULL DEFAULT 'not_started',
  pending_status task_status,
  estimated_hours NUMERIC(5,2),
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_created_by ON tasks(created_by);
CREATE INDEX idx_tasks_status ON tasks(status);

-- ============================================================
-- DAILY NARRATIVES TABLE
-- ============================================================

CREATE TABLE narratives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intern_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  status approval_status NOT NULL DEFAULT 'pending',
  supervisor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_narratives_intern ON narratives(intern_id);
CREATE INDEX idx_narratives_task ON narratives(task_id);
CREATE INDEX idx_narratives_date ON narratives(date);
CREATE INDEX idx_narratives_status ON narratives(status);

-- ============================================================
-- APPROVALS TABLE (unified approval workflow)
-- ============================================================

CREATE TABLE approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type approval_type NOT NULL,
  entity_id UUID NOT NULL,
  intern_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  supervisor_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status approval_status NOT NULL DEFAULT 'pending',
  comments TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  escalated_at TIMESTAMPTZ,
  is_escalated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_approvals_supervisor ON approvals(supervisor_id);
CREATE INDEX idx_approvals_intern ON approvals(intern_id);
CREATE INDEX idx_approvals_status ON approvals(status);
CREATE INDEX idx_approvals_type ON approvals(type);

-- ============================================================
-- ALLOWANCE CONFIGURATION TABLE
-- ============================================================

CREATE TABLE allowance_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  hourly_rate NUMERIC(10,2) NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  set_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ALLOWANCE PERIODS TABLE (weekly computation)
-- ============================================================

CREATE TABLE allowance_periods (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  intern_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  week_end DATE NOT NULL,
  total_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(10,2) NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status allowance_period_status NOT NULL DEFAULT 'computed',
  reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(intern_id, week_start)
);

CREATE INDEX idx_allowance_intern ON allowance_periods(intern_id);
CREATE INDEX idx_allowance_status ON allowance_periods(status);
CREATE INDEX idx_allowance_week ON allowance_periods(week_start);

-- ============================================================
-- NOTIFICATIONS TABLE
-- ============================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_email_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);
CREATE INDEX idx_notifications_type ON notifications(type);

-- ============================================================
-- AUDIT LOGS TABLE
-- ============================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- ============================================================
-- SYSTEM SETTINGS TABLE
-- ============================================================

CREATE TABLE system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default settings
INSERT INTO system_settings (key, value) VALUES
  ('work_hours', '{"start": "07:00", "end": "18:00", "late_threshold": "09:00"}'),
  ('attendance_rules', '{"require_same_ip": true, "allow_outside_hours": true, "flag_outside_hours": true}'),
  ('escalation_hours', '24'),
  ('data_retention_months', '36'),
  ('enable_forgot_password', '{"enabled": true}'),
  ('enable_admin_account_creation', '{"enabled": true}');

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_attendance_updated_at BEFORE UPDATE ON attendance_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_narratives_updated_at BEFORE UPDATE ON narratives FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER tr_allowance_periods_updated_at BEFORE UPDATE ON allowance_periods FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Function: Calculate total hours for an attendance record
CREATE OR REPLACE FUNCTION calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_hours = 0;
  
  IF NEW.time_in_1 IS NOT NULL AND NEW.time_out_1 IS NOT NULL THEN
    NEW.total_hours = NEW.total_hours + EXTRACT(EPOCH FROM (NEW.time_out_1 - NEW.time_in_1)) / 3600.0;
  END IF;
  
  IF NEW.time_in_2 IS NOT NULL AND NEW.time_out_2 IS NOT NULL THEN
    NEW.total_hours = NEW.total_hours + EXTRACT(EPOCH FROM (NEW.time_out_2 - NEW.time_in_2)) / 3600.0;
  END IF;
  
  -- Round to 2 decimal places
  NEW.total_hours = ROUND(NEW.total_hours::numeric, 2);
  
  -- Check if late (first login at or after 9 AM)
  IF NEW.time_in_1 IS NOT NULL THEN
    NEW.is_late = EXTRACT(HOUR FROM NEW.time_in_1 AT TIME ZONE 'Asia/Manila') >= 9;
  END IF;
  
  -- Check if outside allowed hours
  IF NEW.time_in_1 IS NOT NULL THEN
    NEW.is_outside_hours = (
      EXTRACT(HOUR FROM NEW.time_in_1 AT TIME ZONE 'Asia/Manila') < 7 OR
      (NEW.time_out_2 IS NOT NULL AND EXTRACT(HOUR FROM NEW.time_out_2 AT TIME ZONE 'Asia/Manila') >= 18)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_attendance_calc_hours 
  BEFORE INSERT OR UPDATE ON attendance_records 
  FOR EACH ROW EXECUTE FUNCTION calculate_attendance_hours();

-- Function: Create profile on user signup
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

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Function: Compute weekly allowance for an intern
CREATE OR REPLACE FUNCTION compute_weekly_allowance(
  p_intern_id UUID,
  p_week_start DATE,
  p_week_end DATE
)
RETURNS TABLE(total_hours NUMERIC, hourly_rate NUMERIC, total_amount NUMERIC) AS $$
DECLARE
  v_hours NUMERIC(6,2);
  v_rate NUMERIC(10,2);
BEGIN
  -- Sum approved attendance hours for the week
  SELECT COALESCE(SUM(ar.total_hours), 0) INTO v_hours
  FROM attendance_records ar
  WHERE ar.intern_id = p_intern_id
    AND ar.date >= p_week_start
    AND ar.date <= p_week_end
    AND ar.status = 'approved';
  
  -- Get current hourly rate
  SELECT ac.hourly_rate INTO v_rate
  FROM allowance_config ac
  WHERE ac.effective_from <= p_week_end
    AND (ac.effective_to IS NULL OR ac.effective_to >= p_week_start)
  ORDER BY ac.effective_from DESC
  LIMIT 1;
  
  IF v_rate IS NULL THEN
    v_rate = 0;
  END IF;
  
  total_hours = v_hours;
  hourly_rate = v_rate;
  total_amount = ROUND(v_hours * v_rate, 2);
  
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- Function: Update intern's rendered hours
CREATE OR REPLACE FUNCTION update_intern_hours()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved'))
     OR (NEW.status = 'approved' AND OLD.status = 'approved' AND NEW.total_hours IS DISTINCT FROM OLD.total_hours) THEN
    UPDATE profiles
    SET hours_rendered = (
      SELECT COALESCE(SUM(total_hours), 0)
      FROM attendance_records
      WHERE intern_id = NEW.intern_id AND status = 'approved'
    )
    WHERE id = NEW.intern_id;
    
    -- Auto-compute OJT end date if hours_required is set
    UPDATE profiles
    SET ojt_end_date = (
      SELECT CASE 
        WHEN hours_required > 0 AND hours_rendered > 0 THEN
          ojt_start_date + ROUND(
            hours_required / GREATEST(
              hours_rendered / GREATEST(
                EXTRACT(DAY FROM NOW() - ojt_start_date)::numeric, 1
              ), 0.1)
          )::integer
        ELSE NULL
      END
      FROM profiles WHERE id = NEW.intern_id
    )
    WHERE id = NEW.intern_id AND hours_required > 0;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tr_update_intern_hours
  AFTER UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION update_intern_hours();
