-- ============================================================
-- SOTG Salon - Database Schema
-- ============================================================

-- Profiles (linked to Supabase Auth)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  role text default 'stylist',
  created_at timestamptz default now()
);

-- Customers
create table customers (
  id uuid primary key default gen_random_uuid(),
  first_name text,
  last_name text,
  city text,
  phone text,
  is_returning boolean default false,
  created_at timestamptz default now()
);

-- Services
create table services (
  id uuid primary key default gen_random_uuid(),
  name text,
  display_order int,
  is_active boolean default true
);

-- Employees
create table employees (
  id uuid primary key default gen_random_uuid(),
  name text,
  daily_rate numeric default 0,
  commission_per_head_rate numeric default 0,
  commission_percentage numeric default 0,
  is_in_service_charge_pool boolean default true,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- Visits
create table visits (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers on delete set null,
  date date default current_date,
  status text default 'in_progress',
  total_amount numeric,
  notes text,
  completed_at timestamptz,
  completed_by uuid references profiles on delete set null,
  created_at timestamptz default now()
);

-- Visit Services
create table visit_services (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits on delete cascade,
  service_id uuid references services on delete set null,
  price numeric
);

-- Visit Payments
create table visit_payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid references visits on delete cascade,
  method text,
  amount numeric not null
);

-- Transactions
create table transactions (
  id uuid primary key default gen_random_uuid(),
  date date default current_date,
  type text not null,
  amount numeric not null,
  category text,
  description text,
  visit_id uuid references visits on delete set null,
  payment_method text,
  employee_id uuid references employees on delete set null,
  created_by uuid references profiles on delete set null,
  created_at timestamptz default now()
);

-- Recurring Expenses
create table recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  name text,
  category text,
  default_amount numeric,
  is_active boolean default true
);

-- Daily Attendance
create table daily_attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees on delete cascade,
  date date default current_date,
  status text default 'present',
  notes text,
  unique(employee_id, date)
);

-- Payroll Records
create table payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees on delete cascade,
  month_year text,
  days_worked int default 0,
  base_salary numeric default 0,
  per_head_commission numeric default 0,
  percentage_commission numeric default 0,
  bonus_commission numeric default 0,
  service_charge_share numeric default 0,
  advances numeric default 0,
  deductions numeric default 0,
  total_pay numeric default 0,
  amount_paid numeric default 0,
  is_fully_paid boolean default false,
  unique(employee_id, month_year)
);

-- Partners
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text,
  split_percentage numeric,
  is_active boolean default true
);

-- App Settings
create table app_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique,
  value text
);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table profiles enable row level security;
alter table customers enable row level security;
alter table services enable row level security;
alter table employees enable row level security;
alter table visits enable row level security;
alter table visit_services enable row level security;
alter table visit_payments enable row level security;
alter table transactions enable row level security;
alter table recurring_expenses enable row level security;
alter table daily_attendance enable row level security;
alter table payroll_records enable row level security;
alter table partners enable row level security;
alter table app_settings enable row level security;

-- Authenticated users: full access to all tables
create policy "Authenticated users full access" on profiles
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on customers
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on services
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on employees
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on visits
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on visit_services
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on visit_payments
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on transactions
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on recurring_expenses
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on daily_attendance
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on payroll_records
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on partners
  for all using (auth.role() = 'authenticated');

create policy "Authenticated users full access" on app_settings
  for all using (auth.role() = 'authenticated');

-- Anonymous access for check-in kiosk
create policy "Anonymous can select services" on services
  for select using (auth.role() = 'anon');

create policy "Anonymous can insert customers" on customers
  for insert with check (auth.role() = 'anon');

create policy "Anonymous can insert visits" on visits
  for insert with check (auth.role() = 'anon');

create policy "Anonymous can insert visit_services" on visit_services
  for insert with check (auth.role() = 'anon');

-- ============================================================
-- Seed Data
-- ============================================================

-- Default services
insert into services (name, display_order) values
  ('Basic', 1),
  ('Regular', 2),
  ('Brazilian', 3),
  ('Protein', 4),
  ('Botox', 5),
  ('Balayage', 6),
  ('Highlights', 7),
  ('Color', 8);

-- Default app settings
insert into app_settings (key, value) values
  ('service_charge_threshold', '3000'),
  ('service_charge_amount', '100'),
  ('bonus_threshold', '3000'),
  ('bonus_amount', '100');

-- Default recurring expenses
insert into recurring_expenses (name, category, default_amount) values
  ('Rent', 'rent', 17000),
  ('Electric', 'electric', 6500),
  ('Water', 'water', 1500),
  ('Wifi', 'wifi', 1800),
  ('Food', 'food', 15000),
  ('PAGIBIG', 'pagibig', 7567),
  ('BIR', 'bir', 0);
