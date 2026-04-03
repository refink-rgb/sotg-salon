'use client'

import { useEffect, useState, useMemo } from 'react'
import { getDaysInMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { MONTHS, EXPENSE_CATEGORIES } from '@/lib/constants'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Copy } from 'lucide-react'
import { copyTableToClipboard, formatPeso } from '@/lib/utils'
import type { Transaction, RecurringExpense, Partner } from '@/types/database'
import { toast } from 'sonner'


function formatPercent(value: number): string {
  if (!isFinite(value)) return '0.0%'
  return `${(value * 100).toFixed(1)}%`
}

type MonthZone = 'past' | 'current' | 'future'

export default function IncomeStatementPage() {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonthIdx = now.getMonth() // 0-indexed
  const [year, setYear] = useState(currentYear)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)

  const isCurrentYear = year === currentYear

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

  // Determine zone for each month
  const getMonthZone = (monthIdx: number): MonthZone => {
    if (!isCurrentYear) {
      return year < currentYear ? 'past' : 'future'
    }
    if (monthIdx < currentMonthIdx) return 'past'
    if (monthIdx === currentMonthIdx) return 'current'
    return 'future'
  }

  // Current month daily sales pace for future projections
  const currentMonthPace = useMemo(() => {
    if (!isCurrentYear) return 0
    const curMonthStr = `${year}-${String(currentMonthIdx + 1).padStart(2, '0')}`
    const curMonthSales = transactions
      .filter(t => t.type === 'sale' && t.date.startsWith(curMonthStr))
      .reduce((s, t) => s + t.amount, 0)
    const daysElapsed = now.getDate()
    return daysElapsed > 0 ? curMonthSales / daysElapsed : 0
  }, [transactions, year, isCurrentYear, currentMonthIdx])

  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIdx) => {
      const monthStr = `${year}-${String(monthIdx + 1).padStart(2, '0')}`
      const monthTxns = transactions.filter(t => t.date.startsWith(monthStr))
      const zone = getMonthZone(monthIdx)
      const totalDaysInMonth = getDaysInMonth(new Date(year, monthIdx))

      // Actual sales from transactions
      const actualSales = monthTxns
        .filter(t => t.type === 'sale')
        .reduce((s, t) => s + t.amount, 0)

      // Projected sales
      let projectedSales = 0
      if (zone === 'current') {
        // project remaining days of current month
        const daysElapsed = now.getDate()
        const daysRemaining = totalDaysInMonth - daysElapsed
        projectedSales = currentMonthPace * daysRemaining
      } else if (zone === 'future') {
        // full month projection based on current pace
        projectedSales = currentMonthPace * totalDaysInMonth
      }

      const totalSales = actualSales + projectedSales

      // Salary & commission actuals
      const actualSalaryPayouts = monthTxns
        .filter(t => t.type === 'salary')
        .reduce((s, t) => s + t.amount, 0)

      const actualCommissionPayouts = monthTxns
        .filter(t => t.type === 'commission')
        .reduce((s, t) => s + t.amount, 0)

      // Expense breakdown by category
      const actualExpByCategory: Record<string, number> = {}
      monthTxns
        .filter(t => t.type === 'expense' && t.category)
        .forEach(t => {
          actualExpByCategory[t.category!] = (actualExpByCategory[t.category!] || 0) + t.amount
        })

      // Build category rows with actual + projected
      const categoryBreakdown: Record<string, { actual: number; projected: number }> = {}
      let totalActualCategoryExpenses = 0
      let totalProjectedCategoryExpenses = 0

      EXPENSE_CATEGORIES.forEach(cat => {
        const actual = actualExpByCategory[cat.value] || 0
        totalActualCategoryExpenses += actual

        let projected = 0
        if (zone === 'current') {
          const re = recurringExpenses.find(r => r.category === cat.value)
          if (re) projected = Math.max(0, re.default_amount - actual)
        } else if (zone === 'future') {
          const re = recurringExpenses.find(r => r.category === cat.value)
          if (re) projected = re.default_amount
        }
        totalProjectedCategoryExpenses += projected

        categoryBreakdown[cat.value] = { actual, projected }
      })

      // Catch unknown categories
      const knownCategories = new Set<string>(EXPENSE_CATEGORIES.map(c => c.value))
      Object.entries(actualExpByCategory).forEach(([cat, amt]) => {
        if (!knownCategories.has(cat)) {
          totalActualCategoryExpenses += amt
          if (!categoryBreakdown[cat]) {
            categoryBreakdown[cat] = { actual: amt, projected: 0 }
          }
        }
      })

      const totalActualExpenses = totalActualCategoryExpenses + actualSalaryPayouts + actualCommissionPayouts
      const totalProjectedExpenses = totalProjectedCategoryExpenses
      const totalExpenses = totalActualExpenses + totalProjectedExpenses

      const grossProfit = totalSales - totalExpenses
      const expenseRatio = totalSales > 0 ? totalExpenses / totalSales : 0
      const profitMargin = totalSales > 0 ? grossProfit / totalSales : 0

      return {
        month: monthIdx,
        zone,
        actualSales,
        projectedSales,
        totalSales,
        actualSalaryPayouts,
        actualCommissionPayouts,
        categoryBreakdown,
        totalActualCategoryExpenses,
        totalProjectedCategoryExpenses,
        totalActualExpenses,
        totalProjectedExpenses,
        totalExpenses,
        grossProfit,
        expenseRatio,
        profitMargin,
      }
    })
  }, [transactions, recurringExpenses, year, isCurrentYear, currentMonthIdx, currentMonthPace])

  // YTD Actuals: sum only actual transactions (no projections) for past + current months
  const ytdActuals = useMemo(() => {
    const result = {
      sales: 0,
      salaryPayouts: 0,
      commissionPayouts: 0,
      categoryTotals: {} as Record<string, number>,
      totalExpenses: 0,
      grossProfit: 0,
    }

    monthlyData.forEach(m => {
      if (m.zone === 'past' || m.zone === 'current') {
        result.sales += m.actualSales
        result.salaryPayouts += m.actualSalaryPayouts
        result.commissionPayouts += m.actualCommissionPayouts
        result.totalExpenses += m.totalActualExpenses

        Object.entries(m.categoryBreakdown).forEach(([cat, val]) => {
          result.categoryTotals[cat] = (result.categoryTotals[cat] || 0) + val.actual
        })
      }
    })

    result.grossProfit = result.sales - result.totalExpenses
    return result
  }, [monthlyData])

  // Full Year Projected: sum of actuals + projections for all months
  const fullYearProjected = useMemo(() => {
    const result = {
      sales: 0,
      salaryPayouts: 0,
      commissionPayouts: 0,
      categoryTotals: {} as Record<string, { actual: number; projected: number }>,
      totalExpenses: 0,
      grossProfit: 0,
    }

    monthlyData.forEach(m => {
      result.sales += m.totalSales
      result.salaryPayouts += m.actualSalaryPayouts
      result.commissionPayouts += m.actualCommissionPayouts
      result.totalExpenses += m.totalExpenses

      Object.entries(m.categoryBreakdown).forEach(([cat, val]) => {
        if (!result.categoryTotals[cat]) {
          result.categoryTotals[cat] = { actual: 0, projected: 0 }
        }
        result.categoryTotals[cat].actual += val.actual
        result.categoryTotals[cat].projected += val.projected
      })
    })

    result.grossProfit = result.sales - result.totalExpenses
    return result
  }, [monthlyData])

  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  // Styling helpers
  const numClass = (value: number) => value < 0 ? 'text-red-600' : ''

  const projectedStyle = 'text-gray-400 italic'

  const getMonthBg = (zone: MonthZone, baseBg: string = '') => {
    if (zone === 'current') return 'bg-green-50/60'
    return baseBg
  }

  const getMonthHeaderBg = (zone: MonthZone) => {
    if (zone === 'current') return 'bg-green-100/70'
    return ''
  }

  // Render a cell that may contain actual + projected portions
  const renderAmountCell = (
    actual: number,
    projected: number,
    zone: MonthZone,
    opts?: { bold?: boolean }
  ) => {
    const total = actual + projected
    if (zone === 'past') {
      return (
        <span className={`${opts?.bold ? 'font-semibold' : ''} ${numClass(total)}`}>
          {formatPeso(total)}
        </span>
      )
    }
    if (zone === 'current') {
      if (projected === 0) {
        return (
          <span className={`${opts?.bold ? 'font-semibold' : ''} ${numClass(actual)}`}>
            {formatPeso(actual)}
          </span>
        )
      }
      return (
        <span className={opts?.bold ? 'font-semibold' : ''}>
          <span className={numClass(actual)}>{formatPeso(actual)}</span>
          {projected !== 0 && (
            <span className={`${projectedStyle} block text-xs`}>
              + {formatPeso(projected)}
            </span>
          )}
        </span>
      )
    }
    // future
    return (
      <span className={`${projectedStyle} ${opts?.bold ? 'font-semibold' : ''} ${numClass(total)}`}>
        {formatPeso(total)}
      </span>
    )
  }

  // Render a simple value (for totals rows like gross profit where we show combined)
  const renderTotalCell = (value: number, zone: MonthZone, opts?: { bold?: boolean }) => {
    if (zone === 'future') {
      return (
        <span className={`${projectedStyle} ${opts?.bold ? 'font-semibold' : ''} ${numClass(value)}`}>
          {formatPeso(value)}
        </span>
      )
    }
    return (
      <span className={`${opts?.bold ? 'font-semibold' : ''} ${numClass(value)}`}>
        {formatPeso(value)}
      </span>
    )
  }

  const renderPercentCell = (value: number, zone: MonthZone) => {
    if (zone === 'future') {
      return <span className={`${projectedStyle} ${numClass(value)}`}>{formatPercent(value)}</span>
    }
    return <span className={numClass(value)}>{formatPercent(value)}</span>
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Income Statement</h1>
          <Button variant="outline" size="sm" onClick={async () => {
            const shortMonths = MONTHS.map(m => m.substring(0, 3))
            const headers = ['Category', ...shortMonths, 'YTD', 'Full Year']
            const getRow = (label: string, getValue: (d: typeof monthlyData[0]) => number) => {
              return [label, ...monthlyData.map(d => String(Math.round(getValue(d)))), String(Math.round(monthlyData.reduce((s, d) => s + getValue(d), 0))), '']
            }
            const rows = [
              getRow('Sales', d => d.totalSales),
              ...EXPENSE_CATEGORIES.map(c => getRow(c.label, d => (d.categoryBreakdown[c.value]?.actual || 0) + (d.categoryBreakdown[c.value]?.projected || 0))),
              getRow('Salary Payouts', d => d.actualSalaryPayouts),
              getRow('Commission Payouts', d => d.actualCommissionPayouts),
              getRow('Total Expenses', d => d.totalExpenses),
              getRow('Gross Profit', d => d.grossProfit),
            ]
            await copyTableToClipboard(headers, rows)
            toast.success('Income statement copied')
          }}>
            <Copy className="size-3.5 mr-1" /> Copy
          </Button>
        </div>

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

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="inline-block w-3 h-3 bg-green-100 border border-green-200 rounded" />
            <span>Current month</span>
            <span className={`${projectedStyle} ml-2`}>Italic = projected</span>
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
                      <TableHead
                        key={i}
                        className={`text-right min-w-[110px] ${getMonthHeaderBg(getMonthZone(i))}`}
                      >
                        {m.slice(0, 3)}
                      </TableHead>
                    ))}
                    <TableHead className="text-right min-w-[110px] font-bold bg-gray-50">YTD Actual</TableHead>
                    <TableHead className="text-right min-w-[120px] font-bold bg-gray-100">Full Year</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* SALES */}
                  <TableRow className="font-semibold">
                    <TableCell className="sticky left-0 bg-green-50 z-10">Sales</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${getMonthBg(m.zone, 'bg-green-50')}`}>
                        {renderAmountCell(m.actualSales, m.projectedSales, m.zone, { bold: true })}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold bg-gray-50">
                      {formatPeso(ytdActuals.sales)}
                    </TableCell>
                    <TableCell className="text-right font-bold bg-gray-100">
                      {formatPeso(fullYearProjected.sales)}
                    </TableCell>
                  </TableRow>

                  {/* EXPENSES HEADER */}
                  <TableRow className="bg-gray-100">
                    <TableCell className="sticky left-0 bg-gray-100 z-10 font-semibold" colSpan={16}>
                      Expenses
                    </TableCell>
                  </TableRow>

                  {/* Expense sub-rows */}
                  {EXPENSE_CATEGORIES.map(cat => (
                    <TableRow key={cat.value}>
                      <TableCell className="sticky left-0 bg-white z-10 pl-6 text-gray-600">
                        {cat.label}
                      </TableCell>
                      {monthlyData.map((m, i) => {
                        const bd = m.categoryBreakdown[cat.value] || { actual: 0, projected: 0 }
                        return (
                          <TableCell key={i} className={`text-right ${getMonthBg(m.zone)}`}>
                            {renderAmountCell(bd.actual, bd.projected, m.zone)}
                          </TableCell>
                        )
                      })}
                      <TableCell className="text-right bg-gray-50">
                        {formatPeso(ytdActuals.categoryTotals[cat.value] || 0)}
                      </TableCell>
                      <TableCell className="text-right font-medium bg-gray-100">
                        {formatPeso(
                          (fullYearProjected.categoryTotals[cat.value]?.actual ?? 0) +
                          (fullYearProjected.categoryTotals[cat.value]?.projected ?? 0)
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {/* Salary Payouts */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">Salary Payouts</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${getMonthBg(m.zone)}`}>
                        {m.zone === 'future' ? (
                          <span className={projectedStyle}>{formatPeso(m.actualSalaryPayouts)}</span>
                        ) : (
                          formatPeso(m.actualSalaryPayouts)
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold bg-gray-50">
                      {formatPeso(ytdActuals.salaryPayouts)}
                    </TableCell>
                    <TableCell className="text-right font-bold bg-gray-100">
                      {formatPeso(fullYearProjected.salaryPayouts)}
                    </TableCell>
                  </TableRow>

                  {/* Commission Payouts */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 font-medium">Commission Payouts</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${getMonthBg(m.zone)}`}>
                        {m.zone === 'future' ? (
                          <span className={projectedStyle}>{formatPeso(m.actualCommissionPayouts)}</span>
                        ) : (
                          formatPeso(m.actualCommissionPayouts)
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold bg-gray-50">
                      {formatPeso(ytdActuals.commissionPayouts)}
                    </TableCell>
                    <TableCell className="text-right font-bold bg-gray-100">
                      {formatPeso(fullYearProjected.commissionPayouts)}
                    </TableCell>
                  </TableRow>

                  {/* Total Expenses */}
                  <TableRow className="font-semibold">
                    <TableCell className="sticky left-0 bg-red-50 z-10">Total Expenses</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${m.zone === 'current' ? 'bg-green-50/60' : 'bg-red-50'}`}>
                        {renderAmountCell(m.totalActualExpenses, m.totalProjectedExpenses, m.zone, { bold: true })}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold bg-gray-50">
                      {formatPeso(ytdActuals.totalExpenses)}
                    </TableCell>
                    <TableCell className="text-right font-bold bg-gray-100">
                      {formatPeso(fullYearProjected.totalExpenses)}
                    </TableCell>
                  </TableRow>

                  {/* Separator */}
                  <TableRow>
                    <TableCell colSpan={16} className="h-2 bg-gray-200" />
                  </TableRow>

                  {/* Gross Profit */}
                  <TableRow className="font-semibold">
                    <TableCell className="sticky left-0 bg-blue-50 z-10">Gross Profit</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${m.zone === 'current' ? 'bg-green-50/60' : 'bg-blue-50'}`}>
                        {renderTotalCell(m.grossProfit, m.zone, { bold: true })}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-bold bg-gray-50 ${numClass(ytdActuals.grossProfit)}`}>
                      {formatPeso(ytdActuals.grossProfit)}
                    </TableCell>
                    <TableCell className={`text-right font-bold bg-gray-100 ${numClass(fullYearProjected.grossProfit)}`}>
                      {formatPeso(fullYearProjected.grossProfit)}
                    </TableCell>
                  </TableRow>

                  {/* Expense Ratio */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 text-gray-600">Expense Ratio</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right text-gray-600 ${getMonthBg(m.zone)}`}>
                        {m.totalSales > 0 ? renderPercentCell(m.expenseRatio, m.zone) : '-'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium bg-gray-50">
                      {ytdActuals.sales > 0 ? formatPercent(ytdActuals.totalExpenses / ytdActuals.sales) : '-'}
                    </TableCell>
                    <TableCell className="text-right font-medium bg-gray-100">
                      {fullYearProjected.sales > 0 ? formatPercent(fullYearProjected.totalExpenses / fullYearProjected.sales) : '-'}
                    </TableCell>
                  </TableRow>

                  {/* Profit Margin */}
                  <TableRow>
                    <TableCell className="sticky left-0 bg-white z-10 text-gray-600">Profit Margin</TableCell>
                    {monthlyData.map((m, i) => (
                      <TableCell key={i} className={`text-right ${getMonthBg(m.zone)}`}>
                        {m.totalSales > 0 ? renderPercentCell(m.profitMargin, m.zone) : '-'}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-medium bg-gray-50 ${numClass(ytdActuals.grossProfit)}`}>
                      {ytdActuals.sales > 0 ? formatPercent(ytdActuals.grossProfit / ytdActuals.sales) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-medium bg-gray-100 ${numClass(fullYearProjected.grossProfit)}`}>
                      {fullYearProjected.sales > 0 ? formatPercent(fullYearProjected.grossProfit / fullYearProjected.sales) : '-'}
                    </TableCell>
                  </TableRow>

                  {/* Separator */}
                  <TableRow>
                    <TableCell colSpan={16} className="h-2 bg-gray-200" />
                  </TableRow>

                  {/* Partner Split */}
                  <TableRow className="bg-gray-100">
                    <TableCell className="sticky left-0 bg-gray-100 z-10 font-semibold" colSpan={16}>
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
                          <TableCell key={i} className={`text-right ${getMonthBg(m.zone)}`}>
                            {renderTotalCell(share, m.zone)}
                          </TableCell>
                        )
                      })}
                      <TableCell className={`text-right font-medium bg-gray-50 ${numClass(ytdActuals.grossProfit * (partner.split_percentage / 100))}`}>
                        {formatPeso(ytdActuals.grossProfit * (partner.split_percentage / 100))}
                      </TableCell>
                      <TableCell className={`text-right font-medium bg-gray-100 ${numClass(fullYearProjected.grossProfit * (partner.split_percentage / 100))}`}>
                        {formatPeso(fullYearProjected.grossProfit * (partner.split_percentage / 100))}
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
