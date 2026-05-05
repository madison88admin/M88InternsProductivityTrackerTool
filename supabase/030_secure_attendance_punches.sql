-- Migration: Secure intern attendance punches behind a server-side function
-- Prevents authenticated interns from writing attendance rows directly via PostgREST.

CREATE OR REPLACE FUNCTION log_attendance_punch(
  p_punch_type punch_type,
  p_ip_address inet DEFAULT NULL
)
RETURNS attendance_records
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile profiles%ROWTYPE;
  v_record attendance_records%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Manila')::DATE;
  v_local_now TIMESTAMP := NOW() AT TIME ZONE 'Asia/Manila';
  v_minutes INTEGER := (EXTRACT(HOUR FROM v_local_now) * 60 + EXTRACT(MINUTE FROM v_local_now))::INTEGER;
  v_next_punch punch_type;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  SELECT *
    INTO v_profile
    FROM profiles
   WHERE id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = 'P0002';
  END IF;

  IF v_profile.role <> 'intern' THEN
    RAISE EXCEPTION 'Only interns can log attendance punches through this action' USING ERRCODE = '42501';
  END IF;

  IF p_punch_type IS NULL THEN
    RAISE EXCEPTION 'Punch type is required' USING ERRCODE = '22023';
  END IF;

  -- Flexible time period validation
  -- Morning punches: 7:00 AM - 12:00 PM
  -- Afternoon punches: 12:00 PM - 5:30 PM  
  -- End of day auto-submit cutoff: 7:30 PM
  CASE p_punch_type
    WHEN 'time_in_1' THEN
      IF v_minutes >= 12 * 60 THEN
        RAISE EXCEPTION 'Morning Time In cutoff has passed (noon)' USING ERRCODE = '22023';
      END IF;
    WHEN 'time_out_1' THEN
      IF v_minutes >= 12 * 60 THEN
        RAISE EXCEPTION 'Lunch Time Out cutoff has passed (noon)' USING ERRCODE = '22023';
      END IF;
    WHEN 'time_in_2' THEN
      IF v_minutes >= 17.5 * 60 THEN
        RAISE EXCEPTION 'Afternoon Time In cutoff has passed (5:30 PM)' USING ERRCODE = '22023';
      END IF;
    WHEN 'time_out_2' THEN
      IF v_minutes >= 19.5 * 60 THEN
        RAISE EXCEPTION 'End of Day Time Out cutoff has passed (7:30 PM)' USING ERRCODE = '22023';
      END IF;
      -- Also check if afternoon window has closed (5:30 PM)
      IF v_minutes >= 17.5 * 60 THEN
        -- Allow but this should trigger half-day PM approval if morning is missed
        NULL;
      END IF;
  END CASE;

  SELECT *
    INTO v_record
    FROM attendance_records
   WHERE intern_id = v_user_id
     AND date = v_today
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Allow starting with either morning or afternoon punches (for PM half-day scenarios)
    IF p_punch_type = 'time_in_1' THEN
      INSERT INTO attendance_records (
        intern_id,
        date,
        time_in_1,
        ip_address_in_1,
        supervisor_id
      )
      VALUES (
        v_user_id,
        v_today,
        v_now,
        p_ip_address,
        v_profile.supervisor_id
      )
      RETURNING * INTO v_record;
    ELSIF p_punch_type = 'time_in_2' THEN
      -- PM half-day scenario: start with afternoon punch
      INSERT INTO attendance_records (
        intern_id,
        date,
        time_in_2,
        ip_address_in_2,
        supervisor_id
      )
      VALUES (
        v_user_id,
        v_today,
        v_now,
        p_ip_address,
        v_profile.supervisor_id
      )
      RETURNING * INTO v_record;
    ELSE
      RAISE EXCEPTION 'Must start with either Morning Time In or Afternoon Time In' USING ERRCODE = '23514';
    END IF;

    RETURN v_record;
  END IF;

  IF v_record.status <> 'pending' THEN
    RAISE EXCEPTION 'Attendance record is no longer editable' USING ERRCODE = '42501';
  END IF;

  IF p_ip_address IS NOT NULL THEN
    IF COALESCE(v_record.ip_address_in_1, v_record.ip_address_in_2) IS NOT NULL
       AND p_ip_address <> COALESCE(v_record.ip_address_in_1, v_record.ip_address_in_2) THEN
      RAISE EXCEPTION 'Your IP address has changed. All daily punches must come from the same network.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF p_punch_type = 'time_in_1' THEN
    IF v_record.time_in_1 IS NOT NULL THEN
      RAISE EXCEPTION 'Morning Time In has already been logged' USING ERRCODE = '23505';
    END IF;
    v_next_punch := 'time_in_1';
  ELSIF p_punch_type = 'time_out_1' THEN
    IF v_record.time_in_1 IS NULL OR v_record.time_out_1 IS NOT NULL THEN
      RAISE EXCEPTION 'Lunch Time Out is not available yet' USING ERRCODE = '23514';
    END IF;
    v_next_punch := 'time_out_1';
  ELSIF p_punch_type = 'time_in_2' THEN
    -- Allow PM half-day: either time_out_1 exists (normal flow) OR this is a PM half-day scenario
    IF (v_record.time_out_1 IS NULL AND v_record.time_in_1 IS NOT NULL) OR v_record.time_in_2 IS NOT NULL THEN
      RAISE EXCEPTION 'Afternoon Time In is not available yet' USING ERRCODE = '23514';
    END IF;
    v_next_punch := 'time_in_2';
  ELSIF p_punch_type = 'time_out_2' THEN
    IF v_record.time_in_2 IS NULL OR v_record.time_out_2 IS NOT NULL THEN
      RAISE EXCEPTION 'End of Day Time Out is not available yet' USING ERRCODE = '23514';
    END IF;
    v_next_punch := 'time_out_2';
  ELSE
    RAISE EXCEPTION 'Invalid punch type' USING ERRCODE = '22023';
  END IF;

  UPDATE attendance_records
     SET time_in_1 = CASE WHEN v_next_punch = 'time_in_1' THEN v_now ELSE time_in_1 END,
       time_out_1 = CASE WHEN v_next_punch = 'time_out_1' THEN v_now ELSE time_out_1 END,
       time_in_2 = CASE WHEN v_next_punch = 'time_in_2' THEN v_now ELSE time_in_2 END,
       time_out_2 = CASE WHEN v_next_punch = 'time_out_2' THEN v_now ELSE time_out_2 END,
         ip_address_in_1 = CASE WHEN v_next_punch = 'time_in_1' THEN p_ip_address ELSE ip_address_in_1 END,
         ip_address_out_1 = CASE WHEN v_next_punch = 'time_out_1' THEN p_ip_address ELSE ip_address_out_1 END,
         ip_address_in_2 = CASE WHEN v_next_punch = 'time_in_2' THEN p_ip_address ELSE ip_address_in_2 END,
         ip_address_out_2 = CASE WHEN v_next_punch = 'time_out_2' THEN p_ip_address ELSE ip_address_out_2 END,
         supervisor_id = COALESCE(supervisor_id, v_profile.supervisor_id)
   WHERE id = v_record.id
   RETURNING * INTO v_record;

  RETURN v_record;
END;
$$;

CREATE OR REPLACE FUNCTION record_audit_log(
  p_action VARCHAR,
  p_entity_type VARCHAR,
  p_entity_id UUID DEFAULT NULL,
  p_details JSONB DEFAULT NULL,
  p_ip_address INET DEFAULT NULL
)
RETURNS audit_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_log audit_logs%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '28000';
  END IF;

  INSERT INTO audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details,
    ip_address
  )
  VALUES (
    v_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_details,
    p_ip_address
  )
  RETURNING * INTO v_log;

  RETURN v_log;
END;
$$;

DROP POLICY IF EXISTS attendance_insert ON attendance_records;
CREATE POLICY attendance_insert ON attendance_records FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

DROP POLICY IF EXISTS attendance_update ON attendance_records;
CREATE POLICY attendance_update ON attendance_records FOR UPDATE
  USING (
    supervisor_id = auth.uid()
    OR is_department_supervisor(intern_id)
    OR get_user_role() = 'admin'
  );

DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT
  WITH CHECK (get_user_role() = 'admin');
