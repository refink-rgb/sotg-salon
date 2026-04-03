'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { formatPeso, getToday } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, DollarSign, TrendingUp, UsersIcon, Loader2 } from 'lucide-react'
import type { Branch } from '@/types/database'

interface BranchStats {
  branch: Branch
  todaySales: number
  todayCustomers: number
  monthSales: number
  monthExpenses: number
}

export default function CorporateOverview() {
  const supabase = createClient()
  const today = getToday()
  const monthStart = today.slice(0, 7) + '-01'

  const [branches, setBranches] = useState<Branch[]>([])
  const [stats, setStats] = useState<BranchStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const { data: branchData } = await supabase
        .from('branches')
        .select('*')
        .eq('is_active', true)
        .order('name')

      const activeBranches = branchData || []
      setBranches(activeBranches)

      const branchStats: BranchStats[] = []

      for (const branch of activeBranches) {
        const [todaySalesRes, todayVisitsRes, monthSalesRes, monthExpensesRes] = await Promise.all([
          supabase
            .from('transactions')
            .select('amount')
            .eq('branch_id', branch.id)
            .eq('date', today)
            .eq('type', 'sale'),
          supabase
            .from('visits')
            .select('id', { count: 'exact', head: true })
            .eq('branch_id', branch.id)
            .eq('date', today)
            .eq('status', 'completed'),
          supabase
            .from('transactions')
            .select('amount')
            .eq('branch_id', branch.id)
            .gte('date', monthStart)
            .eq('type', 'sale'),
          supabase
            .from('transactions')
            .select('amount')
            .eq('branch_id', branch.id)
            .gte('date', monthStart)
            .in('type', ['expense', 'salary', 'commission']),
        ])

        branchStats.push({
          branch,
          todaySales: (todaySalesRes.data || []).reduce((s, t) => s + t.amount, 0),
          todayCustomers: todayVisitsRes.count ?? 0,
          monthSales: (monthSalesRes.data || []).reduce((s, t) => s + t.amount, 0),
          monthExpenses: (monthExpensesRes.data || []).reduce((s, t) => s + t.amount, 0),
        })
      }

      setStats(branchStats)
      setLoading(false)
    }

    fetchData()
  }, [])

  const totalTodaySales = stats.reduce((s, b) => s + b.todaySales, 0)
  const totalTodayCustomers = stats.reduce((s, b) => s + b.todayCustomers, 0)
  const totalMonthSales = stats.reduce((s, b) => s + b.monthSales, 0)
  const totalMonthExpenses = stats.reduce((s, b) => s + b.monthExpenses, 0)

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#40916C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Corporate Overview</h1>
        <p className="text-sm text-gray-500 mt-1">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Company Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Today&apos;s Sales (All)</CardTitle>
            <DollarSign className="size-4 text-[#40916C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatPeso(totalTodaySales)}</div>
            <p className="text-xs text-gray-400">{totalTodayCustomers} customers</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Month Sales (All)</CardTitle>
            <TrendingUp className="size-4 text-[#40916C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatPeso(totalMonthSales)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Month Expenses (All)</CardTitle>
            <DollarSign className="size-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{formatPeso(totalMonthExpenses)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Branches</CardTitle>
            <Building2 className="size-4 text-[#40916C]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{branches.length}</div>
            <p className="text-xs text-gray-400">active locations</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Branch Cards */}
      <h2 className="text-lg font-semibold text-gray-900">Branch Performance</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.map(({ branch, todaySales, todayCustomers, monthSales, monthExpenses }) => (
          <Card key={branch.id}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                <Building2 className="size-4 text-[#40916C]" />
                {branch.name}
              </CardTitle>
              {branch.address && <p className="text-xs text-gray-400">{branch.address}</p>}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs text-gray-500">Today&apos;s Sales</p>
                  <p className="text-lg font-bold text-[#1B4332]">{formatPeso(todaySales)}</p>
                  <p className="text-xs text-gray-400">{todayCustomers} customers</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-gray-500">Month Sales</p>
                  <p className="text-lg font-bold text-gray-900">{formatPeso(monthSales)}</p>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <p className="text-xs text-gray-500">Month Expenses</p>
                  <p className="text-lg font-bold text-red-600">{formatPeso(monthExpenses)}</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Month Net</p>
                  <p className={`text-lg font-bold ${monthSales - monthExpenses >= 0 ? 'text-[#1B4332]' : 'text-red-600'}`}>
                    {formatPeso(monthSales - monthExpenses)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
