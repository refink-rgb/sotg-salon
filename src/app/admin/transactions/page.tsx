'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/lib/constants'
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subWeeks,
  subMonths,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { toast } from 'sonner'
import type { Transaction } from '@/types/database'

function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `(₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

const TYPE_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'sale', label: 'Sales' },
  { value: 'expense', label: 'Expenses' },
  { value: 'salary', label: 'Salary' },
  { value: 'commission', label: 'Commission' },
] as const

type TypeFilter = (typeof TYPE_OPTIONS)[number]['value']

interface TransactionWithEmployee extends Transaction {
  employee?: { name: string } | null
}

export default function TransactionsPage() {
  const now = new Date()
  const [dateFrom, setDateFrom] = useState(formatDateInput(startOfMonth(now)))
  const [dateTo, setDateTo] = useState(formatDateInput(endOfMonth(now)))
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set())
  const [transactions, setTransactions] = useState<TransactionWithEmployee[]>([])
  const [loading, setLoading] = useState(true)

  function applyPreset(preset: string) {
    const today = new Date()
    switch (preset) {
      case 'this_week':
        setDateFrom(formatDateInput(startOfWeek(today, { weekStartsOn: 1 })))
        setDateTo(formatDateInput(endOfWeek(today, { weekStartsOn: 1 })))
        break
      case 'last_week': {
        const lastWeek = subWeeks(today, 1)
        setDateFrom(formatDateInput(startOfWeek(lastWeek, { weekStartsOn: 1 })))
        setDateTo(formatDateInput(endOfWeek(lastWeek, { weekStartsOn: 1 })))
        break
      }
      case 'this_month':
        setDateFrom(formatDateInput(startOfMonth(today)))
        setDateTo(formatDateInput(endOfMonth(today)))
        break
      case 'last_month': {
        const lastMonth = subMonths(today, 1)
        setDateFrom(formatDateInput(startOfMonth(lastMonth)))
        setDateTo(formatDateInput(endOfMonth(lastMonth)))
        break
      }
      case 'this_year':
        setDateFrom(formatDateInput(startOfYear(today)))
        setDateTo(formatDateInput(endOfYear(today)))
        break
    }
  }

  useEffect(() => {
    async function fetchTransactions() {
      setLoading(true)
      const supabase = createClient()

      try {
        let query = supabase
          .from('transactions')
          .select('*, employee:employees(name)')
          .gte('date', dateFrom)
          .lte('date', dateTo)
          .order('date', { ascending: false })

        if (typeFilter !== 'all') {
          query = query.eq('type', typeFilter)
        }

        const { data, error } = await query

        if (error) throw error
        setTransactions((data as TransactionWithEmployee[]) ?? [])
      } catch (error) {
        console.error('Error:', error)
        toast.error('Failed to load transactions')
      } finally {
        setLoading(false)
      }
    }

    fetchTransactions()
  }, [dateFrom, dateTo, typeFilter])

  function toggleCategory(cat: string) {
    setCategoryFilters(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    if (categoryFilters.size === 0 || typeFilter !== 'expense') return transactions
    return transactions.filter(t => t.category && categoryFilters.has(t.category))
  }, [transactions, categoryFilters, typeFilter])

  const summary = useMemo(() => {
    const totalSales = filtered.filter(t => t.type === 'sale').reduce((s, t) => s + t.amount, 0)
    const totalExpenses = filtered.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0)
    const totalSalary = filtered.filter(t => t.type === 'salary').reduce((s, t) => s + t.amount, 0)
    const totalCommission = filtered.filter(t => t.type === 'commission').reduce((s, t) => s + t.amount, 0)
    const net = totalSales - totalExpenses - totalSalary - totalCommission

    const medsExpenses = filtered
      .filter(t => t.type === 'expense' && t.category === 'meds')
      .reduce((s, t) => s + t.amount, 0)
    const nonMedsExpenses = totalExpenses - medsExpenses

    return { totalSales, totalExpenses, totalSalary, totalCommission, net, medsExpenses, nonMedsExpenses }
  }, [filtered])

  const paymentMethodLabel = (method: string | null) => {
    if (!method) return '-'
    const found = PAYMENT_METHODS.find(p => p.value === method)
    return found ? found.label : method
  }

  const categoryLabel = (category: string | null) => {
    if (!category) return '-'
    const found = EXPENSE_CATEGORIES.find(c => c.value === category)
    return found ? found.label : category
  }

  const typeBadgeVariant = (type: string): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (type) {
      case 'sale': return 'default'
      case 'expense': return 'destructive'
      case 'salary': return 'secondary'
      case 'commission': return 'outline'
      default: return 'secondary'
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Transaction Explorer</h1>

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Date range and presets */}
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs text-gray-500">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {[
                { key: 'this_week', label: 'This Week' },
                { key: 'last_week', label: 'Last Week' },
                { key: 'this_month', label: 'This Month' },
                { key: 'last_month', label: 'Last Month' },
                { key: 'this_year', label: 'This Year' },
              ].map(preset => (
                <Button
                  key={preset.key}
                  variant="outline"
                  size="sm"
                  onClick={() => applyPreset(preset.key)}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Type filter */}
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map(opt => (
              <Button
                key={opt.value}
                variant={typeFilter === opt.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(opt.value)}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* Category filter (when Expenses selected) */}
          {typeFilter === 'expense' && (
            <div className="flex flex-wrap gap-3">
              {EXPENSE_CATEGORIES.map(cat => (
                <label key={cat.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={categoryFilters.has(cat.value)}
                    onCheckedChange={() => toggleCategory(cat.value)}
                  />
                  {cat.label}
                </label>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Sales</p>
            <p className="text-lg font-bold text-green-700">{formatCurrency(summary.totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Expenses</p>
            <p className="text-lg font-bold text-red-600">{formatCurrency(summary.totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Salary / Commission</p>
            <p className="text-lg font-bold text-orange-600">
              {formatCurrency(summary.totalSalary + summary.totalCommission)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Net</p>
            <p className={`text-lg font-bold ${summary.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatCurrency(summary.net)}
            </p>
          </CardContent>
        </Card>
        {typeFilter === 'expense' && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Meds / Non-Meds</p>
              <p className="text-sm font-medium">
                {formatCurrency(summary.medsExpenses)} / {formatCurrency(summary.nonMedsExpenses)}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Results Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No transactions found for the selected filters.</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Employee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(txn => (
                  <TableRow key={txn.id}>
                    <TableCell>{format(new Date(txn.date), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <Badge variant={typeBadgeVariant(txn.type)}>
                        {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>{categoryLabel(txn.category)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{txn.description || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(txn.amount)}</TableCell>
                    <TableCell>{paymentMethodLabel(txn.payment_method)}</TableCell>
                    <TableCell>{txn.employee?.name || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
