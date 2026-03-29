'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDaysInMonth, isToday } from 'date-fns'
import { CreditCard, Loader2, Plus, Copy } from 'lucide-react'
import { copyTableToClipboard } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { MONTHS } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { toast } from 'sonner'
import type { Transaction } from '@/types/database'

function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `(₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function CashFlowPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  // Withdrawal form
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])
  const [wdPartner, setWdPartner] = useState('')
  const [wdAmount, setWdAmount] = useState('')
  const [wdDate, setWdDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [wdNote, setWdNote] = useState('')
  const [submittingWd, setSubmittingWd] = useState(false)
  const [wdBackOffice, setWdBackOffice] = useState(false)

  const fetchData = async () => {
    setLoading(true)
    const supabase = createClient()
    const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
    const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth))
    const monthStart = `${monthStr}-01`
    const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`

    try {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date')

      if (error) throw error
      setTransactions(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load cash flow data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [selectedMonth, selectedYear])

  // Fetch partners once on mount
  useEffect(() => {
    async function loadPartners() {
      const supabase = createClient()
      const { data } = await supabase
        .from('partners')
        .select('id, name')
        .eq('is_active', true)
        .order('name')
      setPartners(data || [])
    }
    loadPartners()
  }, [])

  async function handleWithdrawal(e: React.FormEvent) {
    e.preventDefault()
    const amt = Number(wdAmount) || 0
    if (amt <= 0) {
      toast.error('Please enter a withdrawal amount')
      return
    }

    setSubmittingWd(true)
    try {
      const supabase = createClient()
      const partnerName = partners.find(p => p.id === wdPartner)?.name || 'Owner'
      const { error } = await supabase.from('transactions').insert({
        date: wdDate,
        type: 'withdrawal',
        amount: amt,
        category: 'owner_draw',
        description: wdNote.trim() || `Owner withdrawal - ${partnerName}`,
        is_back_office: wdBackOffice,
      })
      if (error) throw error

      toast.success('Withdrawal recorded')
      setWdPartner('')
      setWdAmount('')
      setWdNote('')
      setWdDate(format(new Date(), 'yyyy-MM-dd'))
      await fetchData()
    } catch (error) {
      console.error(error)
      toast.error('Failed to record withdrawal')
    } finally {
      setSubmittingWd(false)
    }
  }

  const dailyData = useMemo(() => {
    const monthDate = new Date(selectedYear, selectedMonth, 1)
    const days = eachDayOfInterval({
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    })

    let runningBalance = 0
    return days.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const dayTxns = transactions.filter(t => t.date === dateStr)

      const cashIn = dayTxns
        .filter(t => t.type === 'sale')
        .reduce((s, t) => s + t.amount, 0)

      const cashOut = dayTxns
        .filter(t => t.type === 'expense' || t.type === 'salary' || t.type === 'commission' || t.type === 'withdrawal')
        .reduce((s, t) => s + t.amount, 0)

      runningBalance += cashIn - cashOut

      return {
        date: day,
        dateStr,
        dayName: DAY_NAMES[day.getDay()],
        cashIn,
        cashOut,
        net: cashIn - cashOut,
        runningBalance,
        isToday: isToday(day),
      }
    })
  }, [transactions, selectedMonth, selectedYear])

  const summary = useMemo(() => {
    const totalIn = dailyData.reduce((s, d) => s + d.cashIn, 0)
    const totalOut = dailyData.reduce((s, d) => s + d.cashOut, 0)
    return {
      openingBalance: 0,
      totalIn,
      totalOut,
      closingBalance: totalIn - totalOut,
    }
  }, [dailyData])

  const currentYr = now.getFullYear()
  const years = Array.from({ length: 3 }, (_, i) => currentYr - 1 + i)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow</h1>
          <Button variant="outline" size="sm" onClick={async () => {
            const headers = ['Date', 'Day', 'Cash In', 'Cash Out', 'Balance']
            const rows = dailyData.map(d => [format(d.date, 'yyyy-MM-dd'), d.dayName, String(d.cashIn), String(d.cashOut), String(d.runningBalance)])
            await copyTableToClipboard(headers, rows)
            toast.success(`Copied ${rows.length} days`)
          }}>
            <Copy className="size-3.5 mr-1" /> Copy
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={MONTHS[selectedMonth]} onValueChange={v => setSelectedMonth(MONTHS.indexOf(v as typeof MONTHS[number]))}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Owner Withdrawal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-[#40916C]" />
            Owner Withdrawal
          </CardTitle>
          <p className="text-xs text-gray-500">Cash draw only — does not appear in P&L</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleWithdrawal} className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5">
                <Label>Date</Label>
                <Input
                  type="date"
                  value={wdDate}
                  onChange={(e) => setWdDate(e.target.value)}
                  className="h-9"
                />
              </div>
              {partners.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Partner</Label>
                  <Select
                    value={wdPartner}
                    onValueChange={(v) => setWdPartner(v ?? '')}
                  >
                    <SelectTrigger className="w-full h-9">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {partners.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Amount</Label>
                <Input
                  type="number"
                  value={wdAmount}
                  onChange={(e) => setWdAmount(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Note</Label>
                <Input
                  value={wdNote}
                  onChange={(e) => setWdNote(e.target.value)}
                  placeholder="Optional note..."
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={wdBackOffice} onChange={e => setWdBackOffice(e.target.checked)} className="rounded" />
                Back office (hidden from stylist)
              </label>
              <Button
                type="submit"
                disabled={submittingWd}
                className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
              >
                {submittingWd ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Plus className="size-4" />
                )}
                Record Withdrawal
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Opening Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold">{formatCurrency(summary.openingBalance)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Cash In</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-green-700">{formatCurrency(summary.totalIn)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Total Cash Out</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xl font-bold text-red-600">{formatCurrency(summary.totalOut)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Closing Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-xl font-bold ${summary.closingBalance < 0 ? 'text-red-600' : 'text-[#1B4332]'}`}>
              {formatCurrency(summary.closingBalance)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Daily Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead className="text-right">Cash In</TableHead>
                  <TableHead className="text-right">Cash Out</TableHead>
                  <TableHead className="text-right">Running Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyData.map(row => (
                  <TableRow
                    key={row.dateStr}
                    className={row.isToday ? 'bg-yellow-50 font-semibold' : ''}
                  >
                    <TableCell>
                      {format(row.date, 'MMM d')}
                      {row.isToday && <span className="ml-2 text-xs text-yellow-700">(Today)</span>}
                    </TableCell>
                    <TableCell className="text-gray-500">{row.dayName}</TableCell>
                    <TableCell className={`text-right ${row.cashIn > 0 ? 'text-green-700' : ''}`}>
                      {row.cashIn > 0 ? formatCurrency(row.cashIn) : '-'}
                    </TableCell>
                    <TableCell className={`text-right ${row.cashOut > 0 ? 'text-red-600' : ''}`}>
                      {row.cashOut > 0 ? formatCurrency(row.cashOut) : '-'}
                    </TableCell>
                    <TableCell className={`text-right font-medium ${row.runningBalance < 0 ? 'text-red-600' : ''}`}>
                      {formatCurrency(row.runningBalance)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
