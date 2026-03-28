'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
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
import {
  DollarSign,
  Clock,
  CheckCircle2,
  Loader2,
  User,
  Phone,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { PAYMENT_METHODS } from '@/lib/constants'
import type { Visit, PaymentMethod } from '@/types/database'

interface PaymentEntry {
  method: PaymentMethod
  amount: string
}

export default function DashboardQueuePage() {
  const supabase = createClient()

  const [visits, setVisits] = useState<Visit[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [readOnly, setReadOnly] = useState(false)

  // Form state for completing a visit
  const [servicePrices, setServicePrices] = useState<Record<string, string>>({})
  const [payments, setPayments] = useState<PaymentEntry[]>([
    { method: 'cash', amount: '' },
  ])
  const [notes, setNotes] = useState('')
  const [completing, setCompleting] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const fetchVisits = useCallback(async () => {
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
      .eq('date', today)
      .order('created_at', { ascending: true })

    if (error) {
      console.error(error)
      toast.error('Failed to load visits')
    } else {
      setVisits(data || [])
    }
    setLoading(false)
  }, [today])

  useEffect(() => {
    fetchVisits()
    // Poll every 30s
    const interval = setInterval(fetchVisits, 30000)
    return () => clearInterval(interval)
  }, [fetchVisits])

  const inProgress = visits.filter((v) => v.status === 'in_progress')
  const completed = visits.filter((v) => v.status === 'completed')

  const totalSales = completed.reduce((sum, v) => sum + (v.total_amount || 0), 0)

  function openVisitDetail(visit: Visit, isReadOnly: boolean) {
    setSelectedVisit(visit)
    setReadOnly(isReadOnly)

    if (!isReadOnly) {
      // Initialize service prices
      const prices: Record<string, string> = {}
      visit.visit_services?.forEach((vs) => {
        prices[vs.id] = vs.price != null ? String(vs.price) : ''
      })
      setServicePrices(prices)

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

      setNotes(visit.notes || '')
    }

    setSheetOpen(true)
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
    }
    setPayments(updated)
  }

  async function handleMarkComplete() {
    if (!selectedVisit) return

    // Validate prices
    const hasEmptyPrice = selectedVisit.visit_services?.some(
      (vs) => !servicePrices[vs.id] || Number(servicePrices[vs.id]) <= 0
    )
    if (hasEmptyPrice) {
      toast.error('Please enter a price for each service')
      return
    }

    // Validate payments
    const totalServices = selectedVisit.visit_services?.reduce(
      (sum, vs) => sum + Number(servicePrices[vs.id] || 0),
      0
    ) || 0

    const totalPayments = payments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    )

    if (totalPayments <= 0) {
      toast.error('Please enter payment amounts')
      return
    }

    if (Math.abs(totalPayments - totalServices) > 0.01) {
      toast.error(
        `Payment total (${formatPHP(totalPayments)}) does not match service total (${formatPHP(totalServices)})`
      )
      return
    }

    setCompleting(true)

    try {
      // Update service prices
      for (const vs of selectedVisit.visit_services || []) {
        const { error } = await supabase
          .from('visit_services')
          .update({ price: Number(servicePrices[vs.id]) })
          .eq('id', vs.id)
        if (error) throw error
      }

      // Update visit
      const { error: visitError } = await supabase
        .from('visits')
        .update({
          status: 'completed',
          total_amount: totalServices,
          notes: notes.trim() || null,
          completed_at: new Date().toISOString(),
        })
        .eq('id', selectedVisit.id)
      if (visitError) throw visitError

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
        date: today,
        type: 'sale',
        amount: totalServices,
        visit_id: selectedVisit.id,
        description: `Sale - ${selectedVisit.customer?.first_name} ${selectedVisit.customer?.last_name}`,
      })
      if (txError) throw txError

      // Note if total >= 3000 for service charge tracking
      if (totalServices >= 3000) {
        console.log(
          `Service charge eligible visit: ${selectedVisit.id} - ${formatPHP(totalServices)}`
        )
      }

      toast.success('Visit marked as complete!')
      setSheetOpen(false)
      setSelectedVisit(null)
      fetchVisits()
    } catch (error) {
      console.error(error)
      toast.error('Failed to complete visit')
    } finally {
      setCompleting(false)
    }
  }

  function formatPHP(amount: number) {
    return `\u20B1${amount.toLocaleString()}`
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
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">
              Total Sales
            </p>
            <p className="text-lg font-bold">{formatPHP(totalSales)}</p>
          </div>
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
                    onClick={() => openVisitDetail(visit, false)}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
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
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(visit.created_at), 'h:mm a')}
                        </span>
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
                <p className="mt-2">No completed visits today</p>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {completed.map((visit) => (
                  <Card
                    key={visit.id}
                    className="cursor-pointer transition-shadow hover:shadow-md"
                    onClick={() => openVisitDetail(visit, true)}
                  >
                    <CardContent className="py-3">
                      <div className="flex items-start justify-between">
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
                                {PAYMENT_METHODS.find((m) => m.value === vp.method)?.label}: {formatPHP(vp.amount)}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[#1B4332]">
                            {formatPHP(visit.total_amount || 0)}
                          </p>
                          {visit.completed_at && (
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(visit.completed_at), 'h:mm a')}
                            </p>
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

              <Separator />

              {/* Services with Prices */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Services</h3>
                {selectedVisit.visit_services?.map((vs) => (
                  <div
                    key={vs.id}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="text-sm">{vs.service?.name}</span>
                    {readOnly ? (
                      <span className="text-sm font-medium">
                        {formatPHP(vs.price || 0)}
                      </span>
                    ) : (
                      <Input
                        type="number"
                        placeholder="Price"
                        value={servicePrices[vs.id] || ''}
                        onChange={(e) =>
                          setServicePrices({
                            ...servicePrices,
                            [vs.id]: e.target.value,
                          })
                        }
                        className="w-28 text-right"
                        min="0"
                      />
                    )}
                  </div>
                ))}
                {!readOnly && (
                  <div className="flex justify-end text-sm font-semibold">
                    Total:{' '}
                    {formatPHP(
                      selectedVisit.visit_services?.reduce(
                        (sum, vs) =>
                          sum + Number(servicePrices[vs.id] || 0),
                        0
                      ) || 0
                    )}
                  </div>
                )}
              </div>

              <Separator />

              {/* Payment */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Payment</h3>
                  {!readOnly && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={addPayment}
                    >
                      <Plus className="size-4" />
                      Split
                    </Button>
                  )}
                </div>

                {readOnly ? (
                  <div className="space-y-2">
                    {selectedVisit.visit_payments?.map((vp) => (
                      <div
                        key={vp.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span>
                          {PAYMENT_METHODS.find((m) => m.value === vp.method)?.label}
                        </span>
                        <span className="font-medium">
                          {formatPHP(vp.amount)}
                        </span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span>Total Paid</span>
                      <span>
                        {formatPHP(
                          selectedVisit.visit_payments?.reduce(
                            (sum, vp) => sum + vp.amount,
                            0
                          ) || 0
                        )}
                      </span>
                    </div>
                  </div>
                ) : (
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
                )}
              </div>

              <Separator />

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                {readOnly ? (
                  <p className="text-sm text-muted-foreground">
                    {selectedVisit.notes || 'No notes'}
                  </p>
                ) : (
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Add notes..."
                    rows={3}
                  />
                )}
              </div>

              {/* Actions */}
              {!readOnly && (
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
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
