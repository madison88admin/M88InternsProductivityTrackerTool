-- Migration: Fix Hours Calculation Precision
-- Issue: NUMERIC(5,2) only stores 2 decimal places, causing rounding accumulation errors
-- Solution: Increase precision to NUMERIC(6,4) to store more accurate fractional hours

-- ============================================================
-- Change total_hours column precision in attendance_records
-- ============================================================

ALTER TABLE attendance_records
ALTER COLUMN total_hours TYPE NUMERIC(6,4);

-- ============================================================
-- Change total_hours column precision in allowance_periods
-- ============================================================

ALTER TABLE allowance_periods
ALTER COLUMN total_hours TYPE NUMERIC(6,4);

-- ============================================================
-- Update calculate_attendance_hours function (no rounding)
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_attendance_hours()
RETURNS TRIGGER AS $$
BEGIN
  NEW.total_hours = 0;

  -- Calculate morning session hours (full precision)
  IF NEW.time_in_1 IS NOT NULL AND NEW.time_out_1 IS NOT NULL THEN
    NEW.total_hours = NEW.total_hours + EXTRACT(EPOCH FROM (NEW.time_out_1 - NEW.time_in_1)) / 3600.0;
  END IF;

  -- Calculate afternoon session hours (full precision)
  IF NEW.time_in_2 IS NOT NULL AND NEW.time_out_2 IS NOT NULL THEN
    NEW.total_hours = NEW.total_hours + EXTRACT(EPOCH FROM (NEW.time_out_2 - NEW.time_in_2)) / 3600.0;
  END IF;

  -- Store with full precision (NUMERIC(6,4) = up to 99.9999 hours)
  -- No rounding here - precision preserved for accurate weekly totals

  -- Check if late (first login at or after 9 AM)
  IF NEW.time_in_1 IS NOT NULL THEN
    NEW.is_late = EXTRACT(HOUR FROM NEW.time_in_1 AT TIME ZONE 'Asia/Manila') >= 9;
  END IF;

  -- Check if outside allowed hours
  IF NEW.time_in_1 IS NOT NULL THEN
    NEW.is_outside_hours = (
      EXTRACT(HOUR FROM NEW.time_in_1 AT TIME ZONE 'Asia/Manila') < 7 OR
      (NEW.time_out_2 IS NOT NULL AND EXTRACT(HOUR FROM NEW.time_out_2 AT TIME ZONE 'Asia/Manila') >= 18)
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- Recalculate all existing attendance records with full precision
-- ============================================================

-- Force recalculation of all records with new precision
UPDATE attendance_records
SET updated_at = NOW()
WHERE id IS NOT NULL;

-- Note: The trigger will automatically recalculate total_hours with 4 decimal places
