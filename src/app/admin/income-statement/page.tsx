'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MONTHS, EXPENSE_CATEGORIES } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import type { Transaction, RecurringExpense, Partner } from '@/types/database'
import { toast } from 'sonner'

function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `(₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatPercent(value: number): string {
  if (!isFinite(value)) return '0.0%'
  return `${(value * 100).toFixed(1)}%`
}

export default function IncomeStatementPage() {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [showProjected, setShowProjected] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()

      try {
        const yearStart = `${year}-01-01`
        const yearEnd = `${year}-12-31`

        const [txnRes, reRes, partnerRes] = await Promise.all([
          supabase.from('transactions').select('*').gte('date', yearStart).lte('date', yearEnd),
          supabase.from('recurring_expenses').select('*').eq('is_active', true),
          supabase.from('partners').select('*').eq('is_active', true),
        ])

        if (txnRes.error) throw txnRes.error
        if (reRes.error) throw reRes.error
        if (partnerRes.error) throw partnerRes.error

        setTransactions(txnRes.data ?? [])
        setRecurringExpenses(reRes.data ?? [])
        setPartners(partnerRes.data ?? [])
      } catch (error) {
        console.error('Error:', error)
        toast.error('Failed to load income statement data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [year])

  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const monthStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
      const monthTxns = transactions.filter(t => t.date.startsWith(monthStr))

      const sales = monthTxns
        .filter(t => t.type === 'sale')
        .reduce((s, t) => s + t.amount, 0)

      const salaryPayouts = monthTxns
        .filter(t => t.type === 'salary')
        .reduce((s, t) => s + t.amount, 0)

      const commissionPayouts = monthTxns
        .filter(t => t.type === 'commission')
        .reduce((s, t) => s + t.amount, 0)

      // Expense breakdown by category
      const expByCategory: Record<string, number> = {}
      monthTxns
        .filter(t => t.type === 'expense' && t.category)
        .forEach(t => {
          expByCategory[t.category!] = (expByCategory[t.category!] || 0) + t.amount
        })

      // Build category rows with projected
      const categoryBreakdown: Record<string, { actual: number; projected: number }> = {}
      let totalActualExpenses = 0
      let totalProjected = 0

      EXPENSE_CATEGORIES.forEach(cat => {
        const actual = expByCategory[cat.value] || 0
        totalActualExpenses += actual
        const re = recurringExpenses.find(r => r.category === cat.value)
        const projected = showProjected && re ? Math.max(0, re.default_amount - actual) : 0
        totalProjected += projected
        categoryBreakdown[cat.value] = { actual, projected }
      })

      // Also catch expenses in categories not in EXPENSE_CATEGORIES
      const knownCategories = new Set<string>(EXPENSE_CATEGORIES.map(c => c.value))
      Object.entries(expByCategory).forEach(([cat, amt]) => {
        if (!knownCategories.has(cat)) {
          totalActualExpenses += amt
          if (!categoryBreakdown[cat]) {
            categoryBreakdown[cat] = { actual: amt, projected: 0 }
          }
        }
      })

      const totalExpenses = totalActualExpenses + totalProjected + salaryPayouts + commissionPayouts
      const grossProfit = sales - totalExpenses
      const expenseRatio = sales > 0 ? totalExpenses / sales : 0
      const profitMargin = sales > 0 ? grossProfit / sales : 0

      return {
        month: monthIdx,
        sales,
        salaryPayouts,
        commissionPayouts,
        categoryBreakdown,
        totalActualExpenses,
        totalProjected,
        totalExpenses,
        grossProfit,
        expenseRatio,
        profitMargin,
      }
    })
  }, [transactions, recurringExpenses, year, showProjected])

  // Totals
  const totals = useMemo(() => {
    const result = {
      sales: 0,
      salaryPayouts: 0,
      commissionPayouts: 0,
      categoryTotals: {} as Record<string, { actual: number; projected: number }>,
      totalActualExpenses: 0,
      totalProjected: 0,
      totalExpenses: 0,
      grossProfit: 0,
      expenseRatio: 0,
      profitMargin: 0,
    }

    monthlyData.forEach(m => {
      result.sales += m.sales
      result.salaryPayouts += m.salaryPayouts
      result.commissionPayouts += m.commissionPayouts
      result.totalActualExpenses += m.totalActualExpenses
      result.totalProjected += m.totalProjected
      result.totalExpenses += m.totalExpenses
      result.grossProfit += m.grossProfit

      Object.entries(m.categoryBreakdown).forEach(([cat, val]) => {
        if (!result.categoryTotals[cat]) {
          result.categoryTotals[cat] = { actual: 0, projected: 0 }
        }
        result.categoryTotals[cat].actual += val.actual
        result.categoryTotals[cat].projected += val.projected
      })
    })

    result.expenseRatio = result.sales > 0 ? result.totalExpenses / result.sales : 0
    result.profitMargin = result.sales > 0 ? result.grossProfit / result.sales : 0

    return result
  }, [monthlyData])

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  const cellClass = (value: number) =>
    value < 0 ? 'text-red-600' : ''

  const getCategoryAmount = (monthIdx: number, catValue: string) => {
    const bd = monthlyData[monthIdx].categoryBreakdown[catValue]
    if (!bd) return 0
    return bd.actual + bd.projected
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">Income Statement</h1>

        <div className="flex items-center gap-4">
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Switch
              checked={showProjected}
              onCheckedChange={setShowProjected}
              id="show-projected"
            />
            <Label htmlFor="show-projected" className="text-sm whitespace-nowrap">
              {showProjected ? 'Show Projected' : 'Paid Only'}
            </Label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-white z-10 min-w-[160px]">Category</TableHead>
                    {MONTHS.map((m, i) => (
                      <TableHead key={i} className="text-right min-w-[100px]">{m.slice(0, 3)}</TableHead>
                    ))}
                    <TableHead className="text-right min-w-[110px] font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* SALES */}
                  <TableRow className="bg-green-50 font-semibold">
                    <TableCell className="sticky left-0 bg-green-50 z-10">Sales</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className="text-right">{formatCurrency(m.sales)}</TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{formatCurrency(totals.sales)}</TableCell>
                  </TableRow>

                  {/* EXPENSES HEADER */}
                  <TableRow className="bg-gray-100">
                    <TableCell className="sticky left-0 bg-gray-100 z-10 font-semibold" colSpan={14}>
                      Expenses
                    </TableCell>
                  </TableRow>

                  {/* Expense sub-rows */}
                  {EXPENSE_CATEGORIES.map(cat => (
                    <TableRow key={cat.value}>
                      <TableCell className="sticky left-0 bg-white z-10 pl-6 text-gray-600">
                        {cat.label}
                      </TableCell>
                      {monthlyData.map((m, i) => (
                        <TableCell key={i} className="text-right">
                          {formatCurrency(getCategoryAmount(i, cat.value))}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium">
                        {formatCurrency(
                          (totals.categoryTotals[cat.value]?.actual ?? 0) +
                          (totals.categoryTotals[cat.value]?.projected ?? 0)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Salary Payouts */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">Salary Payouts</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className="text-right">{formatCurrency(m.salaryPayouts)}</TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{formatCurrency(totals.salaryPayouts)}</TableCell>
                  </TableRow>

                  {/* Commission Payouts */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">Commission Payouts</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className="text-right">{formatCurrency(m.commissionPayouts)}</TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{formatCurrency(totals.commissionPayouts)}</TableCell>
                  </TableRow>

                  {/* Total Expenses */}
                  <TableRow className="bg-red-50 font-semibold">
                    <TableCell className="sticky left-0 bg-red-50 z-10">Total Expenses</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className="text-right">{formatCurrency(m.totalExpenses)}</TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{formatCurrency(totals.totalExpenses)}</TableCell>
                  </TableRow>

                  {/* Gross Profit */}
                  <TableRow className="bg-blue-50 font-semibold">
                    <TableCell className="sticky left-0 bg-blue-50 z-10">Gross Profit</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${cellClass(m.grossProfit)}`}>
                        {formatCurrency(m.grossProfit)}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-bold ${cellClass(totals.grossProfit)}`}>
                      {formatCurrency(totals.grossProfit)}
                    </TableCell>
                  </TableRow>

                  {/* Expense Ratio */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 text-gray-600">Expense Ratio</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className="text-right text-gray-600">{formatPercent(m.expenseRatio)}</TableCell>
                    ))}
                    <TableCell className="text-right font-medium">{formatPercent(totals.expenseRatio)}</TableCell>
                  </TableRow>

                  {/* Profit Margin */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 text-gray-600">Profit Margin</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${cellClass(m.profitMargin)}`}>
                        {formatPercent(m.profitMargin)}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-medium ${cellClass(totals.profitMargin)}`}>
                      {formatPercent(totals.profitMargin)}
                    </TableCell>
                  </TableRow>

                  {/* Separator */}
                  <TableRow>
                    <TableCell colSpan={14} className="h-2 bg-gray-200" />
                  </TableRow>

                  {/* Partner Split */}
                  <TableRow className="bg-gray-100">
                    <TableCell className="sticky left-0 bg-gray-100 z-10 font-semibold" colSpan={14}>
                      Partner Split
                    </TableCell>
                  </TableRow>

                  {partners.map(partner => (
                    <TableRow key={partner.id}>
                      <TableCell className="sticky left-0 bg-white z-10 pl-6">
                        {partner.name} ({partner.split_percentage}%)
                      </TableCell>
                      {monthlyData.map((m, i) => {
                        const share = m.grossProfit * (partner.split_percentage / 100)
                        return (
                          <TableCell key={i} className={`text-right ${cellClass(share)}`}>
                            {formatCurrency(share)}
                          </TableCell>
                        )
                      })}
                      <TableCell className={`text-right font-medium ${cellClass(totals.grossProfit * (partner.split_percentage / 100))}`}>
                        {formatCurrency(totals.grossProfit * (partner.split_percentage / 100))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
