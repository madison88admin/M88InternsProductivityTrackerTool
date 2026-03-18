-- Migration: Track who reviewed each approval record for audit/backtracking

ALTER TABLE approvals
ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_approvals_reviewed_by ON approvals(reviewed_by);
