-- Migration: 023_reset_tokens.sql
-- Creates a table to store short-lived, one-time-use password reset tokens.
-- Access is intentionally restricted to service-role only (no RLS policies added).

CREATE TABLE IF NOT EXISTS reset_tokens (
  token       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL,
  email       TEXT        NOT NULL,
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reset_tokens ENABLE ROW LEVEL SECURITY;
-- No RLS policies: only the service-role key (Edge Functions) can read/write this table.
