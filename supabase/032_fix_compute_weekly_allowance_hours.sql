-- ============================================================
-- Fix weekly allowance hour aggregation
-- ============================================================
--
-- Align weekly allowance computation with the DAR by deriving hours
-- directly from punch timestamps when available, instead of relying on
-- stored attendance total_hours values.

CREATE OR REPLACE FUNCTION compute_weekly_allowance(
  p_intern_id UUID,
  p_week_start DATE,
  p_week_end DATE,
  p_hourly_rate NUMERIC DEFAULT NULL
)
RETURNS TABLE(total_hours NUMERIC, hourly_rate NUMERIC, total_amount NUMERIC) AS $$
DECLARE
  v_hours NUMERIC(6,4);
  v_rate NUMERIC(10,2);
BEGIN
  SELECT COALESCE(SUM(record_hours), 0) INTO v_hours
  FROM (
    SELECT
      COALESCE(
        NULLIF(ar.total_hours, 0),
        (
          COALESCE(
            CASE
              WHEN ar.time_in_1 IS NOT NULL AND ar.time_out_1 IS NOT NULL THEN
                EXTRACT(EPOCH FROM (ar.time_out_1 - ar.time_in_1)) / 3600.0
              ELSE 0
            END,
            0
          )
          + COALESCE(
            CASE
              WHEN ar.time_in_2 IS NOT NULL AND ar.time_out_2 IS NOT NULL THEN
                EXTRACT(EPOCH FROM (ar.time_out_2 - ar.time_in_2)) / 3600.0
              ELSE 0
            END,
            0
          )
        )
      ) AS record_hours
    FROM attendance_records ar
    WHERE ar.intern_id = p_intern_id
      AND ar.date >= p_week_start
      AND ar.date <= p_week_end
      AND ar.status = 'approved'
  ) attendance_hours;

  IF p_hourly_rate IS NOT NULL THEN
    v_rate = p_hourly_rate;
  ELSE
    SELECT ac.hourly_rate INTO v_rate
    FROM allowance_config ac
    WHERE ac.effective_from <= p_week_end
      AND (ac.effective_to IS NULL OR ac.effective_to >= p_week_start)
    ORDER BY ac.effective_from DESC
    LIMIT 1;

    IF v_rate IS NULL THEN
      v_rate = 0;
    END IF;
  END IF;

  total_hours = ROUND(v_hours, 4);
  hourly_rate = v_rate;
  total_amount = ROUND(v_hours * v_rate, 2);

  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
