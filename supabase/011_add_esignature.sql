-- ============================================================
-- Migration: Add e-signature support
-- Adds signature_url column to profiles and creates signatures
-- storage bucket with RLS policies.
-- ============================================================

-- Add signature_url column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS signature_url TEXT;

-- ============================================================
-- STORAGE BUCKET for e-signatures
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT DO NOTHING;

CREATE POLICY signature_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signatures'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY signature_select ON storage.objects FOR SELECT
  USING (bucket_id = 'signatures');

CREATE POLICY signature_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'signatures'
    AND name LIKE auth.uid()::text || '.%'
  );

CREATE POLICY signature_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'signatures'
    AND name LIKE auth.uid()::text || '.%'
  );
