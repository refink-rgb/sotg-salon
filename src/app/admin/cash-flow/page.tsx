'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, eachDayOfInterval, startOfMonth, endOfMonth, getDaysInMonth, isToday } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { MONTHS } from '@/lib/constants'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

  useEffect(() => {
    async function fetchData() {
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

    fetchData()
  }, [selectedMonth, selectedYear])

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
        <h1 className="text-2xl font-bold text-gray-900">Cash Flow</h1>
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
