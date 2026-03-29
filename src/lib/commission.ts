import type { Employee, Visit } from '@/types/database'

export interface CommissionResult {
  employeeId: string
  employeeName: string
  daysWorked: number
  baseSalary: number
  perHeadCommission: number
  percentageCommission: number
  bonusCommission: number
  serviceChargeShare: number
  totalPay: number
  amountPaid: number
  remaining: number
}

export function calculateServiceCharges(visits: Visit[], threshold: number = 3000, amount: number = 100): number {
  const qualifying = visits.filter(v => v.status === 'completed' && (v.total_amount ?? 0) >= threshold)
  return qualifying.length * amount
}

export function calculateCommission(
  employee: Employee,
  totalCustomers: number,
  totalSales: number,
  totalServiceCharges: number,
  qualifyingBillCount: number,
  serviceChargePoolSize: number,
  daysWorked: number,
  amountPaid: number = 0,
  deductions: number = 0,
  bonusAmount: number = 100,
  isInternal: boolean = true,
  relevantSales?: number,
): CommissionResult {
  const baseSalary = employee.daily_rate * daysWorked
  const perHeadCommission = employee.commission_per_head_rate * totalCustomers

  // For internal employees: percentage commission based on (totalSales - totalServiceCharges - externalStylistSales)
  // For external employees: percentage commission based on their own sales only
  const percentageBase = relevantSales !== undefined
    ? relevantSales
    : (totalSales - totalServiceCharges)
  const percentageCommission = employee.commission_percentage * percentageBase

  const bonusCommission = qualifyingBillCount * bonusAmount
  const serviceChargeShare = employee.is_in_service_charge_pool && serviceChargePoolSize > 0
    ? totalServiceCharges / serviceChargePoolSize
    : 0

  const totalPay = baseSalary + perHeadCommission + percentageCommission + bonusCommission + serviceChargeShare
  const remaining = totalPay - amountPaid - deductions

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    daysWorked,
    baseSalary,
    perHeadCommission,
    percentageCommission,
    bonusCommission,
    serviceChargeShare,
    totalPay,
    amountPaid,
    remaining,
  }
}
