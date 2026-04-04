'use client'

import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/lib/branch-context'
import { formatPeso, getToday } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Building2, DollarSign, Users, TrendingUp } from 'lucide-react'
import type { Branch } from '@/types/database'

interface BranchStats {
  branch: Branch
  todaySales: number
  todayCustomers: number
  monthSales: number
  monthExpenses: number
}

export default function CorporateOverviewPage() {
  const supabase = createClient()
  const { branches, loading: branchLoading } = useBranch()
  const [stats, setStats] = useState<BranchStats[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchStats() {
      if (branches.length === 0) return

      const today = getToday()
      const monthStart = today.slice(0, 7) + '-01'
      const results: BranchStats[] = []

      for (const branch of branches) {
        const [salesRes, custRes, monthSalesRes, monthExpRes] = await Promise.all([
          supabase.from('transactions').select('amount').eq('branch_id', branch.id).eq('date', today).eq('type', 'sale'),
          supabase.from('visits').select('id', { count: 'exact', head: true }).eq('branch_id', branch.id).eq('date', today).eq('status', 'completed'),
          supabase.from('transactions').select('amount').eq('branch_id', branch.id).gte('date', monthStart).eq('type', 'sale'),
          supabase.from('transactions').select('amount').eq('branch_id', branch.id).gte('date', monthStart).in('type', ['expense', 'salary', 'commission']),
        ])

        results.push({
          branch,
          todaySales: (salesRes.data || []).reduce((s, t) => s + t.amount, 0),
          todayCustomers: custRes.count || 0,
          monthSales: (monthSalesRes.data || []).reduce((s, t) => s + t.amount, 0),
          monthExpenses: (monthExpRes.data || []).reduce((s, t) => s + t.amount, 0),
        })
      }

      setStats(results)
      setLoading(false)
    }

    if (!branchLoading) fetchStats()
  }, [branches, branchLoading])

  const totalTodaySales = stats.reduce((s, b) => s + b.todaySales, 0)
  const totalTodayCustomers = stats.reduce((s, b) => s + b.todayCustomers, 0)
  const totalMonthSales = stats.reduce((s, b) => s + b.monthSales, 0)
  const totalMonthExpenses = stats.reduce((s, b) => s + b.monthExpenses, 0)

  if (loading || branchLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-amber-600" />
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-gray-500"><DollarSign className="size-4" /> Today's Sales</div>
            <p className="text-2xl font-bold text-[#1B4332] mt-1">{formatPeso(totalTodaySales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-gray-500"><Users className="size-4" /> Today's Customers</div>
            <p className="text-2xl font-bold text-[#1B4332] mt-1">{totalTodayCustomers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-gray-500"><TrendingUp className="size-4" /> Month Sales</div>
            <p className="text-2xl font-bold text-[#1B4332] mt-1">{formatPeso(totalMonthSales)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-sm text-gray-500"><DollarSign className="size-4" /> Month Expenses</div>
            <p className="text-2xl font-bold text-red-600 mt-1">{formatPeso(totalMonthExpenses)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-Branch Cards */}
      <h2 className="text-lg font-semibold text-gray-900">Branches</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {stats.map(({ branch, todaySales, todayCustomers, monthSales, monthExpenses }) => (
          <Card key={branch.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="size-4 text-amber-600" />
                  {branch.name}
                </CardTitle>
                <Badge variant="outline" className="text-xs">{branch.slug}</Badge>
              </div>
              {branch.address && <p className="text-xs text-gray-400">{branch.address}</p>}
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-green-50 p-3">
                  <p className="text-xs text-gray-500">Today</p>
                  <p className="text-lg font-bold text-[#1B4332]">{formatPeso(todaySales)}</p>
                  <p className="text-xs text-gray-400">{todayCustomers} customers</p>
                </div>
                <div className="rounded-lg bg-blue-50 p-3">
                  <p className="text-xs text-gray-500">This Month</p>
                  <p className="text-lg font-bold text-blue-800">{formatPeso(monthSales)}</p>
                  <p className="text-xs text-gray-400">{formatPeso(monthExpenses)} expenses</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
