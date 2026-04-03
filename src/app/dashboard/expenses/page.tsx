'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Plus,
  Receipt,
  Wallet,
  CreditCard,
  Banknote,
} from 'lucide-react'
import { toast } from 'sonner'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants'
import { formatPeso, getToday } from '@/lib/utils'
import type { Transaction, Employee } from '@/types/database'

export default function ExpensesPage() {
  const supabase = createClient()
  const today = getToday()

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Expense form
  const [expCategory, setExpCategory] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expNote, setExpNote] = useState('')
  const [submittingExpense, setSubmittingExpense] = useState(false)
  const [expBackOffice, setExpBackOffice] = useState(false)

  // Payout form
  const [payoutEmployee, setPayoutEmployee] = useState('')
  const [payoutSalary, setPayoutSalary] = useState('')
  const [payoutSC, setPayoutSC] = useState('')
  const [payoutCommission, setPayoutCommission] = useState('')
  const [submittingPayout, setSubmittingPayout] = useState(false)
  const [payoutBackOffice, setPayoutBackOffice] = useState(false)
  const [quickCategory, setQuickCategory] = useState<string | null>(null)
  const [quickAmount, setQuickAmount] = useState('')
  const [submittingQuick, setSubmittingQuick] = useState(false)

  // Load quick expense history from localStorage
  function getQuickHistory(cat: string): number[] {
    try {
      return JSON.parse(localStorage.getItem(`qe_${cat}`) || '[]')
    } catch { return [] }
  }
  function saveQuickHistory(cat: string, amount: number) {
    const prev = getQuickHistory(cat).filter(a => a !== amount)
    localStorage.setItem(`qe_${cat}`, JSON.stringify([amount, ...prev].slice(0, 3)))
  }

  // Payment summary
  const [paymentSummary, setPaymentSummary] = useState<
    Record<string, number>
  >({})

  const fetchData = useCallback(async () => {
    const [txRes, empRes, payRes] = await Promise.all([
      supabase
        .from('transactions')
        .select('*')
        .eq('date', today)
        .eq('is_back_office', false)
        .in('type', ['expense', 'salary', 'commission', 'withdrawal'])
        .order('created_at', { ascending: false }),
      supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('visit_payments')
        .select('method, amount, visit:visits!inner(date)')
        .eq('visit.date', today),
    ])

    if (txRes.error) console.error(txRes.error)
    if (empRes.error) console.error(empRes.error)
    if (payRes.error) console.error(payRes.error)

    setTransactions(txRes.data || [])
    setEmployees(empRes.data || [])

    // Compute payment summary
    const summary: Record<string, number> = {}
    for (const p of (payRes.data as { method: string; amount: number }[]) || []) {
      summary[p.method] = (summary[p.method] || 0) + p.amount
    }
    setPaymentSummary(summary)

    setLoading(false)
  }, [today])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault()
    if (!expCategory || !expAmount || Number(expAmount) <= 0) {
      toast.error('Please fill in category and amount')
      return
    }

    setSubmittingExpense(true)
    try {
      const categoryLabel =
        EXPENSE_CATEGORIES.find((c) => c.value === expCategory)?.label ||
        expCategory
      const { error } = await supabase.from('transactions').insert({
        date: today,
        type: 'expense',
        amount: Number(expAmount),
        category: expCategory,
        description: expNote.trim() || categoryLabel,
        is_back_office: expBackOffice,
      })
      if (error) throw error

      toast.success('Expense added')
      setExpCategory('')
      setExpAmount('')
      setExpNote('')
      setExpBackOffice(false)
      fetchData()
    } catch (error) {
      console.error(error)
      toast.error('Failed to add expense')
    } finally {
      setSubmittingExpense(false)
    }
  }

  async function handleAddPayout(e: React.FormEvent) {
    e.preventDefault()
    const salaryVal = Number(payoutSalary) || 0
    const scVal = Number(payoutSC) || 0
    const commissionVal = Number(payoutCommission) || 0

    if (!payoutEmployee) {
      toast.error('Please select an employee')
      return
    }
    if (salaryVal <= 0 && scVal <= 0 && commissionVal <= 0) {
      toast.error('Please enter at least one amount')
      return
    }

    setSubmittingPayout(true)
    try {
      const emp = employees.find((e) => e.id === payoutEmployee)
      const inserts: {
        date: string
        type: string
        amount: number
        employee_id: string
        category?: string
        description: string
        is_back_office: boolean
      }[] = []

      if (salaryVal > 0) {
        inserts.push({
          date: today,
          type: 'salary',
          amount: salaryVal,
          employee_id: payoutEmployee,
          category: 'salary',
          description: `Salary - ${emp?.name || 'Unknown'}`,
          is_back_office: payoutBackOffice,
        })
      }
      if (scVal > 0) {
        inserts.push({
          date: today,
          type: 'salary',
          amount: scVal,
          employee_id: payoutEmployee,
          category: 'service_charge',
          description: `Service Charge - ${emp?.name || 'Unknown'}`,
          is_back_office: payoutBackOffice,
        })
      }
      if (commissionVal > 0) {
        inserts.push({
          date: today,
          type: 'commission',
          amount: commissionVal,
          employee_id: payoutEmployee,
          description: `Commission - ${emp?.name || 'Unknown'}`,
          is_back_office: payoutBackOffice,
        })
      }

      const { error } = await supabase.from('transactions').insert(inserts)
      if (error) throw error

      toast.success('Payout recorded')
      setPayoutEmployee('')
      setPayoutSalary('')
      setPayoutSC('')
      setPayoutCommission('')
      setPayoutBackOffice(false)
      fetchData()
    } catch (error) {
      console.error(error)
      toast.error('Failed to record payout')
    } finally {
      setSubmittingPayout(false)
    }
  }

  async function handleQuickExpense(amountOverride?: number) {
    const amt = amountOverride ?? Number(quickAmount)
    if (!quickCategory || amt <= 0) return
    setSubmittingQuick(true)
    try {
      const labels: Record<string, string> = { food: 'Food', meds: 'Meds/Supplies', ads: 'Ads/Marketing' }
      const { error } = await supabase.from('transactions').insert({
        date: today,
        type: 'expense',
        amount: amt,
        category: quickCategory,
        description: labels[quickCategory] || quickCategory,
      })
      if (error) throw error
      saveQuickHistory(quickCategory, amt)
      toast.success(`${labels[quickCategory]} ${formatPeso(amt)} added`)
      setQuickCategory(null)
      setQuickAmount('')
      fetchData()
    } catch (error) {
      console.error(error)
      toast.error('Failed to add expense')
    } finally {
      setSubmittingQuick(false)
    }
  }

  const totalExpenses = transactions.reduce((sum, t) => sum + t.amount, 0)

  // Cash balance calculation
  const cashReceived = paymentSummary['cash'] || 0
  const cashExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)
  const cashPayouts = transactions
    .filter((t) => t.type === 'salary' || t.type === 'commission')
    .reduce((sum, t) => sum + t.amount, 0)
  const cashWithdrawals = transactions
    .filter((t) => t.type === 'withdrawal')
    .reduce((sum, t) => sum + t.amount, 0)
  const expectedCash = cashReceived - cashExpenses - cashPayouts - cashWithdrawals

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#40916C]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-4">
      {/* Payment Method Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="size-5 text-[#40916C]" />
            Payment Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PAYMENT_METHODS.map((pm) => (
              <div
                key={pm.value}
                className="rounded-lg border p-3 text-center"
              >
                <p className="text-xs text-muted-foreground">{pm.label}</p>
                <p className="text-lg font-bold text-[#1B4332]">
                  {formatPeso(paymentSummary[pm.value] || 0)}
                </p>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between rounded-lg bg-[#40916C]/10 p-3">
            <span className="text-sm font-medium">Expected Cash Balance</span>
            <span className="text-lg font-bold text-[#1B4332]">
              {formatPeso(expectedCash)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Quick Add */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Quick Add Expense</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-3">
            {[
              { key: 'food', label: '🍔 Food' },
              { key: 'meds', label: '💊 Meds' },
              { key: 'ads', label: '📢 Ads' },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => {
                  const next = quickCategory === item.key ? null : item.key
                  setQuickCategory(next)
                  setQuickAmount('')
                }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  quickCategory === item.key
                    ? 'bg-[#1B4332] text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {quickCategory && (
            <div className="space-y-2">
              {getQuickHistory(quickCategory).length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 self-center">Recent:</span>
                  {getQuickHistory(quickCategory).map(amt => (
                    <button
                      key={amt}
                      onClick={() => handleQuickExpense(amt)}
                      disabled={submittingQuick}
                      className="px-3 py-1 text-xs rounded-full bg-[#40916C]/10 text-[#1B4332] font-medium hover:bg-[#40916C]/20 transition-colors"
                    >
                      {formatPeso(amt)}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2 items-center">
                <span className="text-gray-400 text-sm">₱</span>
                <Input
                  type="number"
                  value={quickAmount}
                  onChange={(e) => setQuickAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') handleQuickExpense() }}
                />
                <Button
                  onClick={() => handleQuickExpense()}
                  disabled={submittingQuick || !quickAmount}
                  size="sm"
                  className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
                >
                  {submittingQuick ? <Loader2 className="size-4 animate-spin" /> : '✓'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Expense Entry */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-[#40916C]" />
            Quick Expense
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddExpense} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={expCategory} onValueChange={(v) => setExpCategory(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input
                value={expNote}
                onChange={(e) => setExpNote(e.target.value)}
                placeholder="Description..."
                className="h-8"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={expBackOffice} onChange={e => setExpBackOffice(e.target.checked)} className="rounded" />
                Back office (hidden from daily summary)
              </label>
              <Button
                type="submit"
                disabled={submittingExpense}
                className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
              >
                {submittingExpense ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Add Expense
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Salary / Commission Payout */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="size-5 text-[#40916C]" />
            Salary / Commission Payout
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAddPayout} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <Select
                value={payoutEmployee}
                onValueChange={(v) => setPayoutEmployee(v ?? '')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Salary</Label>
                <Input
                  type="number"
                  value={payoutSalary}
                  onChange={(e) => setPayoutSalary(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Service Charge</Label>
                <Input
                  type="number"
                  value={payoutSC}
                  onChange={(e) => setPayoutSC(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-8"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Commission</Label>
                <Input
                  type="number"
                  value={payoutCommission}
                  onChange={(e) => setPayoutCommission(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-8"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={payoutBackOffice} onChange={e => setPayoutBackOffice(e.target.checked)} className="rounded" />
                Back office
              </label>
              <Button
                type="submit"
                disabled={submittingPayout}
                className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
              >
                {submittingPayout ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Record Payout
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Today's Expenses Table */}
      <Card>
        <CardHeader>
          <CardTitle>Today&#39;s Expenses &amp; Payouts</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No expenses recorded today
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Category / Employee</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Description
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx) => {
                  const emp = employees.find((e) => e.id === tx.employee_id)
                  const catLabel =
                    EXPENSE_CATEGORIES.find((c) => c.value === tx.category)
                      ?.label || tx.category
                  return (
                    <TableRow key={tx.id}>
                      <TableCell>
                        <span className="capitalize">
                          {tx.type === 'salary' && tx.category === 'service_charge'
                            ? 'Service Charge'
                            : tx.type === 'withdrawal'
                            ? 'Owner Draw'
                            : tx.type}
                        </span>
                      </TableCell>
                      <TableCell>
                        {tx.type === 'expense'
                          ? catLabel
                          : tx.type === 'withdrawal'
                          ? 'Owner Draw'
                          : emp?.name || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPeso(tx.amount)}
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {tx.description || '-'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2} className="font-semibold">
                    Total
                  </TableCell>
                  <TableCell className="text-right font-bold">
                    {formatPeso(totalExpenses)}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell" />
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
