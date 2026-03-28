import type { Transaction, RecurringExpense } from '@/types/database'

export interface MonthlyPL {
  month: number
  year: number
  sales: number
  actualExpenses: number
  projectedExpenses: number
  salaryPayouts: number
  commissionPayouts: number
  grossProfit: number
  netProfit: number
  expenseBreakdown: Record<string, { actual: number; projected: number }>
}

export function calculateMonthlyPL(
  transactions: Transaction[],
  recurringExpenses: RecurringExpense[],
  month: number,
  year: number,
  showProjected: boolean = true
): MonthlyPL {
  const monthStr = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthTxns = transactions.filter(t => t.date.startsWith(monthStr))

  const sales = monthTxns
    .filter(t => t.type === 'sale')
    .reduce((sum, t) => sum + t.amount, 0)

  const expenses = monthTxns
    .filter(t => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  const salaryPayouts = monthTxns
    .filter(t => t.type === 'salary')
    .reduce((sum, t) => sum + t.amount, 0)

  const commissionPayouts = monthTxns
    .filter(t => t.type === 'commission')
    .reduce((sum, t) => sum + t.amount, 0)

  // Build expense breakdown by category
  const expenseByCategory: Record<string, number> = {}
  monthTxns
    .filter(t => t.type === 'expense' && t.category)
    .forEach(t => {
      expenseByCategory[t.category!] = (expenseByCategory[t.category!] || 0) + t.amount
    })

  // Calculate projected remaining for each recurring expense
  const expenseBreakdown: Record<string, { actual: number; projected: number }> = {}
  recurringExpenses.forEach(re => {
    const actual = expenseByCategory[re.category] || 0
    const projected = showProjected ? Math.max(0, re.default_amount - actual) : 0
    expenseBreakdown[re.category] = { actual, projected }
  })

  const totalProjected = Object.values(expenseBreakdown).reduce((sum, e) => sum + e.projected, 0)
  const actualExpenses = expenses + salaryPayouts + commissionPayouts
  const grossProfit = sales - expenses
  const netProfit = sales - actualExpenses - (showProjected ? totalProjected : 0)

  return {
    month,
    year,
    sales,
    actualExpenses,
    projectedExpenses: totalProjected,
    salaryPayouts,
    commissionPayouts,
    grossProfit,
    netProfit,
    expenseBreakdown,
  }
}
