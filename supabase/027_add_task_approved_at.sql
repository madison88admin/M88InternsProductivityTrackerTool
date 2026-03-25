-- Migration: Add approved_at column to tasks table
-- This column tracks when a task was approved as completed
-- Enables 48-hour window for narrative submission on completed tasks

-- Add approved_at column to tasks table
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_tasks_approved_at ON tasks(approved_at);

-- Create function to set approved_at when task status becomes 'completed'
CREATE OR REPLACE FUNCTION set_task_approved_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If status is changing to 'completed' and approved_at is not already set
  IF NEW.status = 'completed' AND OLD.status != 'completed' AND NEW.approved_at IS NULL THEN
    NEW.approved_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically set approved_at
DROP TRIGGER IF EXISTS trigger_set_task_approved_at ON tasks;
CREATE TRIGGER trigger_set_task_approved_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION set_task_approved_at();

-- Backfill approved_at for existing completed tasks using approvals table
-- Set approved_at to the reviewed_at from the most recent approved approval
UPDATE tasks t
SET approved_at = (
  SELECT a.reviewed_at
  FROM approvals a
  WHERE a.entity_id = t.id
    AND a.type = 'task_status'
    AND a.status = 'approved'
  ORDER BY a.reviewed_at DESC
  LIMIT 1
)
WHERE t.status = 'completed'
  AND t.approved_at IS NULL;

-- For completed tasks without approval records, use updated_at as fallback
UPDATE tasks
SET approved_at = updated_at
WHERE status = 'completed'
  AND approved_at IS NULL;
