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
import { Trash2, Pencil } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
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
  { value: 'withdrawal', label: 'Owner Draws' },
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editTransaction, setEditTransaction] = useState<TransactionWithEmployee | null>(null)
  const [editForm, setEditForm] = useState({ amount: '', category: '', description: '', date: '' })
  const [editSaving, setEditSaving] = useState(false)

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

  const fetchTransactions = async () => {
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

  useEffect(() => {
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
    const totalWithdrawals = filtered.filter(t => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0)
    const net = totalSales - totalExpenses - totalSalary - totalCommission

    const medsExpenses = filtered
      .filter(t => t.type === 'expense' && t.category === 'meds')
      .reduce((s, t) => s + t.amount, 0)
    const nonMedsExpenses = totalExpenses - medsExpenses

    return { totalSales, totalExpenses, totalSalary, totalCommission, totalWithdrawals, net, medsExpenses, nonMedsExpenses }
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
      case 'withdrawal': return 'outline'
      default: return 'secondary'
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  const handleDeleteSelected = async () => {
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('transactions').delete().in('id', Array.from(selectedIds))
      if (error) throw error
      toast.success(`Deleted ${selectedIds.size} transaction(s)`)
      setSelectedIds(new Set())
      setDeleteDialogOpen(false)
      await fetchTransactions()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to delete transactions')
    } finally {
      setDeleting(false)
    }
  }

  const openEditTransaction = (txn: TransactionWithEmployee) => {
    setEditTransaction(txn)
    setEditForm({
      amount: String(txn.amount),
      category: txn.category || '',
      description: txn.description || '',
      date: txn.date,
    })
    setEditDialogOpen(true)
  }

  const handleEditTransaction = async () => {
    if (!editTransaction) return
    setEditSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase
        .from('transactions')
        .update({
          amount: Number(editForm.amount) || 0,
          category: editForm.category || null,
          description: editForm.description || null,
          date: editForm.date,
        })
        .eq('id', editTransaction.id)
      if (error) throw error
      toast.success('Transaction updated')
      setEditDialogOpen(false)
      setEditTransaction(null)
      await fetchTransactions()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update transaction')
    } finally {
      setEditSaving(false)
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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
        {summary.totalWithdrawals > 0 && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Owner Draws</p>
              <p className="text-lg font-bold text-purple-600">
                {formatCurrency(summary.totalWithdrawals)}
              </p>
              <p className="text-[10px] text-gray-400">Cash only, not in P&L</p>
            </CardContent>
          </Card>
        )}
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
                  <TableHead className="w-10">
                    <Checkbox
                      checked={filtered.length > 0 && selectedIds.size === filtered.length}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(txn => (
                  <TableRow key={txn.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(txn.id)}
                        onCheckedChange={() => toggleSelect(txn.id)}
                      />
                    </TableCell>
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
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEditTransaction(txn)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Floating Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-white border shadow-lg rounded-lg px-4 py-3 flex items-center gap-4 z-50">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteDialogOpen(true)}
          >
            <Trash2 className="size-3.5 mr-1" />
            Delete Selected
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear Selection
          </Button>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Transactions</DialogTitle>
            <DialogDescription>
              Delete {selectedIds.size} transaction(s)? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteSelected} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Transaction Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Transaction</DialogTitle>
            <DialogDescription>Update the transaction details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="edit-txn-date">Date</Label>
              <Input
                id="edit-txn-date"
                type="date"
                value={editForm.date}
                onChange={e => setEditForm(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-txn-amount">Amount</Label>
              <Input
                id="edit-txn-amount"
                type="number"
                value={editForm.amount}
                onChange={e => setEditForm(p => ({ ...p, amount: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit-txn-category">Category</Label>
              <Select value={editForm.category} onValueChange={v => setEditForm(p => ({ ...p, category: v ?? '' }))}>
                <SelectTrigger id="edit-txn-category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {EXPENSE_CATEGORIES.map(cat => (
                    <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="edit-txn-desc">Description</Label>
              <Input
                id="edit-txn-desc"
                value={editForm.description}
                onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleEditTransaction} disabled={editSaving}>
              {editSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
