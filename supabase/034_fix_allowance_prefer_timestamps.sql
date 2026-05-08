-- ============================================================
-- Fix: Align allowance hour computation with DAR
-- ============================================================
-- The DAR derives hours from punch timestamps first, falling back
-- to stored total_hours only when timestamps are absent.
-- The compute_weekly_allowance function was doing the opposite
-- (preferring stored total_hours), causing the allowance table to
-- show different hours than the DAR.
--
-- This migration:
--   1. Recreates compute_weekly_allowance with timestamp-first logic.
--   2. Recomputes all allowance_periods for the affected week
--      (2026-05-01 – 2026-05-07), including already-approved rows.

-- ============================================================
-- 1. Fix the RPC function
-- ============================================================
CREATE OR REPLACE FUNCTION compute_weekly_allowance(
  p_intern_id UUID,
  p_week_start DATE,
  p_week_end DATE,
  p_hourly_rate NUMERIC DEFAULT NULL
)
RETURNS TABLE(total_hours NUMERIC, hourly_rate NUMERIC, total_amount NUMERIC) AS $$
DECLARE
  v_hours NUMERIC(6,4);
  v_rate  NUMERIC(10,2);
BEGIN
  -- Prefer derived hours from timestamps; fall back to stored total_hours
  -- only when both punch pairs are absent (matches DAR logic).
  SELECT COALESCE(SUM(record_hours), 0) INTO v_hours
  FROM (
    SELECT
      CASE
        WHEN (ar.time_in_1 IS NOT NULL AND ar.time_out_1 IS NOT NULL)
          OR (ar.time_in_2 IS NOT NULL AND ar.time_out_2 IS NOT NULL)
        THEN
          COALESCE(
            CASE WHEN ar.time_in_1 IS NOT NULL AND ar.time_out_1 IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ar.time_out_1 - ar.time_in_1)) / 3600.0
              ELSE 0 END,
            0
          )
          + COALESCE(
            CASE WHEN ar.time_in_2 IS NOT NULL AND ar.time_out_2 IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ar.time_out_2 - ar.time_in_2)) / 3600.0
              ELSE 0 END,
            0
          )
        ELSE
          COALESCE(ar.total_hours, 0)
      END AS record_hours
    FROM attendance_records ar
    WHERE ar.intern_id = p_intern_id
      AND ar.date >= p_week_start
      AND ar.date <= p_week_end
      AND ar.status = 'approved'
  ) attendance_hours;

  IF p_hourly_rate IS NOT NULL THEN
    v_rate := p_hourly_rate;
  ELSE
    SELECT ac.hourly_rate INTO v_rate
    FROM allowance_config ac
    WHERE ac.effective_from <= p_week_end
      AND (ac.effective_to IS NULL OR ac.effective_to >= p_week_start)
    ORDER BY ac.effective_from DESC
    LIMIT 1;

    IF v_rate IS NULL THEN
      v_rate := 0;
    END IF;
  END IF;

  total_hours  := ROUND(v_hours, 4);
  hourly_rate  := v_rate;
  total_amount := ROUND(v_hours * v_rate, 2);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. Recompute allowance_periods for week 2026-05-01 – 2026-05-07
--    using the corrected timestamp-first logic.
--    Approved rows are updated in-place (status stays 'approved').
-- ============================================================
DO $$
DECLARE
  v_week_start  DATE := DATE '2026-05-01';
  v_week_end    DATE := DATE '2026-05-07';
  v_mode        TEXT;
  v_base_rate   NUMERIC(10,2);
  v_intern_rate NUMERIC;
  v_total_hours NUMERIC(6,4);
  v_total_amount NUMERIC(12,2);
  v_existing_id UUID;
  v_intern      RECORD;
BEGIN
  SELECT value->>'mode'
    INTO v_mode
  FROM system_settings
  WHERE key = 'allowance_rate_mode';

  SELECT hourly_rate
    INTO v_base_rate
  FROM allowance_config
  ORDER BY effective_from DESC
  LIMIT 1;

  IF v_base_rate IS NULL THEN
    v_base_rate := 0;
  END IF;

  FOR v_intern IN
    SELECT DISTINCT p.id
    FROM profiles p
    JOIN attendance_records ar ON ar.intern_id = p.id
    WHERE p.role = 'intern'
      AND p.is_active = true
      AND ar.status = 'approved'
      AND ar.date >= v_week_start
      AND ar.date <= v_week_end
  LOOP
    -- Timestamp-first aggregation (mirrors DAR logic)
    SELECT COALESCE(SUM(record_hours), 0)
      INTO v_total_hours
    FROM (
      SELECT
        CASE
          WHEN (ar.time_in_1 IS NOT NULL AND ar.time_out_1 IS NOT NULL)
            OR (ar.time_in_2 IS NOT NULL AND ar.time_out_2 IS NOT NULL)
          THEN
            COALESCE(
              CASE WHEN ar.time_in_1 IS NOT NULL AND ar.time_out_1 IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ar.time_out_1 - ar.time_in_1)) / 3600.0
                ELSE 0 END,
              0
            )
            + COALESCE(
              CASE WHEN ar.time_in_2 IS NOT NULL AND ar.time_out_2 IS NOT NULL
                THEN EXTRACT(EPOCH FROM (ar.time_out_2 - ar.time_in_2)) / 3600.0
                ELSE 0 END,
              0
            )
          ELSE
            COALESCE(ar.total_hours, 0)
        END AS record_hours
      FROM attendance_records ar
      WHERE ar.intern_id = v_intern.id
        AND ar.status = 'approved'
        AND ar.date >= v_week_start
        AND ar.date <= v_week_end
    ) weekly_hours;

    IF v_total_hours <= 0 THEN
      CONTINUE;
    END IF;

    -- Resolve rate
    IF v_mode = 'individual' THEN
      SELECT NULLIF((setting.value ->> v_intern.id::text), '')::numeric
        INTO v_intern_rate
      FROM system_settings AS setting
      WHERE setting.key = 'intern_hourly_rates'
      LIMIT 1;

      IF v_intern_rate IS NULL THEN
        v_intern_rate := v_base_rate;
      END IF;
    ELSE
      v_intern_rate := v_base_rate;
    END IF;

    v_total_amount := ROUND(v_total_hours * v_intern_rate, 2);

    SELECT id INTO v_existing_id
    FROM allowance_periods
    WHERE intern_id = v_intern.id
      AND week_start = v_week_start
    LIMIT 1;

    IF v_existing_id IS NULL THEN
      INSERT INTO allowance_periods (
        intern_id, week_start, week_end,
        total_hours, hourly_rate, total_amount,
        status, reviewed_by, reviewed_at, review_notes
      ) VALUES (
        v_intern.id, v_week_start, v_week_end,
        ROUND(v_total_hours, 4), v_intern_rate, v_total_amount,
        'computed', NULL, NULL, NULL
      );
    ELSE
      -- Update hours/amount; preserve approval metadata if already approved
      UPDATE allowance_periods
      SET total_hours  = ROUND(v_total_hours, 4),
          hourly_rate  = v_intern_rate,
          total_amount = v_total_amount
      WHERE id = v_existing_id;
    END IF;
  END LOOP;
END $$;
