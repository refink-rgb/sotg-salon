'use client'

import { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/lib/branch-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatPeso, getToday } from '@/lib/utils'

export default function AdminDashboard() {
  const supabase = createClient()
  const { branchId, loading: branchLoading } = useBranch()

  const [todaySales, setTodaySales] = useState(0)
  const [monthSales, setMonthSales] = useState(0)
  const [monthExpenses, setMonthExpenses] = useState(0)
  const [customerCount, setCustomerCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      if (!branchId) return
      const today = getToday()
      const monthStart = format(new Date(), 'yyyy-MM-01')

      try {
        // Today's sales
        const { data: todayTxns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('branch_id', branchId)
          .eq('type', 'sale')
          .eq('date', today)

        setTodaySales(
          (todayTxns ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)
        )

        // This month's sales
        const { data: monthSaleTxns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('branch_id', branchId)
          .eq('type', 'sale')
          .gte('date', monthStart)

        setMonthSales(
          (monthSaleTxns ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)
        )

        // This month's expenses
        const { data: monthExpTxns } = await supabase
          .from('transactions')
          .select('amount')
          .eq('branch_id', branchId)
          .in('type', ['expense', 'salary', 'commission'])
          .gte('date', monthStart)

        setMonthExpenses(
          (monthExpTxns ?? []).reduce((sum: number, t: { amount: number }) => sum + t.amount, 0)
        )

        // Customer count this month (completed visits)
        const { count } = await supabase
          .from('visits')
          .select('id', { count: 'exact', head: true })
          .eq('branch_id', branchId)
          .eq('status', 'completed')
          .gte('date', monthStart)

        setCustomerCount(count ?? 0)

      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [branchId])

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
              {loading ? '...' : formatPeso(todaySales)}
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
              {loading ? '...' : formatPeso(monthSales)}
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
              {loading ? '...' : formatPeso(monthExpenses)}
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
