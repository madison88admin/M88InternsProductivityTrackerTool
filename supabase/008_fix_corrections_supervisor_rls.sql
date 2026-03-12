-- Fix attendance_corrections SELECT policy to allow supervisors
-- to read corrections for interns assigned to them.
-- Previously, supervisors were blocked (reviewed_by is NULL on pending records),
-- causing a 406 Not Acceptable when loading correction details in the Approvals page.

DROP POLICY IF EXISTS corrections_select ON attendance_corrections;

CREATE POLICY corrections_select ON attendance_corrections FOR SELECT
  USING (
    intern_id = auth.uid()
    OR reviewed_by = auth.uid()
    OR get_user_role() = 'admin'
    OR (
      get_user_role() = 'supervisor'
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = attendance_corrections.intern_id
          AND profiles.supervisor_id = auth.uid()
      )
    )
  );
