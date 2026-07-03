-- Allow admins to opt out of actionable email/in-app alerts while keeping system access.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS receives_action_alerts BOOLEAN NOT NULL DEFAULT true;
