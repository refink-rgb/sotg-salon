'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, getDaysInMonth, differenceInDays, startOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Plus, Trash2, TrendingUp, Calculator } from 'lucide-react'
import { toast } from 'sonner'
import type { Transaction, RecurringExpense, Partner } from '@/types/database'

function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `(₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface ExpenseItem {
  id: string
  name: string
  amount: number
}

interface WhatIfItem {
  id: string
  name: string
  amount: number
}

export default function ForecastingPage() {
  const now = new Date()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [loading, setLoading] = useState(true)

  // Projected expenses (editable)
  const [projectedExpenses, setProjectedExpenses] = useState<ExpenseItem[]>([])
  const [whatIfItems, setWhatIfItems] = useState<WhatIfItem[]>([])
  const [newWhatIfName, setNewWhatIfName] = useState('')
  const [newWhatIfAmount, setNewWhatIfAmount] = useState('')

  const monthStr = format(now, 'yyyy-MM')
  const monthStart = `${monthStr}-01`
  const totalDaysInMonth = getDaysInMonth(now)
  const daysElapsed = now.getDate()
  const daysRemaining = totalDaysInMonth - daysElapsed

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const monthEnd = `${monthStr}-${String(totalDaysInMonth).padStart(2, '0')}`

      try {
        const [txnRes, reRes, partnerRes] = await Promise.all([
          supabase.from('transactions').select('*').gte('date', monthStart).lte('date', monthEnd),
          supabase.from('recurring_expenses').select('*').eq('is_active', true),
          supabase.from('partners').select('*').eq('is_active', true),
        ])

        if (txnRes.error) throw txnRes.error
        if (reRes.error) throw reRes.error
        if (partnerRes.error) throw partnerRes.error

        setTransactions(txnRes.data ?? [])
        setRecurringExpenses(reRes.data ?? [])
        setPartners(partnerRes.data ?? [])

        // Build initial projected expenses from recurring
        const actualByCategory: Record<string, number> = {}
        ;(txnRes.data ?? [])
          .filter((t: Transaction) => t.type === 'expense' && t.category)
          .forEach((t: Transaction) => {
            actualByCategory[t.category!] = (actualByCategory[t.category!] || 0) + t.amount
          })

        const projected = (reRes.data ?? []).map((re: RecurringExpense) => {
          const actual = actualByCategory[re.category] || 0
          const remaining = Math.max(0, re.default_amount - actual)
          return {
            id: re.id,
            name: re.name,
            amount: remaining,
          }
        })
        setProjectedExpenses(projected)
      } catch (error) {
        console.error('Error:', error)
        toast.error('Failed to load forecasting data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  // Current month actuals
  const actuals = useMemo(() => {
    const salesToDate = transactions
      .filter(t => t.type === 'sale')
      .reduce((s, t) => s + t.amount, 0)

    const expensesToDate = transactions
      .filter(t => t.type === 'expense' || t.type === 'salary' || t.type === 'commission')
      .reduce((s, t) => s + t.amount, 0)

    const dailyPace = daysElapsed > 0 ? salesToDate / daysElapsed : 0
    const projectedMonthSales = dailyPace * totalDaysInMonth

    return { salesToDate, expensesToDate, dailyPace, projectedMonthSales }
  }, [transactions, daysElapsed, totalDaysInMonth])

  const totalProjectedExpenses = useMemo(
    () => projectedExpenses.reduce((s, e) => s + e.amount, 0),
    [projectedExpenses]
  )

  const totalWhatIf = useMemo(
    () => whatIfItems.reduce((s, e) => s + e.amount, 0),
    [whatIfItems]
  )

  const estimatedNetProfit = actuals.projectedMonthSales - actuals.expensesToDate - totalProjectedExpenses
  const whatIfNetProfit = estimatedNetProfit - totalWhatIf

  const handleAddExpense = () => {
    setProjectedExpenses(prev => [
      ...prev,
      { id: `custom-${Date.now()}`, name: 'New Expense', amount: 0 },
    ])
  }

  const handleRemoveExpense = (id: string) => {
    setProjectedExpenses(prev => prev.filter(e => e.id !== id))
  }

  const handleUpdateExpense = (id: string, field: 'name' | 'amount', value: string) => {
    setProjectedExpenses(prev =>
      prev.map(e =>
        e.id === id
          ? { ...e, [field]: field === 'amount' ? Number(value) || 0 : value }
          : e
      )
    )
  }

  const handleAddWhatIf = () => {
    if (!newWhatIfName.trim()) return
    setWhatIfItems(prev => [
      ...prev,
      { id: `whatif-${Date.now()}`, name: newWhatIfName.trim(), amount: Number(newWhatIfAmount) || 0 },
    ])
    setNewWhatIfName('')
    setNewWhatIfAmount('')
  }

  const handleRemoveWhatIf = (id: string) => {
    setWhatIfItems(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Forecasting</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Current Month Actuals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Sales to Date</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-green-700">{formatCurrency(actuals.salesToDate)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Expenses to Date</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-red-600">{formatCurrency(actuals.expensesToDate)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Days</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{daysElapsed} / {totalDaysInMonth}</p>
                <p className="text-xs text-gray-500">{daysRemaining} remaining</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Daily Sales Pace</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold">{formatCurrency(actuals.dailyPace)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">Projected Month Sales</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-bold text-[#1B4332]">{formatCurrency(actuals.projectedMonthSales)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Projected Expenses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Manual Projected Expenses</CardTitle>
              <Button size="sm" variant="outline" onClick={handleAddExpense}>
                <Plus className="size-4 mr-1" /> Add Expense
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {projectedExpenses.map(exp => (
                  <div key={exp.id} className="flex items-center gap-3">
                    <Input
                      value={exp.name}
                      onChange={e => handleUpdateExpense(exp.id, 'name', e.target.value)}
                      className="flex-1"
                    />
                    <div className="relative w-32">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                      <Input
                        type="number"
                        value={exp.amount || ''}
                        onChange={e => handleUpdateExpense(exp.id, 'amount', e.target.value)}
                        className="pl-6"
                      />
                    </div>
                    <Button size="icon-sm" variant="ghost" onClick={() => handleRemoveExpense(exp.id)}>
                      <Trash2 className="size-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                {projectedExpenses.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">No projected expenses</p>
                )}
              </div>
              <Separator className="my-4" />
              <div className="flex justify-between items-center font-semibold">
                <span>Total Projected Expenses</span>
                <span>{formatCurrency(totalProjectedExpenses)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Projection Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-5" /> Projection Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Projected Sales</span>
                  <span className="font-medium">{formatCurrency(actuals.projectedMonthSales)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Actual Expenses to Date</span>
                  <span className="font-medium text-red-600">- {formatCurrency(actuals.expensesToDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Remaining Projected Expenses</span>
                  <span className="font-medium text-red-600">- {formatCurrency(totalProjectedExpenses)}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Estimated Net Profit</span>
                  <span className={estimatedNetProfit < 0 ? 'text-red-600' : 'text-[#1B4332]'}>
                    {formatCurrency(estimatedNetProfit)}
                  </span>
                </div>

                {partners.length > 0 && (
                  <>
                    <Separator />
                    <p className="text-sm font-semibold text-gray-600">Partner Split Preview</p>
                    {partners.map(p => (
                      <div key={p.id} className="flex justify-between text-sm">
                        <span>{p.name} ({p.split_percentage}%)</span>
                        <span className={estimatedNetProfit * (p.split_percentage / 100) < 0 ? 'text-red-600' : ''}>
                          {formatCurrency(estimatedNetProfit * (p.split_percentage / 100))}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* What-If Section */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="size-5" /> What-If Analysis
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 mb-4">
                <Input
                  placeholder="Expense name"
                  value={newWhatIfName}
                  onChange={e => setNewWhatIfName(e.target.value)}
                  className="flex-1"
                />
                <div className="relative w-32">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">₱</span>
                  <Input
                    type="number"
                    placeholder="Amount"
                    value={newWhatIfAmount}
                    onChange={e => setNewWhatIfAmount(e.target.value)}
                    className="pl-6"
                    onKeyDown={e => e.key === 'Enter' && handleAddWhatIf()}
                  />
                </div>
                <Button size="sm" onClick={handleAddWhatIf}>Add</Button>
              </div>

              {whatIfItems.length > 0 && (
                <div className="space-y-2 mb-4">
                  {whatIfItems.map(item => (
                    <div key={item.id} className="flex items-center justify-between py-1 px-2 bg-orange-50 rounded">
                      <span className="text-sm">{item.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{formatCurrency(item.amount)}</span>
                        <Button size="icon-xs" variant="ghost" onClick={() => handleRemoveWhatIf(item.id)}>
                          <Trash2 className="size-3 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-4" />
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Base Estimated Profit</span>
                  <span className="font-medium">{formatCurrency(estimatedNetProfit)}</span>
                </div>
                {totalWhatIf > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-600">What-If Expenses</span>
                    <span className="font-medium text-orange-600">- {formatCurrency(totalWhatIf)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold">
                  <span>Net After What-If</span>
                  <span className={whatIfNetProfit < 0 ? 'text-red-600' : 'text-[#1B4332]'}>
                    {formatCurrency(whatIfNetProfit)}
                  </span>
                </div>
                {totalWhatIf > 0 && (
                  <p className="text-xs text-gray-500">
                    Impact: {formatCurrency(estimatedNetProfit - whatIfNetProfit)} reduction in profit
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
