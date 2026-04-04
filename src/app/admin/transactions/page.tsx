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
import { Trash2, Pencil, ChevronUp, ChevronDown, ArrowUpDown, Plus, Loader2, Copy } from 'lucide-react'
import { copyTableToClipboard, formatPeso } from '@/lib/utils'
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
import { useBranch } from '@/lib/branch-context'


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
  const { branchId } = useBranch()
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
  const [searchQuery, setSearchQuery] = useState('')
  const [sortField, setSortField] = useState<'date' | 'amount'>('date')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  // New Transaction dialog
  const [newTxnOpen, setNewTxnOpen] = useState(false)
  const [newTxnSaving, setNewTxnSaving] = useState(false)
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [newTxn, setNewTxn] = useState({
    date: formatDateInput(new Date()),
    type: 'sale' as 'sale' | 'expense' | 'salary' | 'commission' | 'withdrawal',
    amount: '',
    category: '',
    employee_id: '',
    payment_method: '',
    description: '',
    is_back_office: false,
  })

  // Fetch employees on mount / branch change
  useEffect(() => {
    async function loadEmployees() {
      if (!branchId) return
      const supabase = createClient()
      const { data } = await supabase
        .from('employees')
        .select('id, name')
        .eq('branch_id', branchId)
        .eq('is_active', true)
        .order('name')
      setEmployees(data || [])
    }
    loadEmployees()
  }, [branchId])

  async function handleNewTransaction(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(newTxn.amount) || 0
    if (amt <= 0) {
      toast.error('Please enter an amount')
      return
    }

    setNewTxnSaving(true)
    try {
      const supabase = createClient()
      const row: Record<string, unknown> = {
        date: newTxn.date,
        type: newTxn.type,
        amount: amt,
        description: newTxn.description.trim() || null,
        is_back_office: newTxn.is_back_office,
        branch_id: branchId,
      }

      if (newTxn.type === 'expense' && newTxn.category) {
        row.category = newTxn.category
      }
      if (newTxn.type === 'withdrawal') {
        row.category = 'owner_draw'
      }
      if ((newTxn.type === 'salary' || newTxn.type === 'commission') && newTxn.employee_id) {
        row.employee_id = newTxn.employee_id
      }
      if (newTxn.type === 'sale' && newTxn.payment_method) {
        row.payment_method = newTxn.payment_method
      }

      const { error } = await supabase.from('transactions').insert(row)
      if (error) throw error

      toast.success('Transaction created')
      setNewTxnOpen(false)
      setNewTxn({
        date: formatDateInput(new Date()),
        type: 'sale',
        amount: '',
        category: '',
        employee_id: '',
        payment_method: '',
        description: '',
        is_back_office: false,
      })
      await fetchTransactions()
    } catch (error) {
      console.error(error)
      toast.error('Failed to create transaction')
    } finally {
      setNewTxnSaving(false)
    }
  }

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
    if (!branchId) return
    setLoading(true)
    const supabase = createClient()

    try {
      let query = supabase
        .from('transactions')
        .select('*, employee:employees(name)')
        .eq('branch_id', branchId)
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
  }, [dateFrom, dateTo, typeFilter, branchId])

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
    let result = transactions

    // Category filter (only when viewing expenses)
    if (typeFilter === 'expense' && categoryFilters.size > 0) {
      result = result.filter(t => t.category && categoryFilters.has(t.category))
    }

    // Description search filter
    if (searchQuery.trim()) {
      const query = searchQuery.trim().toLowerCase()
      result = result.filter(t => t.description?.toLowerCase().includes(query))
    }

    // Sorting
    result = [...result].sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = a.date.localeCompare(b.date)
      } else {
        cmp = a.amount - b.amount
      }
      return sortDirection === 'asc' ? cmp : -cmp
    })

    return result
  }, [transactions, categoryFilters, typeFilter, searchQuery, sortField, sortDirection])

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

  const toggleSort = (field: 'date' | 'amount') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'date' ? 'desc' : 'desc')
    }
  }

  const SortIcon = ({ field }: { field: 'date' | 'amount' }) => {
    if (sortField !== field) return <ArrowUpDown className="inline size-3.5 ml-1 text-gray-400" />
    return sortDirection === 'asc'
      ? <ChevronUp className="inline size-3.5 ml-1" />
      : <ChevronDown className="inline size-3.5 ml-1" />
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
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Transaction Explorer</h1>
          <Button variant="outline" size="sm" onClick={async () => {
            const headers = ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment', 'Employee']
            const rows = filtered.map(t => [t.date, t.type, t.category || '', t.description || '', String(t.amount), t.payment_method || '', (t as any).employee?.name || ''])
            await copyTableToClipboard(headers, rows)
            toast.success(`Copied ${rows.length} transactions`)
          }}>
            <Copy className="size-3.5 mr-1" /> Copy
          </Button>
        </div>
        <Button
          onClick={() => setNewTxnOpen(true)}
          className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
        >
          <Plus className="size-4 mr-1" />
          New Transaction
        </Button>
      </div>

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
            <div>
              <Label className="text-xs text-gray-500">Search description</Label>
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-48"
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
            <p className="text-lg font-bold text-green-700">{formatPeso(summary.totalSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Total Expenses</p>
            <p className="text-lg font-bold text-red-600">{formatPeso(summary.totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Salary / Commission</p>
            <p className="text-lg font-bold text-orange-600">
              {formatPeso(summary.totalSalary + summary.totalCommission)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-gray-500">Net</p>
            <p className={`text-lg font-bold ${summary.net >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {formatPeso(summary.net)}
            </p>
          </CardContent>
        </Card>
        {summary.totalWithdrawals > 0 && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-gray-500">Owner Draws</p>
              <p className="text-lg font-bold text-purple-600">
                {formatPeso(summary.totalWithdrawals)}
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
                {formatPeso(summary.medsExpenses)} / {formatPeso(summary.nonMedsExpenses)}
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
                  <TableHead
                    className="cursor-pointer select-none hover:bg-gray-50"
                    onClick={() => toggleSort('date')}
                  >
                    Date <SortIcon field="date" />
                  </TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead
                    className="text-right cursor-pointer select-none hover:bg-gray-50"
                    onClick={() => toggleSort('amount')}
                  >
                    Amount <SortIcon field="amount" />
                  </TableHead>
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
                      <div className="flex items-center gap-1">
                        <Badge variant={typeBadgeVariant(txn.type)}>
                          {txn.type.charAt(0).toUpperCase() + txn.type.slice(1)}
                        </Badge>
                        {txn.is_back_office && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0 text-gray-400 border-gray-300">BO</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{categoryLabel(txn.category)}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{txn.description || '-'}</TableCell>
                    <TableCell className="text-right font-medium">{formatPeso(txn.amount)}</TableCell>
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

      {/* New Transaction Dialog */}
      <Dialog open={newTxnOpen} onOpenChange={setNewTxnOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Transaction</DialogTitle>
            <DialogDescription>Create a new transaction record.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleNewTransaction} className="space-y-4 py-2">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={newTxn.date}
                onChange={e => setNewTxn(p => ({ ...p, date: e.target.value }))}
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select
                value={newTxn.type}
                onValueChange={v => setNewTxn(p => ({
                  ...p,
                  type: v as typeof newTxn.type,
                  category: '',
                  employee_id: '',
                  payment_method: '',
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Sale</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                  <SelectItem value="commission">Commission</SelectItem>
                  <SelectItem value="withdrawal">Withdrawal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                value={newTxn.amount}
                onChange={e => setNewTxn(p => ({ ...p, amount: e.target.value }))}
                placeholder="0"
                min="0"
              />
            </div>
            {newTxn.type === 'expense' && (
              <div>
                <Label>Category</Label>
                <Select value={newTxn.category} onValueChange={v => setNewTxn(p => ({ ...p, category: v ?? '' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(newTxn.type === 'salary' || newTxn.type === 'commission') && (
              <div>
                <Label>Employee</Label>
                <Select value={newTxn.employee_id} onValueChange={v => setNewTxn(p => ({ ...p, employee_id: v ?? '' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>{emp.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {newTxn.type === 'sale' && (
              <div>
                <Label>Payment Method</Label>
                <Select value={newTxn.payment_method} onValueChange={v => setNewTxn(p => ({ ...p, payment_method: v ?? '' }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map(pm => (
                      <SelectItem key={pm.value} value={pm.value}>{pm.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Description</Label>
              <Input
                value={newTxn.description}
                onChange={e => setNewTxn(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewTxnOpen(false)}>Cancel</Button>
              <label className="flex items-center gap-2 text-sm text-gray-500 cursor-pointer">
                <input type="checkbox" checked={newTxn.is_back_office} onChange={e => setNewTxn(p => ({ ...p, is_back_office: e.target.checked }))} className="rounded" />
                Back office (hidden from stylist daily summary)
              </label>
              <Button
                type="submit"
                disabled={newTxnSaving}
                className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
              >
                {newTxnSaving ? (
                  <Loader2 className="size-4 animate-spin mr-1" />
                ) : (
                  <Plus className="size-4 mr-1" />
                )}
                Create Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
