'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  UsersIcon,
  FileText,
  Users,
  Upload,
  BarChart3,
  CreditCard,
  Loader2,
  Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import type { Transaction, Visit } from '@/types/database'

function formatCurrency(amount: number): string {
  return `₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function AdminDashboard() {
  const supabase = createClient()

  const [todaySales, setTodaySales] = useState(0)
  const [monthSales, setMonthSales] = useState(0)
  const [monthExpenses, setMonthExpenses] = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Withdrawal form
  const [partners, setPartners] = useState<{ id: string; name: string }[]>([])
  const [wdPartner, setWdPartner] = useState('')
  const [wdAmount, setWdAmount] = useState('')
  const [wdDate, setWdDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [wdNote, setWdNote] = useState('')
  const [submittingWd, setSubmittingWd] = useState(false)

  useEffect(() => {
    async function fetchData() {
      const today = format(new Date(), 'yyyy-MM-dd')
      const monthStart = format(new Date(), 'yyyy-MM-01')

      try {
        // Today's sales
        const { data: todayTxns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('type', 'sale')
          .eq('date', today)

        setTodaySales(
          (todayTxns ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)
        )

        // This month's sales
        const { data: monthSaleTxns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('type', 'sale')
          .gte('date', monthStart)

        setMonthSales(
          (monthSaleTxns ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)
        )

        // This month's expenses
        const { data: monthExpTxns } = await supabase
          .from('transactions')
          .select('amount')
          .in('type', ['expense', 'salary', 'commission'])
          .gte('date', monthStart)

        setMonthExpenses(
          (monthExpTxns ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)
        )

        // Customer count this month (completed visits)
        const { count } = await supabase
          .from('visits')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'completed')
          .gte('date', monthStart)

        setCustomerCount(count ?? 0)

        // Fetch partners
        const { data: partnerData } = await supabase
          .from('partners')
          .select('id, name')
          .eq('is_active', true)
          .order('name')
        setPartners(partnerData || [])
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
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
      const partnerName = partners.find(p => p.id === wdPartner)?.name || 'Owner'
      const { error } = await supabase.from('transactions').insert({
        date: wdDate,
        type: 'withdrawal',
        amount: amt,
        category: 'owner_draw',
        description: wdNote.trim() || `Owner withdrawal - ${partnerName}`,
      })
      if (error) throw error

      toast.success('Withdrawal recorded')
      setWdPartner('')
      setWdAmount('')
      setWdNote('')
      setWdDate(format(new Date(), 'yyyy-MM-dd'))
    } catch (error) {
      console.error(error)
      toast.error('Failed to record withdrawal')
    } finally {
      setSubmittingWd(false)
    }
  }

  const quickLinks = [
    { href: '/admin/income-statement', label: 'Income Statement', icon: FileText, desc: 'Monthly P&L view' },
    { href: '/admin/payroll', label: 'Payroll', icon: Users, desc: 'Employee pay & attendance' },
    { href: '/admin/cash-flow', label: 'Cash Flow', icon: BarChart3, desc: 'Daily cash tracking' },
    { href: '/admin/forecasting', label: 'Forecasting', icon: TrendingUp, desc: 'Projections & what-if' },
    { href: '/admin/import', label: 'Import Data', icon: Upload, desc: 'Bulk import from CSV' },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Today&apos;s Sales</CardTitle>
            <DollarSign className="size-4 text-[#40916C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {loading ? '...' : formatCurrency(todaySales)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Month Sales</CardTitle>
            <TrendingUp className="size-4 text-[#40916C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {loading ? '...' : formatCurrency(monthSales)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Month Expenses</CardTitle>
            <TrendingDown className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {loading ? '...' : formatCurrency(monthExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Customers This Month</CardTitle>
            <UsersIcon className="size-4 text-[#40916C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {loading ? '...' : customerCount}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Owner Withdrawal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="size-5 text-[#40916C]" />
            Owner Withdrawal
          </CardTitle>
          <p className="text-xs text-gray-500">Cash draw only — does not appear in P&L or expenses</p>
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
          </form>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quickLinks.map((link) => {
            const Icon = link.icon
            return (
              <Link key={link.href} href={link.href}>
                <Card className="hover:ring-[#40916C]/30 hover:ring-2 transition-all cursor-pointer">
                  <CardContent className="flex items-center gap-3 pt-0">
                    <div className="p-2 rounded-lg bg-[#1B4332]/10">
                      <Icon className="size-5 text-[#1B4332]" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{link.label}</p>
                      <p className="text-xs text-gray-500">{link.desc}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
