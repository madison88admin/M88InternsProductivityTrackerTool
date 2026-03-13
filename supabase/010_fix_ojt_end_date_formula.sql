-- Migration: Fix OJT end date formula
-- Uses weekday-aware calculation based on average daily hours rendered.
-- Defaults to 8 hrs/day if no attendance history. Skips Sat & Sun.

CREATE OR REPLACE FUNCTION update_intern_hours()
RETURNS TRIGGER AS $$
DECLARE
  v_hours_required NUMERIC;
  v_hours_rendered NUMERIC;
  v_distinct_days  INTEGER;
  v_remaining      NUMERIC;
  v_avg_daily      NUMERIC;
  v_weekdays_needed INTEGER;
  v_current_date   DATE;
  v_added          INTEGER;
BEGIN
  IF (NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved'))
     OR (NEW.status = 'approved' AND OLD.status = 'approved' AND NEW.total_hours IS DISTINCT FROM OLD.total_hours) THEN
    -- Recompute total rendered hours
    UPDATE profiles
    SET hours_rendered = (
      SELECT COALESCE(SUM(total_hours), 0)
      FROM attendance_records
      WHERE intern_id = NEW.intern_id AND status = 'approved'
    )
    WHERE id = NEW.intern_id;

    -- Fetch updated values
    SELECT hours_required, hours_rendered
      INTO v_hours_required, v_hours_rendered
      FROM profiles
     WHERE id = NEW.intern_id;

    IF v_hours_required > 0 THEN
      v_remaining := v_hours_required - v_hours_rendered;

      IF v_remaining <= 0 THEN
        -- OJT already completed
        UPDATE profiles SET ojt_end_date = CURRENT_DATE WHERE id = NEW.intern_id;
      ELSE
        -- Count distinct attendance days
        SELECT COUNT(DISTINCT date) INTO v_distinct_days
          FROM attendance_records
         WHERE intern_id = NEW.intern_id AND status = 'approved';

        -- Average daily hours (default 8 if no history)
        IF v_distinct_days > 0 THEN
          v_avg_daily := GREATEST(v_hours_rendered / v_distinct_days, 0.1);
        ELSE
          v_avg_daily := 8;
        END IF;

        v_weekdays_needed := CEIL(v_remaining / v_avg_daily);

        -- Walk forward from today, skipping weekends (Sun=0, Sat=6)
        v_current_date := CURRENT_DATE;
        v_added := 0;
        WHILE v_added < v_weekdays_needed LOOP
          v_current_date := v_current_date + 1;
          IF EXTRACT(DOW FROM v_current_date) NOT IN (0, 6) THEN
            v_added := v_added + 1;
          END IF;
        END LOOP;

        UPDATE profiles SET ojt_end_date = v_current_date WHERE id = NEW.intern_id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
