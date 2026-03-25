-- ============================================================
-- Migration 028b: Narrative Draft Index and Admin Setting
-- ============================================================
-- IMPORTANT: Run this AFTER 028_narrative_draft_status.sql completes successfully
-- This creates the index and system setting that use the 'draft' enum value
-- ============================================================

-- STEP 2: Create index for faster draft queries
-- This index helps when filtering narratives by status='draft' for a specific intern
CREATE INDEX IF NOT EXISTS idx_narratives_status_intern_draft
  ON narratives(status, intern_id)
  WHERE status = 'draft';

-- STEP 3: Insert system setting for admin past-date override
INSERT INTO system_settings (key, value) VALUES
  ('allow_past_date_narratives', '{"enabled": false}')
ON CONFLICT (key) DO NOTHING;