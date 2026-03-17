-- Migration: Add admin_logged tracking to attendance_records
-- Allows admins to retroactively log attendance for interns

ALTER TABLE attendance_records ADD COLUMN admin_logged BOOLEAN DEFAULT false;
ALTER TABLE attendance_records ADD COLUMN admin_logged_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
