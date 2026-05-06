-- Migration: Remove audit logs created by admintest@madison88.com and recent attendance correction logs
-- This deletes audit log entries to clean up test user activity

-- 1. Remove all logs from admintest@madison88.com
DELETE FROM audit_logs
WHERE user_id IN (
  SELECT id FROM profiles
  WHERE email = 'admintest@madison88.com'
);

-- 2. Remove "Attendance Correction Requested" logs created by interns from 1 PM to now (today)
DELETE FROM audit_logs
WHERE action = 'attendance.correction_requested'
  AND user_id IN (
    SELECT id FROM profiles WHERE role = 'intern'
  )
  AND (NOW() AT TIME ZONE 'Asia/Manila')::DATE = DATE(created_at AT TIME ZONE 'Asia/Manila')
  AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Manila'))::INTEGER >= (13 * 60);

-- Verify deletions (optional)
-- SELECT COUNT(*) FROM audit_logs
-- WHERE user_id IN (
--   SELECT id FROM profiles
--   WHERE email = 'admintest@madison88.com'
-- );
-- SELECT COUNT(*) FROM audit_logs
-- WHERE action = 'attendance.correction_requested'
--   AND user_id IN (
--     SELECT id FROM profiles WHERE role = 'intern'
--   )
--   AND (NOW() AT TIME ZONE 'Asia/Manila')::DATE = DATE(created_at AT TIME ZONE 'Asia/Manila')
--   AND (EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila') * 60 + EXTRACT(MINUTE FROM created_at AT TIME ZONE 'Asia/Manila'))::INTEGER >= (13 * 60);
