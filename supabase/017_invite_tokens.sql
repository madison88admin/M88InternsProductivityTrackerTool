-- Migration: 017_invite_tokens.sql
-- Creates a table to store short-lived, one-time-use invite tokens.
-- Access is intentionally restricted to service-role only (no RLS policies added).

CREATE TABLE IF NOT EXISTS invite_tokens (
  token       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  full_name   TEXT,
  email       TEXT        NOT NULL,
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE invite_tokens ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only the service-role key (Edge Functions) can read/write this table.
