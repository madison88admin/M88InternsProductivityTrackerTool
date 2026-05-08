-- ============================================================
-- Recompute affected allowance week
-- Week: 2026-05-01 to 2026-05-07
-- ============================================================
-- This fixes allowance_periods that were saved with hours that do not
-- match the intern's actual rendered hours for the affected week.

DO $$
DECLARE
  v_week_start DATE := DATE '2026-05-01';
  v_week_end DATE := DATE '2026-05-07';
  v_mode TEXT;
  v_base_rate NUMERIC(10,2);
  v_intern_rate NUMERIC;
  v_total_hours NUMERIC(6,4);
  v_total_amount NUMERIC(12,2);
  v_existing_id UUID;
  v_intern RECORD;
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
    SELECT id
      INTO v_existing_id
    FROM allowance_periods
    WHERE intern_id = v_intern.id
      AND week_start = v_week_start
    LIMIT 1;

    SELECT COALESCE(SUM(record_hours), 0)
      INTO v_total_hours
    FROM (
      SELECT
        COALESCE(
          NULLIF(ar.total_hours, 0),
          (
            COALESCE(CASE WHEN ar.time_in_1 IS NOT NULL AND ar.time_out_1 IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ar.time_out_1 - ar.time_in_1)) / 3600.0 ELSE 0 END, 0)
            + COALESCE(CASE WHEN ar.time_in_2 IS NOT NULL AND ar.time_out_2 IS NOT NULL
              THEN EXTRACT(EPOCH FROM (ar.time_out_2 - ar.time_in_2)) / 3600.0 ELSE 0 END, 0)
          )
        ) AS record_hours
      FROM attendance_records ar
      WHERE ar.intern_id = v_intern.id
        AND ar.status = 'approved'
        AND ar.date >= v_week_start
        AND ar.date <= v_week_end
    ) weekly_hours;

    IF v_total_hours <= 0 THEN
      CONTINUE;
    END IF;

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

    IF v_existing_id IS NULL THEN
      INSERT INTO allowance_periods (
        intern_id,
        week_start,
        week_end,
        total_hours,
        hourly_rate,
        total_amount,
        status,
        reviewed_by,
        reviewed_at,
        review_notes
      ) VALUES (
        v_intern.id,
        v_week_start,
        v_week_end,
        ROUND(v_total_hours, 4),
        v_intern_rate,
        v_total_amount,
        'computed',
        NULL,
        NULL,
        NULL
      );
    ELSE
      UPDATE allowance_periods
      SET total_hours = ROUND(v_total_hours, 4),
          hourly_rate = v_intern_rate,
          total_amount = v_total_amount,
          status = CASE WHEN status = 'approved' THEN 'approved'::allowance_period_status ELSE 'computed'::allowance_period_status END,
          reviewed_at = CASE WHEN status = 'approved' THEN reviewed_at ELSE NULL END,
          reviewed_by = CASE WHEN status = 'approved' THEN reviewed_by ELSE NULL END,
          review_notes = CASE WHEN status = 'approved' THEN review_notes ELSE NULL END
      WHERE id = v_existing_id;
    END IF;
  END LOOP;
END $$;
