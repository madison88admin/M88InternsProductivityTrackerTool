-- ============================================================
-- Migration: Secure avatar and signature storage buckets
-- Makes buckets private and enforces authenticated + owner write access.
-- ============================================================

-- Ensure buckets are private
UPDATE storage.buckets
SET public = false
WHERE id IN ('avatars', 'signatures');

-- Recreate avatar policies
DROP POLICY IF EXISTS avatar_upload ON storage.objects;
DROP POLICY IF EXISTS avatar_select ON storage.objects;
DROP POLICY IF EXISTS avatar_update ON storage.objects;
DROP POLICY IF EXISTS avatar_delete ON storage.objects;

CREATE POLICY avatar_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

CREATE POLICY avatar_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY avatar_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

CREATE POLICY avatar_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

-- Recreate signature policies
DROP POLICY IF EXISTS signature_upload ON storage.objects;
DROP POLICY IF EXISTS signature_select ON storage.objects;
DROP POLICY IF EXISTS signature_update ON storage.objects;
DROP POLICY IF EXISTS signature_delete ON storage.objects;

CREATE POLICY signature_upload ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'signatures'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

CREATE POLICY signature_select ON storage.objects FOR SELECT
  USING (
    bucket_id = 'signatures'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY signature_update ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'signatures'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );

CREATE POLICY signature_delete ON storage.objects FOR DELETE
  USING (
    bucket_id = 'signatures'
    AND auth.role() = 'authenticated'
    AND split_part(name, '.', 1) = auth.uid()::text
  );
