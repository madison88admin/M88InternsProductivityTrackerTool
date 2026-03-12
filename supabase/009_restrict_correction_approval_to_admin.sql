-- Restrict approvals UPDATE for attendance_correction type to admins only.
-- Supervisors can view correction approvals but cannot approve or reject them.

DROP POLICY IF EXISTS approvals_update ON approvals;

CREATE POLICY approvals_update ON approvals FOR UPDATE
  USING (
    -- Admins can update any approval
    get_user_role() = 'admin'
    OR (
      -- Supervisors can only update non-correction approval types they own
      get_user_role() = 'supervisor'
      AND supervisor_id = auth.uid()
      AND type <> 'attendance_correction'
    )
  );
