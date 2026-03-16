-- ============================================================
-- 014: Holiday Calendar Feature
-- ============================================================
-- Adds a holidays table for admin-managed holiday dates.
-- Holidays block interns from logging attendance, changing task
-- status, or submitting narratives on those dates.
-- ============================================================

CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_holidays_date ON holidays(date);

-- Auto-update updated_at
CREATE TRIGGER tr_holidays_updated_at
  BEFORE UPDATE ON holidays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;

-- Everyone can read holidays (needed for blocking checks)
CREATE POLICY holidays_select ON holidays FOR SELECT
  USING (true);

-- Only admin can manage holidays
CREATE POLICY holidays_insert ON holidays FOR INSERT
  WITH CHECK (get_user_role() = 'admin');

CREATE POLICY holidays_update ON holidays FOR UPDATE
  USING (get_user_role() = 'admin');

CREATE POLICY holidays_delete ON holidays FOR DELETE
  USING (get_user_role() = 'admin');
