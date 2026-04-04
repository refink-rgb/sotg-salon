'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/lib/branch-context'
import { getToday } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CalendarDays } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import type { Employee, DailyAttendance, AttendanceStatus } from '@/types/database'

interface EmployeeAttendance {
  employee: Employee
  attendance: DailyAttendance | null
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'present', label: 'Present', color: 'bg-[#40916C] text-white hover:bg-[#40916C]/80' },
  { value: 'absent', label: 'Absent', color: 'bg-red-500 text-white hover:bg-red-500/80' },
  { value: 'day_off', label: 'Day Off', color: 'bg-gray-400 text-white hover:bg-gray-400/80' },
]

export default function AttendancePage() {
  const supabase = createClient()
  const { branchId } = useBranch()
  const today = getToday()

  const [data, setData] = useState<EmployeeAttendance[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const fetchData = useCallback(async () => {
    if (!branchId) return
    const [empRes, attRes] = await Promise.all([
      supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .eq('branch_id', branchId)
        .order('name'),
      supabase
        .from('daily_attendance')
        .select('*')
        .eq('date', today)
        .eq('branch_id', branchId),
    ])

    if (empRes.error) console.error(empRes.error)
    if (attRes.error) console.error(attRes.error)

    const employees = empRes.data || []
    const attendances = attRes.data || []

    const merged: EmployeeAttendance[] = employees.map((emp) => {
      const att = attendances.find((a) => a.employee_id === emp.id)
      return { employee: emp, attendance: att || null }
    })

    setData(merged)

    // Initialize notes
    const noteMap: Record<string, string> = {}
    for (const item of merged) {
      noteMap[item.employee.id] = item.attendance?.notes || ''
    }
    setNotes(noteMap)

    setLoading(false)
  }, [today, branchId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleStatusChange(employeeId: string, status: AttendanceStatus) {
    setUpdatingId(employeeId)
    try {
      const existing = data.find((d) => d.employee.id === employeeId)?.attendance

      if (existing) {
        const { error } = await supabase
          .from('daily_attendance')
          .update({ status, notes: notes[employeeId]?.trim() || null })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('daily_attendance').insert({
          employee_id: employeeId,
          date: today,
          status,
          notes: notes[employeeId]?.trim() || null,
          branch_id: branchId,
        })
        if (error) throw error
      }

      toast.success('Attendance updated')
      fetchData()
    } catch (error) {
      console.error(error)
      toast.error('Failed to update attendance')
    } finally {
      setUpdatingId(null)
    }
  }

  async function handleNoteSave(employeeId: string) {
    const existing = data.find((d) => d.employee.id === employeeId)?.attendance
    if (!existing) return

    try {
      const { error } = await supabase
        .from('daily_attendance')
        .update({ notes: notes[employeeId]?.trim() || null })
        .eq('id', existing.id)
      if (error) throw error
      toast.success('Note saved')
    } catch (error) {
      console.error(error)
      toast.error('Failed to save note')
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#40916C]" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-4">
      {/* Date Header */}
      <div className="mb-6 flex items-center gap-3">
        <CalendarDays className="size-6 text-[#40916C]" />
        <h2 className="text-xl font-bold text-[#1B4332]">
          {format(new Date(), 'EEEE, MMMM d, yyyy')}
        </h2>
      </div>

      {data.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          No active employees found
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((item) => {
            const currentStatus = item.attendance?.status || null

            return (
              <Card key={item.employee.id}>
                <CardContent className="py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    {/* Employee Name + Status Badge */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold">
                        {item.employee.name}
                      </span>
                      {currentStatus && (
                        <Badge
                          variant={
                            currentStatus === 'present'
                              ? 'default'
                              : currentStatus === 'absent'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {STATUS_OPTIONS.find((s) => s.value === currentStatus)?.label}
                        </Badge>
                      )}
                    </div>

                    {/* Status Buttons */}
                    <div className="flex gap-2">
                      {STATUS_OPTIONS.map((opt) => (
                        <Button
                          key={opt.value}
                          size="sm"
                          disabled={updatingId === item.employee.id}
                          onClick={() =>
                            handleStatusChange(item.employee.id, opt.value)
                          }
                          className={
                            currentStatus === opt.value
                              ? opt.color
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }
                        >
                          {updatingId === item.employee.id ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            opt.label
                          )}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Notes */}
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      placeholder="Notes (optional)"
                      value={notes[item.employee.id] || ''}
                      onChange={(e) =>
                        setNotes({
                          ...notes,
                          [item.employee.id]: e.target.value,
                        })
                      }
                      onBlur={() => {
                        if (item.attendance) {
                          handleNoteSave(item.employee.id)
                        }
                      }}
                      className="h-8 text-sm"
                    />
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
