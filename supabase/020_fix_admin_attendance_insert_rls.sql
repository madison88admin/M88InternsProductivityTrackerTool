-- Migration: Allow admins to insert attendance records for interns
-- Needed for Intern Directory "Log Past Hours" and manual admin attendance entry

DROP POLICY IF EXISTS attendance_insert ON attendance_records;

CREATE POLICY attendance_insert ON attendance_records FOR INSERT
  WITH CHECK (
    (intern_id = auth.uid() AND get_user_role() = 'intern')
    OR get_user_role() = 'admin'
  );
