-- ============================================================
-- Migration: Department-Based Supervisor RLS
-- Allows supervisors to view and manage records for all interns
-- in their department, not just their directly assigned interns.
-- ============================================================

-- ============================================================
-- Helper function to check if current user is a supervisor in
-- the same department as a given intern
-- ============================================================
CREATE OR REPLACE FUNCTION is_department_supervisor(target_intern_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_user_role user_role;
  current_user_dept UUID;
  intern_dept UUID;
BEGIN
  -- Get current user's role and department
  SELECT role, department_id INTO current_user_role, current_user_dept
  FROM profiles WHERE id = auth.uid();

  -- Only supervisors can pass this check
  IF current_user_role != 'supervisor' THEN
    RETURN FALSE;
  END IF;

  -- If supervisor has no department, cannot match
  IF current_user_dept IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get the intern's department
  SELECT department_id INTO intern_dept
  FROM profiles WHERE id = target_intern_id;

  -- Return true if departments match
  RETURN intern_dept IS NOT NULL AND intern_dept = current_user_dept;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- ATTENDANCE RECORDS POLICIES
-- Updated to allow department supervisors to view/manage
-- ============================================================

DROP POLICY IF EXISTS attendance_select ON attendance_records;
CREATE POLICY attendance_select ON attendance_records FOR SELECT
  USING (
    intern_id = auth.uid()                    -- Intern sees own records
    OR supervisor_id = auth.uid()             -- Assigned supervisor sees records
    OR is_department_supervisor(intern_id)    -- Any supervisor in same dept sees records
    OR get_user_role() = 'admin'              -- Admin sees all
  );

DROP POLICY IF EXISTS attendance_update ON attendance_records;
CREATE POLICY attendance_update ON attendance_records FOR UPDATE
  USING (
    (intern_id = auth.uid() AND status = 'pending')  -- Intern updates own pending
    OR supervisor_id = auth.uid()                     -- Assigned supervisor can update
    OR is_department_supervisor(intern_id)            -- Dept supervisors can update
    OR get_user_role() = 'admin'                      -- Admin can update
  );

-- ============================================================
-- NARRATIVES POLICIES
-- Updated to allow department supervisors to view/manage
-- ============================================================

DROP POLICY IF EXISTS narratives_select ON narratives;
CREATE POLICY narratives_select ON narratives FOR SELECT
  USING (
    intern_id = auth.uid()                    -- Intern sees own narratives
    OR supervisor_id = auth.uid()             -- Assigned supervisor sees narratives
    OR is_department_supervisor(intern_id)    -- Any supervisor in same dept sees narratives
    OR get_user_role() = 'admin'              -- Admin sees all
  );

DROP POLICY IF EXISTS narratives_update ON narratives;
CREATE POLICY narratives_update ON narratives FOR UPDATE
  USING (
    (intern_id = auth.uid() AND status IN ('pending', 'rejected'))  -- Intern updates own pending/rejected
    OR supervisor_id = auth.uid()                                    -- Assigned supervisor can update
    OR is_department_supervisor(intern_id)                           -- Dept supervisors can update
    OR get_user_role() = 'admin'                                     -- Admin can update
  );

-- ============================================================
-- APPROVALS POLICIES
-- Updated to allow department supervisors to view/manage
-- ============================================================

DROP POLICY IF EXISTS approvals_select ON approvals;
CREATE POLICY approvals_select ON approvals FOR SELECT
  USING (
    intern_id = auth.uid()                    -- Intern sees own approvals
    OR supervisor_id = auth.uid()             -- Assigned supervisor sees approvals
    OR is_department_supervisor(intern_id)    -- Any supervisor in same dept sees approvals
    OR get_user_role() = 'admin'              -- Admin sees all
  );

DROP POLICY IF EXISTS approvals_update ON approvals;
CREATE POLICY approvals_update ON approvals FOR UPDATE
  USING (
    supervisor_id = auth.uid()                -- Assigned supervisor can update
    OR is_department_supervisor(intern_id)    -- Dept supervisors can update
    OR get_user_role() = 'admin'              -- Admin can update
  );

-- ============================================================
-- ATTENDANCE CORRECTIONS POLICIES
-- Updated to allow department supervisors to view
-- ============================================================

DROP POLICY IF EXISTS corrections_select ON attendance_corrections;
CREATE POLICY corrections_select ON attendance_corrections FOR SELECT
  USING (
    intern_id = auth.uid()                    -- Intern sees own corrections
    OR reviewed_by = auth.uid()               -- Reviewer sees corrections they reviewed
    OR is_department_supervisor(intern_id)    -- Dept supervisors can see
    OR get_user_role() = 'admin'              -- Admin sees all
  );

-- ============================================================
-- TASKS POLICIES
-- Updated to allow department supervisors to view all tasks
-- assigned to interns in their department
-- ============================================================

DROP POLICY IF EXISTS tasks_select ON tasks;
CREATE POLICY tasks_select ON tasks FOR SELECT
  USING (
    assigned_to = auth.uid()                  -- Assigned intern sees task
    OR created_by = auth.uid()                -- Creator sees task
    OR is_department_supervisor(assigned_to)  -- Dept supervisors see tasks assigned to dept interns
    OR get_user_role() = 'admin'              -- Admin sees all
  );

DROP POLICY IF EXISTS tasks_update ON tasks;
CREATE POLICY tasks_update ON tasks FOR UPDATE
  USING (
    created_by = auth.uid()                   -- Creator can update
    OR assigned_to = auth.uid()               -- Assigned intern can update
    OR is_department_supervisor(assigned_to)  -- Dept supervisors can update
    OR get_user_role() = 'admin'              -- Admin can update
  );

-- ============================================================
-- Add comment explaining the function
-- ============================================================
COMMENT ON FUNCTION is_department_supervisor(UUID) IS
'Returns TRUE if the current authenticated user is a supervisor in the same department as the specified intern. Used in RLS policies to enable multi-supervisor workflows where any supervisor in a department can manage all interns in that department.';
