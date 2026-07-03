-- Ensure OJT completion notifications respect the admin action-alert preference.
CREATE OR REPLACE FUNCTION update_intern_hours()
RETURNS TRIGGER AS $$
DECLARE
  v_hours_required      NUMERIC;
  v_prev_hours_rendered NUMERIC;
  v_hours_rendered_new  NUMERIC;
  v_notified            BOOLEAN;
  v_intern_name         VARCHAR(255);
  v_distinct_days       INTEGER;
  v_remaining           NUMERIC;
  v_avg_daily           NUMERIC;
  v_weekdays_needed     INTEGER;
  v_current_date        DATE;
  v_added               INTEGER;
  admin_rec             RECORD;
BEGIN
  IF NOT (
    (NEW.status = 'approved' AND (OLD IS NULL OR OLD.status != 'approved'))
    OR (NEW.status = 'approved' AND OLD.status = 'approved'
        AND NEW.total_hours IS DISTINCT FROM OLD.total_hours)
  ) THEN
    RETURN NEW;
  END IF;

  SELECT hours_required, hours_rendered, ojt_completion_notified, full_name
    INTO v_hours_required, v_prev_hours_rendered, v_notified, v_intern_name
    FROM profiles
   WHERE id = NEW.intern_id;

  SELECT COALESCE(SUM(total_hours), 0)
    INTO v_hours_rendered_new
    FROM attendance_records
   WHERE intern_id = NEW.intern_id AND status = 'approved';

  IF v_hours_required > 0 THEN
    v_remaining := v_hours_required - v_hours_rendered_new;

    IF v_remaining <= 0 THEN
      UPDATE profiles
         SET hours_rendered = v_hours_rendered_new,
             ojt_end_date   = CURRENT_DATE
       WHERE id = NEW.intern_id;
    ELSE
      SELECT COUNT(DISTINCT date) INTO v_distinct_days
        FROM attendance_records
       WHERE intern_id = NEW.intern_id AND status = 'approved';

      v_avg_daily := CASE WHEN v_distinct_days > 0
                     THEN GREATEST(v_hours_rendered_new / v_distinct_days, 0.1)
                     ELSE 8 END;

      v_weekdays_needed := CEIL(v_remaining / v_avg_daily);

      v_current_date := CURRENT_DATE;
      v_added := 0;
      WHILE v_added < v_weekdays_needed LOOP
        v_current_date := v_current_date + 1;
        IF EXTRACT(DOW FROM v_current_date) NOT IN (0, 6) THEN
          v_added := v_added + 1;
        END IF;
      END LOOP;

      UPDATE profiles
         SET hours_rendered = v_hours_rendered_new,
             ojt_end_date   = v_current_date
       WHERE id = NEW.intern_id;
    END IF;

    IF v_hours_rendered_new >= v_hours_required
       AND v_prev_hours_rendered < v_hours_required
       AND NOT v_notified THEN

      UPDATE profiles SET ojt_completion_notified = true WHERE id = NEW.intern_id;

      FOR admin_rec IN
        SELECT id
          FROM profiles
         WHERE role = 'admin'
           AND is_active = true
           AND receives_action_alerts = true
      LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
          admin_rec.id,
          'ojt_completed',
          v_intern_name || ' completed their OJT hours',
          v_intern_name || ' has rendered all ' || v_hours_required
            || ' required OJT hours. Please review their internship status.',
          'intern',
          NEW.intern_id
        );
      END LOOP;
    END IF;
  ELSE
    UPDATE profiles SET hours_rendered = v_hours_rendered_new WHERE id = NEW.intern_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
