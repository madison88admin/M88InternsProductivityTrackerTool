-- ============================================================
-- Migration 028: Narrative Draft Status and Admin Override Setting
-- ============================================================
-- IMPORTANT: Run these statements one at a time in Supabase SQL Editor
-- PostgreSQL requires enum values to be committed before use in indexes
-- ============================================================

-- STEP 1: Add 'draft' status to approval_status enum
-- Run this first and wait for it to complete
ALTER TYPE approval_status ADD VALUE IF NOT EXISTS 'draft';
