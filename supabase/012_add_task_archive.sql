-- Add is_archived flag to tasks table
-- Archived tasks are hidden from the main task list and accessible via the archive modal.

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_tasks_is_archived ON tasks(is_archived);
