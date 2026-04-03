'use client'

import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  Loader2,
  DollarSign,
  TrendingDown,
  Wallet,
  ShoppingBag,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants'
import { formatPeso, getToday } from '@/lib/utils'
import type { Transaction } from '@/types/database'

export default function SummaryPage() {
  const supabase = createClient()
  const today = getToday()
  const todayDisplay = format(new Date(), 'EEEE, MMMM d, yyyy')

  const [loading, setLoading] = useState(true)
  const [saleTxns, setSaleTxns] = useState<Transaction[]>([])
  const [expenseTxns, setExpenseTxns] = useState<Transaction[]>([])
  const [payoutTxns, setPayoutTxns] = useState<Transaction[]>([])
  const [paymentSummary, setPaymentSummary] = useState<Record<string, number>>({})
  const [customerCount, setCustomerCount] = useState(0)
  const [inProgressCount, setInProgressCount] = useState(0)
  const [attendanceCount, setAttendanceCount] = useState(0)
  const [activeEmployeeCount, setActiveEmployeeCount] = useState(0)
  const [actualCash, setActualCash] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [txRes, payRes, visitCountRes, inProgressRes, attendanceRes, activeEmpRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('date', today)
        .eq('is_back_office', false)
        .order('created_at', { ascending: false }),
      supabase
        .from('visit_payments')
        .select('method, amount, visit:visits!inner(date)')
        .eq('visit.date', today),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('date', today)
        .eq('status', 'completed'),
      supabase.from('visits').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'in_progress'),
      supabase.from('daily_attendance').select('id', { count: 'exact', head: true }).eq('date', today),
      supabase.from('employees').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])

    const allTxns = (txRes.data || []) as Transaction[]
    setSaleTxns(allTxns.filter(t => t.type === 'sale'))
    setExpenseTxns(allTxns.filter(t => t.type === 'expense'))
    setPayoutTxns(allTxns.filter(t => t.type === 'salary' || t.type === 'commission'))

    const summary: Record<string, number> = {}
    for (const p of (payRes.data as { method: string; amount: number }[]) || []) {
      summary[p.method] = (summary[p.method] || 0) + p.amount
    }
    setPaymentSummary(summary)

    setCustomerCount(visitCountRes.count ?? 0)
    setInProgressCount(inProgressRes.count ?? 0)
    setAttendanceCount(attendanceRes.count ?? 0)
    setActiveEmployeeCount(activeEmpRes.count ?? 0)
    setLoading(false)
  }, [today])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const totalSales = saleTxns.reduce((s, t) => s + t.amount, 0)
  const totalExpenses = expenseTxns.reduce((s, t) => s + t.amount, 0)
  const totalPayouts = payoutTxns.reduce((s, t) => s + t.amount, 0)
  const totalCashIn = paymentSummary['cash'] || 0
  const totalCashOut = expenseTxns.reduce((s, t) => s + t.amount, 0) + payoutTxns.reduce((s, t) => s + t.amount, 0)
  const cashBalance = totalCashIn - totalCashOut

  // Group expenses by category
  const expenseByCategory: Record<string, number> = {}
  expenseTxns.forEach(t => {
    const cat = t.category || 'other'
    expenseByCategory[cat] = (expenseByCategory[cat] || 0) + t.amount
  })

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#40916C]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Daily Summary</h1>
        <p className="text-sm text-gray-500">{todayDisplay}</p>
      </div>

      {/* Top-level cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <DollarSign className="size-5 text-[#40916C] mx-auto mb-1" />
            <p className="text-xs text-gray-500">Total Sales</p>
            <p className="text-2xl font-bold text-[#1B4332]">{formatPeso(totalSales)}</p>
            <p className="text-xs text-gray-400">{customerCount} customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Wallet className="size-5 text-[#40916C] mx-auto mb-1" />
            <p className="text-xs text-gray-500">Cash Balance</p>
            <p className={`text-2xl font-bold ${cashBalance >= 0 ? 'text-[#1B4332]' : 'text-red-600'}`}>
              {formatPeso(cashBalance)}
            </p>
            <p className="text-xs text-gray-400">Cash in - Cash out</p>
          </CardContent>
        </Card>
      </div>

      {/* Payment Method Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShoppingBag className="size-4 text-[#40916C]" />
            Sales by Payment Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {PAYMENT_METHODS.map(pm => (
              <div key={pm.value} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm text-gray-600">{pm.label}</span>
                <span className="font-semibold text-[#1B4332]">{formatPeso(paymentSummary[pm.value] || 0)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Expenses Breakdown */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingDown className="size-4 text-red-500" />
            Expenses Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(expenseByCategory).length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-400">No expenses today</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(expenseByCategory)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => {
                    const label = EXPENSE_CATEGORIES.find(c => c.value === cat)?.label || cat
                    return (
                      <TableRow key={cat}>
                        <TableCell>{label}</TableCell>
                        <TableCell className="text-right font-medium text-red-600">{formatPeso(amt)}</TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-bold">Total Expenses</TableCell>
                  <TableCell className="text-right font-bold text-red-600">{formatPeso(totalExpenses)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Salary/Commission Payouts */}
      {payoutTxns.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Salary &amp; Commission Payouts</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payoutTxns.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="capitalize">
                      {t.type === 'salary' && t.category === 'service_charge' ? 'Service Charge' : t.type}
                    </TableCell>
                    <TableCell className="text-gray-500">{t.description || '-'}</TableCell>
                    <TableCell className="text-right font-medium text-orange-600">{formatPeso(t.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-bold">Total Payouts</TableCell>
                  <TableCell className="text-right font-bold text-orange-600">{formatPeso(totalPayouts)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Net Summary */}
      <Card className="border-[#1B4332]">
        <CardContent className="p-4">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Sales</span>
              <span className="font-semibold text-[#1B4332]">{formatPeso(totalSales)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Expenses</span>
              <span className="font-semibold text-red-600">({formatPeso(totalExpenses)})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Salary/Commission</span>
              <span className="font-semibold text-orange-600">({formatPeso(totalPayouts)})</span>
            </div>
            <Separator />
            <div className="flex justify-between text-base">
              <span className="font-bold">Net for Today</span>
              <span className={`font-bold ${totalSales - totalExpenses - totalPayouts >= 0 ? 'text-[#1B4332]' : 'text-red-600'}`}>
                {formatPeso(totalSales - totalExpenses - totalPayouts)}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* End of Day Checklist */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">End of Day Checklist</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* All customers completed */}
            <div className="flex items-center gap-3">
              {inProgressCount === 0 ? (
                <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">All customers completed</p>
                <p className="text-xs text-gray-500">
                  {inProgressCount === 0
                    ? `${customerCount} completed today`
                    : `${inProgressCount} still in progress`}
                </p>
              </div>
            </div>

            {/* Expenses logged */}
            <div className="flex items-center gap-3">
              {expenseTxns.length > 0 ? (
                <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">Expenses logged</p>
                <p className="text-xs text-gray-500">
                  {expenseTxns.length > 0
                    ? `${expenseTxns.length} expense(s) recorded`
                    : 'No expenses recorded today'}
                </p>
              </div>
            </div>

            {/* Attendance marked */}
            <div className="flex items-center gap-3">
              {attendanceCount >= activeEmployeeCount && activeEmployeeCount > 0 ? (
                <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">Attendance marked</p>
                <p className="text-xs text-gray-500">
                  {attendanceCount} of {activeEmployeeCount} employees marked
                </p>
              </div>
            </div>

            {/* Cash count verification */}
            <div className="flex items-center gap-3">
              {actualCash && Math.abs(Number(actualCash) - cashBalance) < 1 ? (
                <CheckCircle2 className="size-5 text-green-600 shrink-0" />
              ) : (
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
              )}
              <div className="flex-1">
                <p className="text-sm font-medium">Cash count verified</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">Expected: {formatPeso(cashBalance)}</span>
                  <Input
                    type="number"
                    value={actualCash}
                    onChange={(e) => setActualCash(e.target.value)}
                    placeholder="Actual cash"
                    className="h-7 w-32 text-sm"
                  />
                </div>
                {actualCash && Math.abs(Number(actualCash) - cashBalance) >= 1 && (
                  <p className="text-xs text-red-500 mt-1">
                    Difference: {formatPeso(Number(actualCash) - cashBalance)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
