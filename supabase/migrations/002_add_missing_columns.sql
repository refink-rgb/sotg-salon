-- Migration: Add columns that were created via dashboard but missing from schema
-- Run this if recreating the database from scratch

-- Visit photos
ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_before_url text;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS photo_after_url text;

-- Stylist assignment for visits
ALTER TABLE visits ADD COLUMN IF NOT EXISTS stylist_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL;

-- Internal vs external employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_internal boolean DEFAULT true;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(date);
CREATE INDEX IF NOT EXISTS idx_visits_status ON visits(status);
CREATE INDEX IF NOT EXISTS idx_visits_stylist ON visits(stylist_employee_id);
CREATE INDEX IF NOT EXISTS idx_visit_services_visit ON visit_services(visit_id);
CREATE INDEX IF NOT EXISTS idx_visit_payments_visit ON visit_payments(visit_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
