-- ============================================================
-- MULTI-BRANCH EXPANSION
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

-- 2. Add branch_id to all branch-scoped tables
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE daily_attendance ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE recurring_expenses ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE partners ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES branches(id) ON DELETE SET NULL;

-- 3. Indexes for branch_id lookups
CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);
CREATE INDEX IF NOT EXISTS idx_visits_branch ON visits(branch_id);
CREATE INDEX IF NOT EXISTS idx_transactions_branch ON transactions(branch_id);
CREATE INDEX IF NOT EXISTS idx_attendance_branch ON daily_attendance(branch_id);
CREATE INDEX IF NOT EXISTS idx_recurring_expenses_branch ON recurring_expenses(branch_id);
CREATE INDEX IF NOT EXISTS idx_partners_branch ON partners(branch_id);

-- 4. RLS for branches table
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read active branches" ON branches
  FOR SELECT USING (true);
CREATE POLICY "Authenticated users full access" ON branches
  FOR ALL USING (auth.role() = 'authenticated');
