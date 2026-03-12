-- ============================================================
-- Migration: Fix handle_new_user trigger
-- Resolves 500 Internal Server Error on auth/v1/signup caused
-- by the trigger failing when:
--   - NEW.email is NULL (some GoTrue versions store it differently)
--   - Role cast throws on unexpected values
--   - Duplicate profile row (retry / partial previous attempt)
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    -- In some GoTrue versions the email field is populated later;
    -- fall back to the metadata copy or a safe empty string.
    COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', ''),

    -- Use trimmed full_name from metadata, fall back to email prefix.
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
      COALESCE(NEW.email, NEW.raw_user_meta_data->>'email', 'Unknown')
    ),

    -- Validate the role value before casting to avoid enum-cast exceptions.
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('admin', 'supervisor', 'intern')
        THEN (NEW.raw_user_meta_data->>'role')::user_role
      ELSE 'intern'::user_role
    END
  )
  -- Silently skip if the profile row already exists (e.g. from a previous
  -- partial attempt), so the auth transaction is never rolled back.
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;  -- recommended by Supabase security advisory
