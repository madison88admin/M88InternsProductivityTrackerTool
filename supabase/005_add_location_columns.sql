-- ============================================================
-- Migration: Add timezone and allowed_ips columns to locations
-- ============================================================

ALTER TABLE locations
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) NOT NULL DEFAULT 'Asia/Manila',
  ADD COLUMN IF NOT EXISTS allowed_ips TEXT[] NOT NULL DEFAULT '{}';
