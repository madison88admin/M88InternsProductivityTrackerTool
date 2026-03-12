-- ============================================================
-- Migration: Add session-based narratives
-- ============================================================
-- Narratives are now split into morning/afternoon sessions,
-- with auto-calculated hours from attendance records.
-- ============================================================

-- Add narrative session enum
CREATE TYPE narrative_session AS ENUM ('morning', 'afternoon');

-- Add new columns to narratives
ALTER TABLE narratives
  ADD COLUMN session narrative_session,
  ADD COLUMN hours NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN is_late_submission BOOLEAN DEFAULT false;

-- Backfill existing narratives as morning session
UPDATE narratives SET session = 'morning' WHERE session IS NULL;

-- Make session NOT NULL after backfill
ALTER TABLE narratives ALTER COLUMN session SET NOT NULL;

-- Replace old unique constraint with new one (intern, date, session)
-- Drop old index if exists, add new unique constraint
ALTER TABLE narratives
  ADD CONSTRAINT narratives_intern_date_session_unique UNIQUE (intern_id, date, session);

-- Index for faster lookups
CREATE INDEX idx_narratives_session ON narratives(session);
