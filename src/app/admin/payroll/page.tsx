'use client'

import { useEffect, useState, useMemo } from 'react'
import { format, getDaysInMonth, startOfMonth, eachDayOfInterval, endOfMonth } from 'date-fns'
import { createClient } from '@/lib/supabase/client'
import { MONTHS } from '@/lib/constants'
import { calculateCommission, calculateServiceCharges } from '@/lib/commission'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell, TableFooter } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ChevronDown, ChevronUp, Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Employee, DailyAttendance, Transaction, Visit } from '@/types/database'
import type { CommissionResult } from '@/lib/commission'

function formatCurrency(amount: number): string {
  if (amount < 0) {
    return `(₱${Math.abs(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`
  }
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

interface PayrollRow extends CommissionResult {
  advances: number
  remaining: number
}

export default function PayrollPage() {
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth())
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [employees, setEmployees] = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<DailyAttendance[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)

  // Add Employee dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newEmp, setNewEmp] = useState({
    name: '',
    daily_rate: '',
    commission_per_head_rate: '',
    commission_percentage: '',
    is_in_service_charge_pool: true,
  })
  const [saving, setSaving] = useState(false)

  // Settings
  const [scThreshold, setScThreshold] = useState(3000)
  const [scAmount, setScAmount] = useState(100)
  const [bonusAmount, setBonusAmount] = useState(100)

  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const supabase = createClient()
      const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
      const monthStart = `${monthStr}-01`
      const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth))
      const monthEnd = `${monthStr}-${String(daysInMonth).padStart(2, '0')}`

      try {
        const [empRes, attRes, txnRes, visitRes, settingsRes] = await Promise.all([
          supabase.from('employees').select('*').order('name'),
          supabase.from('daily_attendance').select('*').gte('date', monthStart).lte('date', monthEnd),
          supabase.from('transactions').select('*').gte('date', monthStart).lte('date', monthEnd),
          supabase.from('visits').select('*').eq('status', 'completed').gte('date', monthStart).lte('date', monthEnd),
          supabase.from('app_settings').select('*'),
        ])

        if (empRes.error) throw empRes.error
        if (attRes.error) throw attRes.error
        if (txnRes.error) throw txnRes.error
        if (visitRes.error) throw visitRes.error

        setEmployees(empRes.data ?? [])
        setAttendance(attRes.data ?? [])
        setTransactions(txnRes.data ?? [])
        setVisits(visitRes.data ?? [])

        // Parse settings
        const settings = settingsRes.data ?? []
        settings.forEach((s: { key: string; value: string }) => {
          if (s.key === 'service_charge_threshold') setScThreshold(Number(s.value) || 3000)
          if (s.key === 'service_charge_amount') setScAmount(Number(s.value) || 100)
          if (s.key === 'commission_bonus_amount') setBonusAmount(Number(s.value) || 100)
        })
      } catch (error) {
        console.error('Error:', error)
        toast.error('Failed to load payroll data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedMonth, selectedYear])

  // Compute payroll
  const payrollData = useMemo(() => {
    const totalCustomers = visits.length
    const totalSales = transactions
      .filter(t => t.type === 'sale')
      .reduce((s, t) => s + t.amount, 0)

    const totalServiceCharges = calculateServiceCharges(visits, scThreshold, scAmount)
    const qualifyingBillCount = visits.filter(v => (v.total_amount ?? 0) >= scThreshold).length

    const activeEmployees = employees.filter(e => e.is_active)
    const serviceChargePoolSize = activeEmployees.filter(e => e.is_in_service_charge_pool).length

    return activeEmployees.map(emp => {
      const daysWorked = attendance.filter(
        a => a.employee_id === emp.id && a.status === 'present'
      ).length

      const advances = transactions
        .filter(t => (t.type === 'salary' || t.type === 'commission') && t.employee_id === emp.id)
        .reduce((s, t) => s + t.amount, 0)

      const result = calculateCommission(
        emp,
        totalCustomers,
        totalSales,
        totalServiceCharges,
        qualifyingBillCount,
        serviceChargePoolSize,
        daysWorked,
        advances,
        0,
        bonusAmount,
      )

      return { ...result, advances }
    })
  }, [employees, attendance, transactions, visits, scThreshold, scAmount, bonusAmount])

  const payrollTotals = useMemo(() => {
    return payrollData.reduce(
      (acc, r) => ({
        daysWorked: acc.daysWorked + r.daysWorked,
        baseSalary: acc.baseSalary + r.baseSalary,
        perHeadCommission: acc.perHeadCommission + r.perHeadCommission,
        percentageCommission: acc.percentageCommission + r.percentageCommission,
        bonusCommission: acc.bonusCommission + r.bonusCommission,
        serviceChargeShare: acc.serviceChargeShare + r.serviceChargeShare,
        totalPay: acc.totalPay + r.totalPay,
        advances: acc.advances + r.advances,
        remaining: acc.remaining + r.remaining,
      }),
      {
        daysWorked: 0,
        baseSalary: 0,
        perHeadCommission: 0,
        percentageCommission: 0,
        bonusCommission: 0,
        serviceChargeShare: 0,
        totalPay: 0,
        advances: 0,
        remaining: 0,
      }
    )
  }, [payrollData])

  const handleAddEmployee = async () => {
    if (!newEmp.name.trim()) {
      toast.error('Name is required')
      return
    }
    setSaving(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('employees').insert({
        name: newEmp.name.trim(),
        daily_rate: Number(newEmp.daily_rate) || 0,
        commission_per_head_rate: Number(newEmp.commission_per_head_rate) || 0,
        commission_percentage: Number(newEmp.commission_percentage) / 100 || 0,
        is_in_service_charge_pool: newEmp.is_in_service_charge_pool,
        is_active: true,
      })
      if (error) throw error
      toast.success('Employee added')
      setDialogOpen(false)
      setNewEmp({ name: '', daily_rate: '', commission_per_head_rate: '', commission_percentage: '', is_in_service_charge_pool: true })

      // Refresh
      const { data } = await supabase.from('employees').select('*').order('name')
      setEmployees(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to add employee')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async (empResult: PayrollRow) => {
    if (empResult.remaining <= 0) {
      toast.info('No remaining balance')
      return
    }
    try {
      const supabase = createClient()
      const { error } = await supabase.from('transactions').insert({
        date: format(new Date(), 'yyyy-MM-dd'),
        type: 'salary' as const,
        amount: empResult.remaining,
        description: `Payroll payout for ${MONTHS[selectedMonth]} ${selectedYear}`,
        employee_id: empResult.employeeId,
        payment_method: 'cash',
      })
      if (error) throw error
      toast.success(`Paid ${formatCurrency(empResult.remaining)} to ${empResult.employeeName}`)

      // Refresh transactions
      const monthStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`
      const daysInMonth = getDaysInMonth(new Date(selectedYear, selectedMonth))
      const { data } = await supabase
        .from('transactions')
        .select('*')
        .gte('date', `${monthStr}-01`)
        .lte('date', `${monthStr}-${String(daysInMonth).padStart(2, '0')}`)
      setTransactions(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to process payment')
    }
  }

  // Attendance calendar for expanded employee
  const renderAttendanceCalendar = (employeeId: string) => {
    const empAttendance = attendance.filter(a => a.employee_id === employeeId)
    const monthDate = new Date(selectedYear, selectedMonth, 1)
    const days = eachDayOfInterval({
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    })

    const statusCounts = { present: 0, absent: 0, day_off: 0 }
    empAttendance.forEach(a => {
      if (a.status in statusCounts) statusCounts[a.status as keyof typeof statusCounts]++
    })

    return (
      <div className="p-4 bg-gray-50 border-t">
        <div className="flex items-center gap-4 mb-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-green-500 inline-block" /> Present ({statusCounts.present})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-red-400 inline-block" /> Absent ({statusCounts.absent})
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded bg-gray-400 inline-block" /> Day Off ({statusCounts.day_off})
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-center text-xs font-medium text-gray-500 py-1">{d}</div>
          ))}
          {/* Empty cells for days before month starts */}
          {Array.from({ length: days[0].getDay() }, (_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd')
            const record = empAttendance.find(a => a.date === dateStr)
            let bgColor = 'bg-gray-100'
            if (record?.status === 'present') bgColor = 'bg-green-200'
            else if (record?.status === 'absent') bgColor = 'bg-red-200'
            else if (record?.status === 'day_off') bgColor = 'bg-gray-300'

            return (
              <div
                key={dateStr}
                className={`text-center text-xs py-1.5 rounded ${bgColor}`}
                title={record?.status ?? 'no record'}
              >
                {day.getDate()}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const currentYr = now.getFullYear()
  const years = Array.from({ length: 3 }, (_, i) => currentYr - 1 + i)

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>

      {/* EMPLOYEE OVERVIEW */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Employee Overview</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger render={<Button size="sm"><Plus className="size-4 mr-1" /> Add Employee</Button>} />
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add Employee</DialogTitle>
                <DialogDescription>Enter the new employee details.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label htmlFor="emp-name">Name</Label>
                  <Input id="emp-name" value={newEmp.name} onChange={e => setNewEmp(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="emp-rate">Daily Rate</Label>
                    <Input id="emp-rate" type="number" value={newEmp.daily_rate} onChange={e => setNewEmp(p => ({ ...p, daily_rate: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="emp-perhead">Per Head Rate</Label>
                    <Input id="emp-perhead" type="number" value={newEmp.commission_per_head_rate} onChange={e => setNewEmp(p => ({ ...p, commission_per_head_rate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="emp-comm">Commission %</Label>
                  <Input id="emp-comm" type="number" value={newEmp.commission_percentage} onChange={e => setNewEmp(p => ({ ...p, commission_percentage: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={newEmp.is_in_service_charge_pool}
                    onCheckedChange={v => setNewEmp(p => ({ ...p, is_in_service_charge_pool: v }))}
                    id="emp-sc"
                  />
                  <Label htmlFor="emp-sc">In Service Charge Pool</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddEmployee} disabled={saving}>
                  {saving ? 'Saving...' : 'Add Employee'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Daily Rate</TableHead>
                <TableHead className="text-right">Monthly Est</TableHead>
                <TableHead className="text-right">Commission %</TableHead>
                <TableHead className="text-right">Per Head</TableHead>
                <TableHead>SC Pool</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map(emp => (
                <TableRow key={emp.id}>
                  <TableCell className="font-medium">{emp.name}</TableCell>
                  <TableCell className="text-right">{formatCurrency(emp.daily_rate)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(emp.daily_rate * 26)}</TableCell>
                  <TableCell className="text-right">{(emp.commission_percentage * 100).toFixed(1)}%</TableCell>
                  <TableCell className="text-right">{formatCurrency(emp.commission_per_head_rate)}</TableCell>
                  <TableCell>{emp.is_in_service_charge_pool ? 'Yes' : 'No'}</TableCell>
                  <TableCell>
                    <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                      {emp.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {employees.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500 py-8">No employees found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* MONTHLY PAYROLL */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Monthly Payroll</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={String(i)}>{m}</SelectItem>
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
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Days</TableHead>
                    <TableHead className="text-right">Base</TableHead>
                    <TableHead className="text-right">Per Head</TableHead>
                    <TableHead className="text-right">% Comm</TableHead>
                    <TableHead className="text-right">Bonus</TableHead>
                    <TableHead className="text-right">SC Share</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Advances</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payrollData.map(row => (
                    <TableRow key={row.employeeId} className="group">
                      <TableCell>
                        <button
                          className="flex items-center gap-1 font-medium hover:text-[#40916C]"
                          onClick={() => setExpandedEmployee(expandedEmployee === row.employeeId ? null : row.employeeId)}
                        >
                          {expandedEmployee === row.employeeId ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                          {row.employeeName}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">{row.daysWorked}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.baseSalary)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.perHeadCommission)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.percentageCommission)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.bonusCommission)}</TableCell>
                      <TableCell className="text-right">{formatCurrency(row.serviceChargeShare)}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(row.totalPay)}</TableCell>
                      <TableCell className="text-right text-orange-600">{formatCurrency(row.advances)}</TableCell>
                      <TableCell className={`text-right font-semibold ${row.remaining < 0 ? 'text-red-600' : 'text-[#1B4332]'}`}>
                        {formatCurrency(row.remaining)}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => handleMarkPaid(row as PayrollRow)}
                          disabled={row.remaining <= 0}
                        >
                          Mark Paid
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {payrollData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-gray-500 py-8">No active employees</TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {payrollData.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell className="font-bold">Totals</TableCell>
                      <TableCell className="text-right font-bold">{payrollTotals.daysWorked}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.baseSalary)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.perHeadCommission)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.percentageCommission)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.bonusCommission)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.serviceChargeShare)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.totalPay)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.advances)}</TableCell>
                      <TableCell className="text-right font-bold">{formatCurrency(payrollTotals.remaining)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>

              {/* Expanded attendance calendar */}
              {expandedEmployee && renderAttendanceCalendar(expandedEmployee)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
