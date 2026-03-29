export type UserRole = 'stylist' | 'admin'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  created_at: string
}

export interface Customer {
  id: string
  first_name: string
  last_name: string
  city: string
  phone: string
  is_returning: boolean
  created_at: string
}

export interface Service {
  id: string
  name: string
  display_order: number
  is_active: boolean
}

export type VisitStatus = 'in_progress' | 'completed'

export interface Visit {
  id: string
  customer_id: string
  date: string
  status: VisitStatus
  total_amount: number | null
  notes: string | null
  photo_url: string | null
  completed_at: string | null
  stylist_employee_id: string | null
  completed_by: string | null
  created_at: string
  customer?: Customer
  visit_services?: VisitService[]
  visit_payments?: VisitPayment[]
}

export interface VisitService {
  id: string
  visit_id: string
  service_id: string
  price: number | null
  service?: Service
}

export type PaymentMethod = 'cash' | 'gcash' | 'bpi' | 'bank_transfer'

export interface VisitPayment {
  id: string
  visit_id: string
  method: PaymentMethod
  amount: number
}

export type TransactionType = 'sale' | 'expense' | 'salary' | 'commission' | 'withdrawal'

export interface Transaction {
  id: string
  date: string
  type: TransactionType
  amount: number
  category: string | null
  description: string | null
  visit_id: string | null
  payment_method: PaymentMethod | null
  employee_id: string | null
  created_by: string | null
  created_at: string
}

export type ExpenseCategory = 'rent' | 'electric' | 'water' | 'wifi' | 'food' | 'meds' | 'ads' | 'pagibig' | 'bir' | 'other'

export interface RecurringExpense {
  id: string
  name: string
  category: ExpenseCategory
  default_amount: number
  is_active: boolean
}

export interface Employee {
  id: string
  name: string
  daily_rate: number
  commission_per_head_rate: number
  commission_percentage: number
  is_internal: boolean
  is_in_service_charge_pool: boolean
  is_active: boolean
  created_at: string
}

export type AttendanceStatus = 'present' | 'absent' | 'day_off'

export interface DailyAttendance {
  id: string
  employee_id: string
  date: string
  status: AttendanceStatus
  notes: string | null
  employee?: Employee
}

export interface PayrollRecord {
  id: string
  employee_id: string
  month_year: string
  days_worked: number
  base_salary: number
  per_head_commission: number
  percentage_commission: number
  bonus_commission: number
  service_charge_share: number
  advances: number
  deductions: number
  total_pay: number
  amount_paid: number
  is_fully_paid: boolean
  employee?: Employee
}

export interface Partner {
  id: string
  name: string
  split_percentage: number
  is_active: boolean
}

export interface AppSettings {
  id: string
  key: string
  value: string
}
