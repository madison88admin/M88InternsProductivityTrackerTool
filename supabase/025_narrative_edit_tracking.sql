-- Migration: Add edit tracking to narratives
-- This allows interns to edit pending narratives with a visible indicator

ALTER TABLE narratives
ADD COLUMN edited_at TIMESTAMPTZ;

COMMENT ON COLUMN narratives.edited_at IS 'Timestamp when the narrative was last edited after initial submission. NULL if never edited.';
