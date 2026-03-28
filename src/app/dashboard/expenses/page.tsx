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
import type { Transaction, Employee } from '@/types/database'

export default function ExpensesPage() {
  const supabase = createClient()
  const today = new Date().toISOString().split('T')[0]

  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  // Expense form
  const [expCategory, setExpCategory] = useState('')
  const [expAmount, setExpAmount] = useState('')
  const [expNote, setExpNote] = useState('')
  const [submittingExpense, setSubmittingExpense] = useState(false)

  // Payout form
  const [payoutEmployee, setPayoutEmployee] = useState('')
  const [payoutType, setPayoutType] = useState<'salary' | 'commission'>('salary')
  const [payoutAmount, setPayoutAmount] = useState('')
  const [submittingPayout, setSubmittingPayout] = useState(false)

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
        .in('type', ['expense', 'salary', 'commission'])
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
      })
      if (error) throw error

      toast.success('Expense added')
      setExpCategory('')
      setExpAmount('')
      setExpNote('')
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
    if (!payoutEmployee || !payoutAmount || Number(payoutAmount) <= 0) {
      toast.error('Please select an employee and enter an amount')
      return
    }

    setSubmittingPayout(true)
    try {
      const emp = employees.find((e) => e.id === payoutEmployee)
      const { error } = await supabase.from('transactions').insert({
        date: today,
        type: payoutType,
        amount: Number(payoutAmount),
        employee_id: payoutEmployee,
        description: `${payoutType === 'salary' ? 'Salary' : 'Commission'} - ${emp?.name || 'Unknown'}`,
      })
      if (error) throw error

      toast.success('Payout recorded')
      setPayoutEmployee('')
      setPayoutAmount('')
      fetchData()
    } catch (error) {
      console.error(error)
      toast.error('Failed to record payout')
    } finally {
      setSubmittingPayout(false)
    }
  }

  function formatPHP(amount: number) {
    return `\u20B1${amount.toLocaleString()}`
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
  const expectedCash = cashReceived - cashExpenses - cashPayouts

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
                  {formatPHP(paymentSummary[pm.value] || 0)}
                </p>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between rounded-lg bg-[#40916C]/10 p-3">
            <span className="text-sm font-medium">Expected Cash Balance</span>
            <span className="text-lg font-bold text-[#1B4332]">
              {formatPHP(expectedCash)}
            </span>
          </div>
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
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={payoutType}
                  onValueChange={(val) =>
                    setPayoutType(val as 'salary' | 'commission')
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary">Salary</SelectItem>
                    <SelectItem value="commission">Commission</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Amount</Label>
              <Input
                type="number"
                value={payoutAmount}
                onChange={(e) => setPayoutAmount(e.target.value)}
                placeholder="0"
                min="0"
                className="h-8"
              />
            </div>
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
                        <span className="capitalize">{tx.type}</span>
                      </TableCell>
                      <TableCell>
                        {tx.type === 'expense'
                          ? catLabel
                          : emp?.name || '-'}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatPHP(tx.amount)}
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
                    {formatPHP(totalExpenses)}
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
