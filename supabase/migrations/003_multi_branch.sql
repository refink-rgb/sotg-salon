-- ============================================================
-- Migration 003: Multi-Branch Support
-- ============================================================

-- 1. Branches table
CREATE TABLE IF NOT EXISTS branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  address text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE branches ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read branches
CREATE POLICY "Authenticated users can read branches" ON branches
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only owners can manage branches
CREATE POLICY "Owners can manage branches" ON branches
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
  );

-- Anonymous can read branches (for kiosk slug lookup)
CREATE POLICY "Anonymous can read branches" ON branches
  FOR SELECT USING (auth.role() = 'anon');

-- Seed default branch (existing Mabalacat location)
INSERT INTO branches (name, slug, address) VALUES
  ('Mabalacat City', 'mabalacat', 'Mabalacat City, Pampanga');

-- 2. Add branch_id to scoped tables
-- Get the default branch ID for backfill
DO $$
DECLARE
  default_branch_id uuid;
BEGIN
  SELECT id INTO default_branch_id FROM branches WHERE slug = 'mabalacat';

  -- profiles
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE profiles SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- employees
  ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE employees SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- visits
  ALTER TABLE visits ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE visits SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- transactions
  ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE transactions SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- daily_attendance
  ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE daily_attendance SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- recurring_expenses
  ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE recurring_expenses SET branch_id = default_branch_id WHERE branch_id IS NULL;

  -- partners
  ALTER TABLE partners ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id);
  UPDATE partners SET branch_id = default_branch_id WHERE branch_id IS NULL;
END $$;

-- 3. Indexes on branch_id
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_visits_branch ON visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_branch ON transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON daily_attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_branch ON recurring_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_partners_branch ON partners(branch_id);

-- 4. Update UserRole to include 'owner'
-- (handled in app code — profiles.role is just a text column)

-- 5. Update RLS policies for branch scoping
-- Drop old blanket policies and replace with branch-aware ones

-- profiles
DROP POLICY IF EXISTS "Authenticated users full access" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (id = auth.uid());

-- employees: branch-scoped
DROP POLICY IF EXISTS "Authenticated users full access" ON employees;
CREATE POLICY "Branch-scoped employee access" ON employees
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      -- Owner sees all
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR
      -- Same branch
      branch_id = (SELECT profiles.branch_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- visits: branch-scoped
DROP POLICY IF EXISTS "Authenticated users full access" ON visits;
CREATE POLICY "Branch-scoped visit access" ON visits
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR
      branch_id = (SELECT profiles.branch_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- Anonymous insert visits: now requires branch_id (kiosk passes it)
DROP POLICY IF EXISTS "Anonymous can insert visits" ON visits;
CREATE POLICY "Anonymous can insert visits" ON visits
  FOR INSERT WITH CHECK (auth.role() = 'anon');

-- transactions: branch-scoped
DROP POLICY IF EXISTS "Authenticated users full access" ON transactions;
CREATE POLICY "Branch-scoped transaction access" ON transactions
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR
      branch_id = (SELECT profiles.branch_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- daily_attendance: branch-scoped
DROP POLICY IF EXISTS "Authenticated users full access" ON daily_attendance;
CREATE POLICY "Branch-scoped attendance access" ON daily_attendance
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR
      branch_id = (SELECT profiles.branch_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- recurring_expenses: branch-scoped
DROP POLICY IF EXISTS "Authenticated users full access" ON recurring_expenses;
CREATE POLICY "Branch-scoped recurring_expenses access" ON recurring_expenses
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR
      branch_id = (SELECT profiles.branch_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- partners: branch-scoped
DROP POLICY IF EXISTS "Authenticated users full access" ON partners;
CREATE POLICY "Branch-scoped partner access" ON partners
  FOR ALL USING (
    auth.role() = 'authenticated' AND (
      EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'owner')
      OR
      branch_id = (SELECT profiles.branch_id FROM profiles WHERE profiles.id = auth.uid())
    )
  );

-- Tables that stay global: services, customers, app_settings, payroll_records
-- (their existing "Authenticated users full access" policies remain unchanged)

-- visit_services and visit_payments inherit access through visit_id joins
-- (their existing policies remain unchanged)
