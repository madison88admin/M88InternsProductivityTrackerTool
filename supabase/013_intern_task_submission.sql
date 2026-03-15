-- ============================================================
-- 013: Intern Self-Task Submission Feature
-- ============================================================
-- Adds support for interns to submit their own tasks for
-- supervisor review and approval.
-- ============================================================

-- 1. Add new columns to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_self_submitted BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS submission_status TEXT CHECK (submission_status IN ('pending', 'approved', 'rejected'));

-- 2. Add task_submission to the approval_type enum
ALTER TYPE approval_type ADD VALUE IF NOT EXISTS 'task_submission';

-- 3. Update tasks INSERT RLS policy to allow intern self-submission
DROP POLICY IF EXISTS tasks_insert ON tasks;
CREATE POLICY tasks_insert ON tasks FOR INSERT
  WITH CHECK (
    get_user_role() IN ('admin', 'supervisor')
    OR (
      get_user_role() = 'intern'
      AND is_self_submitted = true
      AND assigned_to = auth.uid()
      AND created_by = auth.uid()
    )
  );

-- 4. New system_settings key 'intern_task_submission' is handled via
--    upsert in the app (system-settings.js), no schema change needed.
