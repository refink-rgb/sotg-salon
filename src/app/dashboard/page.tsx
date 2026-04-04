'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/lib/branch-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Clock,
  CheckCircle2,
  Timer,
  Loader2,
  Phone,
  MapPin,
  Plus,
  Trash2,
  CalendarIcon,
  Camera,
  UserPlus,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PAYMENT_METHODS } from '@/lib/constants'
import { formatPeso, getToday } from '@/lib/utils'
import type { Visit, PaymentMethod, Service, Employee } from '@/types/database'

interface PaymentEntry {
  method: PaymentMethod
  amount: string
}

export default function DashboardQueuePage() {
  const supabase = createClient()
  const { branchId, userRole } = useBranch()

  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editMode, setEditMode] = useState<'new' | 'edit'>('new')

  // Date selector state
  const [selectedDate, setSelectedDate] = useState(getToday)
  const todayStr = getToday()

  // All active services (for checkbox editing)
  const [allServices, setAllServices] = useState<Service[]>([])
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([])

  // Employees (for stylist assignment)
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [selectedStylistId, setSelectedStylistId] = useState<string>('')

  // Walk-in dialog state
  const [walkinOpen, setWalkinOpen] = useState(false)
  const [walkinForm, setWalkinForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    city: 'Mabalacat City',
  })
  const [walkinServices, setWalkinServices] = useState<string[]>([])
  const [walkinSubmitting, setWalkinSubmitting] = useState(false)

  // Form state for completing/editing a visit
  const [totalPrice, setTotalPrice] = useState('')
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'cash', amount: '' },
  ])
  const [notes, setNotes] = useState('')
  const [completing, setCompleting] = useState(false)
  const [uploadingBefore, setUploadingBefore] = useState(false)
  const [uploadingAfter, setUploadingAfter] = useState(false)

  // Elapsed time ticker
  const [, setTick] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60000)
    return () => clearInterval(interval)
  }, [])

  // Fetch all active services and employees on mount
  useEffect(() => {
    async function fetchServices() {
      const { data } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true })
      if (data) setAllServices(data)
    }
    async function fetchEmployees() {
      if (!branchId) return
      const { data } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .eq('branch_id', branchId)
        .order('name', { ascending: true })
      if (data) setAllEmployees(data)
    }
    fetchServices()
    fetchEmployees()
  }, [branchId])

  const fetchVisits = useCallback(async () => {
    if (!branchId) return
    const { data, error } = await supabase
      .from('visits')
      .select(
        `
        *,
        customer:customers(*),
        visit_services(*, service:services(*)),
        visit_payments(*)
      `
      )
      .eq('date', selectedDate)
      .eq('branch_id', branchId)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      toast.error('Failed to load visits')
    } else {
      setVisits(data || [])
    }
    setLoading(false)
  }, [selectedDate, branchId])

  useEffect(() => {
    setLoading(true)
    fetchVisits()
    // Poll every 30s
    const interval = setInterval(fetchVisits, 30000)
    return () => clearInterval(interval)
  }, [fetchVisits])

  const inProgress = visits
    .filter((v) => v.status === 'in_progress')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  const completed = visits.filter((v) => v.status === 'completed')

  const totalSales = completed.reduce((sum, v) => sum + (v.total_amount || 0), 0)

  function openVisitDetail(visit: Visit, mode: 'new' | 'edit') {
    setSelectedVisit(visit)
    setEditMode(mode)

    // Initialize total price
    if (mode === 'edit' && visit.total_amount != null) {
      setTotalPrice(String(visit.total_amount))
    } else {
      setTotalPrice('')
    }

    // Initialize payments
    if (visit.visit_payments && visit.visit_payments.length > 0) {
      setPayments(
        visit.visit_payments.map((vp) => ({
          method: vp.method,
          amount: String(vp.amount),
        }))
      )
    } else {
      setPayments([{ method: 'cash', amount: '' }])
    }

    // Initialize selected services from visit
    setSelectedServiceIds(
      visit.visit_services?.map((vs) => vs.service_id) || []
    )

    setSelectedStylistId(visit.stylist_employee_id || '')
    setNotes(visit.notes || '')
    setSheetOpen(true)
  }

  function toggleServiceId(serviceId: string) {
    setSelectedServiceIds((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    )
  }

  function handleTotalPriceChange(value: string) {
    setTotalPrice(value)
    // Auto-fill the first payment entry with the total price
    if (payments.length === 1) {
      const updated = [...payments]
      updated[0].amount = value
      setPayments(updated)
    }
  }

  function addPayment() {
    setPayments([...payments, { method: 'cash', amount: '' }])
  }

  function removePayment(index: number) {
    setPayments(payments.filter((_, i) => i !== index))
  }

  function updatePayment(
    index: number,
    field: 'method' | 'amount',
    value: string
  ) {
    const updated = [...payments]
    if (field === 'method') {
      updated[index].method = value as PaymentMethod
    } else {
      updated[index].amount = value
      // Auto-balance: if there are 2+ payments and this isn't the last one,
      // set the last payment to the remaining balance
      const total = Number(totalPrice || 0)
      if (total > 0 && updated.length >= 2 && index !== updated.length - 1) {
        const otherSum = updated
          .filter((_, i) => i !== updated.length - 1)
          .reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
        const remaining = Math.max(0, total - otherSum)
        updated[updated.length - 1].amount = remaining > 0 ? String(remaining) : ''
      }
    }
    setPayments(updated)
  }

  const totalPriceNum = Number(totalPrice || 0)
  const totalPayments = payments.reduce(
    (sum, p) => sum + Number(p.amount || 0),
    0
  )
  const paymentMismatch =
    totalPriceNum > 0 &&
    totalPayments > 0 &&
    Math.abs(totalPayments - totalPriceNum) > 0.01

  async function handleWalkinSubmit() {
    const { firstName, lastName, phone, city } = walkinForm
    if (!firstName.trim() || !lastName.trim()) {
      toast.error('First and last name are required')
      return
    }

    setWalkinSubmitting(true)
    try {
      let customerId: string
      const visitId = crypto.randomUUID()
      const trimmedPhone = phone.trim()

      // Check if customer already exists by phone (stylist is authenticated, can SELECT)
      if (trimmedPhone) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('phone', trimmedPhone)
          .maybeSingle()

        if (existing) {
          // Reuse existing customer, update their info
          customerId = existing.id
          await supabase.from('customers').update({
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            city: city.trim() || null,
            is_returning: true,
          }).eq('id', customerId)
        } else {
          customerId = crypto.randomUUID()
          const { error: custErr } = await supabase.from('customers').insert({
            id: customerId,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            phone: trimmedPhone,
            city: city.trim() || null,
            is_returning: false,
          })
          if (custErr) throw custErr
        }
      } else {
        customerId = crypto.randomUUID()
        const { error: custErr } = await supabase.from('customers').insert({
          id: customerId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: null,
          city: city.trim() || null,
          is_returning: false,
        })
        if (custErr) throw custErr
      }

      const { error: visitErr } = await supabase.from('visits').insert({
        id: visitId,
        customer_id: customerId,
        date: selectedDate,
        status: 'in_progress',
        branch_id: branchId,
      })
      if (visitErr) throw visitErr

      if (walkinServices.length > 0) {
        const vs = walkinServices.map(sid => ({
          visit_id: visitId,
          service_id: sid,
          price: null,
        }))
        await supabase.from('visit_services').insert(vs)
      }

      toast.success(`${firstName} ${lastName} added to queue`)
      setWalkinOpen(false)
      setWalkinForm({ firstName: '', lastName: '', phone: '', city: 'Mabalacat City' })
      setWalkinServices([])
      fetchVisits()
    } catch (error) {
      console.error(error)
      toast.error('Failed to add customer')
    } finally {
      setWalkinSubmitting(false)
    }
  }

  async function handleMarkComplete() {
    if (!selectedVisit) return

    if (selectedServiceIds.length === 0) {
      toast.error('Please select at least one service')
      return
    }

    if (totalPriceNum <= 0) {
      toast.error('Please enter a total price')
      return
    }

    if (totalPayments <= 0) {
      toast.error('Please enter payment amounts')
      return
    }

    if (paymentMismatch) {
      toast.error(
        `Payment total (${formatPeso(totalPayments)}) does not match total price (${formatPeso(totalPriceNum)})`
      )
      return
    }

    setCompleting(true)

    try {
      // Update visit
      const { error: visitError } = await supabase
        .from('visits')
        .update({
          status: 'completed',
          total_amount: totalPriceNum,
          notes: notes.trim() || null,
          completed_at: new Date().toISOString(),
          stylist_employee_id: selectedStylistId || null,
        })
        .eq('id', selectedVisit.id)
      if (visitError) throw visitError

      // Update visit_services: delete old, insert new
      await supabase
        .from('visit_services')
        .delete()
        .eq('visit_id', selectedVisit.id)

      if (selectedServiceIds.length > 0) {
        const serviceRecords = selectedServiceIds.map((serviceId) => ({
          visit_id: selectedVisit.id,
          service_id: serviceId,
          price: null,
        }))
        const { error: svcError } = await supabase
          .from('visit_services')
          .insert(serviceRecords)
        if (svcError) throw svcError
      }

      // Delete existing visit_payments then insert new ones
      await supabase
        .from('visit_payments')
        .delete()
        .eq('visit_id', selectedVisit.id)

      const paymentRecords = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({
          visit_id: selectedVisit.id,
          method: p.method,
          amount: Number(p.amount),
        }))

      if (paymentRecords.length > 0) {
        const { error: payError } = await supabase
          .from('visit_payments')
          .insert(paymentRecords)
        if (payError) throw payError
      }

      // Create transaction record
      const { error: txError } = await supabase.from('transactions').insert({
        date: selectedDate,
        type: 'sale',
        amount: totalPriceNum,
        visit_id: selectedVisit.id,
        description: `Sale - ${selectedVisit.customer?.first_name} ${selectedVisit.customer?.last_name}`,
        branch_id: branchId,
      })
      if (txError) throw txError

      // Note if total >= 3000 for service charge tracking
      if (totalPriceNum >= 3000) {
        console.log(
          `Service charge eligible visit: ${selectedVisit.id} - ${formatPeso(totalPriceNum)}`
        )
      }

      toast.success('Visit marked as complete!')
      setSheetOpen(false)
      setSelectedVisit(null)
      fetchVisits()

      // Auto-open the next in-progress visit after a short delay
      setTimeout(() => {
        const remaining = inProgress.filter((v) => v.id !== selectedVisit.id)
        if (remaining.length > 0) {
          openVisitDetail(remaining[0], 'new')
        }
      }, 600)
    } catch (error) {
      console.error(error)
      toast.error('Failed to complete visit')
    } finally {
      setCompleting(false)
    }
  }

  async function handleSaveChanges() {
    if (!selectedVisit) return

    if (selectedServiceIds.length === 0) {
      toast.error('Please select at least one service')
      return
    }

    if (totalPriceNum <= 0) {
      toast.error('Please enter a total price')
      return
    }

    if (totalPayments <= 0) {
      toast.error('Please enter payment amounts')
      return
    }

    if (paymentMismatch) {
      toast.error(
        `Payment total (${formatPeso(totalPayments)}) does not match total price (${formatPeso(totalPriceNum)})`
      )
      return
    }

    setCompleting(true)

    try {
      // Update visit
      const { error: visitError } = await supabase
        .from('visits')
        .update({
          total_amount: totalPriceNum,
          notes: notes.trim() || null,
          stylist_employee_id: selectedStylistId || null,
        })
        .eq('id', selectedVisit.id)
      if (visitError) throw visitError

      // Update visit_services: delete old, insert new
      await supabase
        .from('visit_services')
        .delete()
        .eq('visit_id', selectedVisit.id)

      if (selectedServiceIds.length > 0) {
        const serviceRecords = selectedServiceIds.map((serviceId) => ({
          visit_id: selectedVisit.id,
          service_id: serviceId,
          price: null,
        }))
        const { error: svcError } = await supabase
          .from('visit_services')
          .insert(serviceRecords)
        if (svcError) throw svcError
      }

      // Delete existing visit_payments then insert new ones
      await supabase
        .from('visit_payments')
        .delete()
        .eq('visit_id', selectedVisit.id)

      const paymentRecords = payments
        .filter((p) => Number(p.amount) > 0)
        .map((p) => ({
          visit_id: selectedVisit.id,
          method: p.method,
          amount: Number(p.amount),
        }))

      if (paymentRecords.length > 0) {
        const { error: payError } = await supabase
          .from('visit_payments')
          .insert(paymentRecords)
        if (payError) throw payError
      }

      // Update the existing transaction record
      const { error: txError } = await supabase
        .from('transactions')
        .update({
          amount: totalPriceNum,
        })
        .eq('visit_id', selectedVisit.id)
        .eq('type', 'sale')
      if (txError) throw txError

      toast.success('Changes saved!')
      setSheetOpen(false)
      setSelectedVisit(null)
      fetchVisits()
    } catch (error) {
      console.error(error)
      toast.error('Failed to save changes')
    } finally {
      setCompleting(false)
    }
  }

  async function resizeImage(file: File, maxWidth: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        let width = img.width
        let height = img.height
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('No canvas context')); return }
        ctx.drawImage(img, 0, 0, width, height)
        canvas.toBlob(
          (blob) => { blob ? resolve(blob) : reject(new Error('Blob creation failed')) },
          'image/jpeg',
          0.85
        )
      }
      img.onerror = () => reject(new Error('Image load failed'))
      img.src = URL.createObjectURL(file)
    })
  }

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>, type: 'before' | 'after') {
    const file = e.target.files?.[0]
    if (!file || !selectedVisit) return

    const setUploading = type === 'before' ? setUploadingBefore : setUploadingAfter
    setUploading(true)
    try {
      // Resize client-side
      const resized = await resizeImage(file, 800)

      // Build filename: FirstName_LastName_Phone_before|after.jpg
      const firstName = (selectedVisit.customer?.first_name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '_')
      const lastName = (selectedVisit.customer?.last_name || '').replace(/[^a-zA-Z0-9]/g, '_')
      const phone = (selectedVisit.customer?.phone || '').replace(/[^a-zA-Z0-9]/g, '')
      const filename = `${firstName}_${lastName}_${phone}_${type}.jpg`
      const path = `${selectedVisit.id}/${filename}`

      const { error: uploadError } = await supabase.storage
        .from('visit-photos')
        .upload(path, resized, { contentType: 'image/jpeg', upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage
        .from('visit-photos')
        .getPublicUrl(path)
      const publicUrl = urlData.publicUrl

      const column = type === 'before' ? 'photo_before_url' : 'photo_after_url'
      const { error: updateError } = await supabase
        .from('visits')
        .update({ [column]: publicUrl })
        .eq('id', selectedVisit.id)
      if (updateError) throw updateError

      setSelectedVisit({ ...selectedVisit, [column]: publicUrl })
      // Update the visit in the local list too
      setVisits((prev) =>
        prev.map((v) => v.id === selectedVisit.id ? { ...v, [column]: publicUrl } : v)
      )
      toast.success(`${type === 'before' ? 'Before' : 'After'} photo uploaded!`)
    } catch (error) {
      console.error(error)
      toast.error('Failed to upload photo')
    } finally {
      setUploading(false)
      // Reset file input
      e.target.value = ''
    }
  }

  function formatElapsed(createdAt: string) {
    const created = new Date(createdAt)
    const now = new Date()
    const diffMs = now.getTime() - created.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return '< 1 min'
    if (diffMin < 60) return `${diffMin} min`
    const hours = Math.floor(diffMin / 60)
    const mins = diffMin % 60
    if (mins === 0) return `${hours}h`
    return `${hours}h ${mins}m`
  }

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-[#40916C]" />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {/* Summary Bar */}
      <div className="sticky top-14 z-30 bg-[#40916C] px-4 py-3 text-white">
        <div className="mx-auto flex max-w-4xl items-center justify-around text-center">
          {userRole !== 'stylist' && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              Total Sales
            </p>
            <p className="text-lg font-bold">{formatPeso(totalSales)}</p>
          </div>
          )}
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              In Progress
            </p>
            <p className="text-lg font-bold">{inProgress.length}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              Completed
            </p>
            <p className="text-lg font-bold">{completed.length}</p>
          </div>
        </div>
      </div>

      {/* Date Picker */}
      <div className="mx-auto w-full max-w-4xl px-4 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-4 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              max={todayStr}
              className="rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#40916C] focus:ring-offset-1"
            />
            {selectedDate !== todayStr && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedDate(todayStr)}
                className="text-xs"
              >
                Back to Today
              </Button>
            )}
          </div>
          <Button
            onClick={() => setWalkinOpen(true)}
            className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
            size="sm"
          >
            <UserPlus className="size-4" />
            <span className="hidden sm:inline ml-1">New Walk-in</span>
          </Button>
        </div>
      </div>

      {/* Queue */}
      <div className="mx-auto w-full max-w-4xl px-4 py-4">
        <Tabs defaultValue="in_progress">
          <TabsList className="w-full">
            <TabsTrigger value="in_progress" className="flex-1">
              In Progress ({inProgress.length})
            </TabsTrigger>
            <TabsTrigger value="completed" className="flex-1">
              Completed ({completed.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="in_progress">
            {inProgress.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Clock className="mx-auto size-10 text-gray-300" />
                <p className="mt-2">No customers in queue</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {inProgress.map((visit) => (
                  <Card
                    key={visit.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => openVisitDetail(visit, 'new')}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {(visit.photo_after_url || visit.photo_before_url) && (
                            <img
                              src={visit.photo_after_url || visit.photo_before_url!}
                              alt=""
                              className="size-10 flex-shrink-0 rounded-md object-cover"
                            />
                          )}
                          <div>
                            <p className="font-semibold">
                              {visit.customer?.first_name}{' '}
                              {visit.customer?.last_name}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {visit.visit_services?.map((vs) => (
                                <Badge key={vs.id} variant="secondary">
                                  {vs.service?.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1 text-right">
                          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            <span>Checked in: {format(new Date(visit.created_at), 'h:mm a')}</span>
                          </div>
                          <div className="flex items-center justify-end gap-1 text-xs font-medium text-[#40916C]">
                            <Timer className="size-3" />
                            <span>In salon: {formatElapsed(visit.created_at)}</span>
                          </div>
                          {(() => {
                            const mins = Math.floor((Date.now() - new Date(visit.created_at).getTime()) / 60000)
                            const variant = mins < 30 ? 'default' : mins < 60 ? 'secondary' : 'destructive'
                            const label = mins < 30 ? 'On time' : mins < 60 ? 'Long wait' : 'Over 1hr'
                            return (
                              <Badge variant={variant} className={mins < 30 ? 'bg-green-100 text-green-700 hover:bg-green-100' : mins < 60 ? 'bg-amber-100 text-amber-700 hover:bg-amber-100' : ''}>
                                {label}
                              </Badge>
                            )
                          })()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="completed">
            {completed.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <CheckCircle2 className="mx-auto size-10 text-gray-300" />
                <p className="mt-2">No completed visits{selectedDate !== todayStr ? ' on this date' : ' today'}</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {completed.map((visit) => (
                  <Card
                    key={visit.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => openVisitDetail(visit, 'edit')}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          {(visit.photo_after_url || visit.photo_before_url) && (
                            <img
                              src={visit.photo_after_url || visit.photo_before_url!}
                              alt=""
                              className="size-10 flex-shrink-0 rounded-md object-cover"
                            />
                          )}
                          <div>
                            <p className="font-semibold">
                              {visit.customer?.first_name}{' '}
                              {visit.customer?.last_name}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {visit.visit_services?.map((vs) => (
                                <Badge key={vs.id} variant="outline">
                                  {vs.service?.name}
                                </Badge>
                              ))}
                            </div>
                            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                              {visit.visit_payments?.map((vp) => (
                                <span key={vp.id}>
                                  {PAYMENT_METHODS.find((m) => m.value === vp.method)?.label}: {formatPeso(vp.amount)}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div className="space-y-1 text-right">
                          <p className="font-semibold text-[#1B4332]">
                            {formatPeso(visit.total_amount || 0)}
                          </p>
                          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                            <Clock className="size-3" />
                            <span>Checked in: {format(new Date(visit.created_at), 'h:mm a')}</span>
                          </div>
                          {visit.completed_at && (
                            <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                              <CheckCircle2 className="size-3" />
                              <span>Completed: {format(new Date(visit.completed_at), 'h:mm a')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {selectedVisit?.customer?.first_name}{' '}
              {selectedVisit?.customer?.last_name}
            </SheetTitle>
          </SheetHeader>

          {selectedVisit && (
            <div className="space-y-5 px-4 pb-8">
              {/* Customer Info */}
              <div className="space-y-1.5 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5" />
                  {selectedVisit.customer?.phone}
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="size-3.5" />
                  {selectedVisit.customer?.city}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5" />
                  Checked in at{' '}
                  {format(new Date(selectedVisit.created_at), 'h:mm a')}
                </div>
                {selectedVisit.customer?.is_returning && (
                  <Badge variant="secondary">Returning Customer</Badge>
                )}
              </div>

              {/* Stylist Assignment */}
              <div className="space-y-2">
                <Label>Stylist</Label>
                <Select
                  value={selectedStylistId}
                  onValueChange={(v) => setSelectedStylistId(v ?? '')}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select stylist..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allEmployees.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Services (editable checkboxes) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Services</h3>
                <div className="grid grid-cols-2 gap-3">
                  {allServices.map((service) => (
                    <label
                      key={service.id}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                        selectedServiceIds.includes(service.id)
                          ? 'border-[#40916C] bg-[#40916C]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Checkbox
                        checked={selectedServiceIds.includes(service.id)}
                        onCheckedChange={() => toggleServiceId(service.id)}
                      />
                      <span className="text-sm font-medium">{service.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Photo Documentation */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Photo Documentation</h3>
                <input
                  type="file"
                  accept="image/*"
                  id="photo-before-upload"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e, 'before')}
                  disabled={uploadingBefore}
                />
                <input
                  type="file"
                  accept="image/*"
                  id="photo-after-upload"
                  className="hidden"
                  onChange={(e) => handlePhotoUpload(e, 'after')}
                  disabled={uploadingAfter}
                />
                <div className="grid grid-cols-2 gap-3">
                  {/* Before Photo */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Before</p>
                    {selectedVisit.photo_before_url ? (
                      <div className="space-y-1.5">
                        <div className="relative overflow-hidden rounded-lg border">
                          <img
                            src={selectedVisit.photo_before_url}
                            alt="Before photo"
                            className="h-32 w-full object-cover"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => document.getElementById('photo-before-upload')?.click()}
                          disabled={uploadingBefore}
                        >
                          {uploadingBefore ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Camera className="size-3" />
                              Change
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => document.getElementById('photo-before-upload')?.click()}
                        disabled={uploadingBefore}
                        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-6 text-muted-foreground transition-colors hover:border-[#40916C] hover:text-[#40916C]"
                      >
                        {uploadingBefore ? (
                          <>
                            <Loader2 className="size-6 animate-spin" />
                            <span className="text-xs">Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Camera className="size-6" />
                            <span className="text-xs font-medium">Upload</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* After Photo */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">After</p>
                    {selectedVisit.photo_after_url ? (
                      <div className="space-y-1.5">
                        <div className="relative overflow-hidden rounded-lg border">
                          <img
                            src={selectedVisit.photo_after_url}
                            alt="After photo"
                            className="h-32 w-full object-cover"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => document.getElementById('photo-after-upload')?.click()}
                          disabled={uploadingAfter}
                        >
                          {uploadingAfter ? (
                            <>
                              <Loader2 className="size-3 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Camera className="size-3" />
                              Change
                            </>
                          )}
                        </Button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => document.getElementById('photo-after-upload')?.click()}
                        disabled={uploadingAfter}
                        className="flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-gray-300 py-6 text-muted-foreground transition-colors hover:border-[#40916C] hover:text-[#40916C]"
                      >
                        {uploadingAfter ? (
                          <>
                            <Loader2 className="size-6 animate-spin" />
                            <span className="text-xs">Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Camera className="size-6" />
                            <span className="text-xs font-medium">Upload</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Total Price */}
              <div className="space-y-2">
                <Label htmlFor="total-price">Total Price</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₱
                  </span>
                  <Input
                    id="total-price"
                    type="number"
                    placeholder="Enter total price"
                    value={totalPrice}
                    onChange={(e) => handleTotalPriceChange(e.target.value)}
                    className="pl-7 text-right text-lg font-semibold"
                    min="0"
                  />
                </div>
              </div>

              <Separator />

              {/* Payment */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Payment</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addPayment}
                  >
                    <Plus className="size-4" />
                    Split
                  </Button>
                </div>

                <div className="space-y-2">
                  {payments.map((payment, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Select
                        value={payment.method}
                        onValueChange={(val) =>
                          updatePayment(index, 'method', val ?? 'cash')
                        }
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((pm) => (
                            <SelectItem key={pm.value} value={pm.value}>
                              {pm.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        type="number"
                        placeholder="Amount"
                        value={payment.amount}
                        onChange={(e) =>
                          updatePayment(index, 'amount', e.target.value)
                        }
                        className="flex-1 text-right"
                        min="0"
                      />
                      {payments.length > 1 && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removePayment(index)}
                        >
                          <Trash2 className="size-4 text-red-500" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Payment sum validation */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Payment Total</span>
                  <span
                    className={
                      paymentMismatch
                        ? 'font-semibold text-red-500'
                        : 'font-semibold'
                    }
                  >
                    {formatPeso(totalPayments)}
                  </span>
                </div>
                {paymentMismatch && (
                  <p className="text-xs text-red-500">
                    Payment total does not match the total price ({formatPeso(totalPriceNum)})
                  </p>
                )}
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes..."
                  rows={3}
                />
              </div>

              {/* Actions */}
              {editMode === 'new' ? (
                <Button
                  onClick={handleMarkComplete}
                  disabled={completing}
                  className="h-11 w-full bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
                >
                  {completing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" />
                      Mark Complete
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleSaveChanges}
                  disabled={completing}
                  className="h-11 w-full bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
                >
                  {completing ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="size-4" />
                      Save Changes
                    </>
                  )}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Walk-in Dialog */}
      <Dialog open={walkinOpen} onOpenChange={setWalkinOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-[#40916C]" />
              New Walk-in Customer
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>First Name *</Label>
                <Input
                  value={walkinForm.firstName}
                  onChange={e => setWalkinForm(p => ({ ...p, firstName: e.target.value }))}
                  placeholder="Juan"
                />
              </div>
              <div>
                <Label>Last Name *</Label>
                <Input
                  value={walkinForm.lastName}
                  onChange={e => setWalkinForm(p => ({ ...p, lastName: e.target.value }))}
                  placeholder="Dela Cruz"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={walkinForm.phone}
                  onChange={e => {
                    const val = e.target.value.replace(/[^0-9]/g, '')
                    if (val.length <= 11) setWalkinForm(p => ({ ...p, phone: val }))
                  }}
                  placeholder="09171234567"
                  maxLength={11}
                />
              </div>
              <div>
                <Label>City</Label>
                <Input
                  value={walkinForm.city}
                  onChange={e => setWalkinForm(p => ({ ...p, city: e.target.value }))}
                  placeholder="Mabalacat City"
                />
              </div>
            </div>
            {allServices.length > 0 && (
              <div>
                <Label className="mb-2 block">Services</Label>
                <div className="grid grid-cols-2 gap-2">
                  {allServices.map(service => (
                    <label
                      key={service.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-sm transition-colors ${
                        walkinServices.includes(service.id)
                          ? 'border-[#40916C] bg-[#40916C]/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <Checkbox
                        checked={walkinServices.includes(service.id)}
                        onCheckedChange={() =>
                          setWalkinServices(prev =>
                            prev.includes(service.id)
                              ? prev.filter(id => id !== service.id)
                              : [...prev, service.id]
                          )
                        }
                      />
                      {service.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWalkinOpen(false)}>Cancel</Button>
            <Button
              onClick={handleWalkinSubmit}
              disabled={walkinSubmitting}
              className="bg-[#1B4332] text-white hover:bg-[#1B4332]/90"
            >
              {walkinSubmitting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              Add to Queue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
