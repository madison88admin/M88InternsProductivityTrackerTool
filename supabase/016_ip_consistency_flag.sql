-- Migration: 016_ip_consistency_flag.sql
-- Adds ip_consistent boolean column to attendance_records.
--
--   TRUE  — all punches for the day originate from the same IP address (policy-compliant)
--   FALSE — at least one punch was made from a different IP address (policy violation)
--   NULL  — no punches with a recorded IP have been made yet

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS ip_consistent BOOLEAN;

-- Function: compute ip_consistent from the four ip_address_* columns
CREATE OR REPLACE FUNCTION compute_ip_consistent()
RETURNS TRIGGER AS $$
DECLARE
  ips TEXT[] := '{}';
  unique_ips TEXT[];
BEGIN
  IF NEW.ip_address_in_1  IS NOT NULL THEN ips := array_append(ips, NEW.ip_address_in_1::TEXT);  END IF;
  IF NEW.ip_address_out_1 IS NOT NULL THEN ips := array_append(ips, NEW.ip_address_out_1::TEXT); END IF;
  IF NEW.ip_address_in_2  IS NOT NULL THEN ips := array_append(ips, NEW.ip_address_in_2::TEXT);  END IF;
  IF NEW.ip_address_out_2 IS NOT NULL THEN ips := array_append(ips, NEW.ip_address_out_2::TEXT); END IF;

  -- No IPs recorded yet → undetermined
  IF array_length(ips, 1) IS NULL THEN
    NEW.ip_consistent := NULL;
    RETURN NEW;
  END IF;

  -- Consistent if every logged IP is the same
  SELECT ARRAY(SELECT DISTINCT unnest(ips)) INTO unique_ips;
  NEW.ip_consistent := (array_length(unique_ips, 1) = 1);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach trigger so ip_consistent is always recomputed on insert/update
DROP TRIGGER IF EXISTS attendance_ip_consistency ON attendance_records;
CREATE TRIGGER attendance_ip_consistency
  BEFORE INSERT OR UPDATE ON attendance_records
  FOR EACH ROW EXECUTE FUNCTION compute_ip_consistent();

-- Backfill: recompute ip_consistent for all existing records
UPDATE attendance_records SET updated_at = NOW();
