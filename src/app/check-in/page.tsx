'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Scissors } from 'lucide-react'
import { toast } from 'sonner'
import type { Service } from '@/types/database'

export default function CheckInPage() {
  const router = useRouter()
  const supabase = createClient()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('Mabalacat City')
  const [isFirstTime, setIsFirstTime] = useState(true)
  const [services, setServices] = useState<Service[]>([])
  const [selectedServices, setSelectedServices] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingServices, setLoadingServices] = useState(true)

  useEffect(() => {
    async function fetchServices() {
      const { data, error } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true)
        .order('display_order')

      if (error) {
        toast.error('Failed to load services')
        console.error(error)
      } else {
        setServices(data || [])
      }
      setLoadingServices(false)
    }
    fetchServices()
  }, [])

  function toggleService(serviceId: string) {
    setSelectedServices((prev) =>
      prev.includes(serviceId)
        ? prev.filter((id) => id !== serviceId)
        : [...prev, serviceId]
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!firstName.trim() || !lastName.trim() || !phone.trim() || !city.trim()) {
      toast.error('Please fill in all required fields')
      return
    }

    if (selectedServices.length === 0) {
      toast.error('Please select at least one service')
      return
    }

    setLoading(true)

    try {
      const customerId = crypto.randomUUID()
      const visitId = crypto.randomUUID()
      const today = new Date().toISOString().split('T')[0]

      // Insert new customer
      const { error: customerError } = await supabase
        .from('customers')
        .insert({
          id: customerId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim(),
          city: city.trim(),
          is_returning: !isFirstTime,
        })

      if (customerError) throw customerError

      // Create visit record
      const { error: visitError } = await supabase
        .from('visits')
        .insert({
          id: visitId,
          customer_id: customerId,
          date: today,
          status: 'in_progress',
        })

      if (visitError) throw visitError

      // Insert visit services
      const visitServices = selectedServices.map((serviceId) => ({
        visit_id: visitId,
        service_id: serviceId,
        price: null,
      }))

      const { error: vsError } = await supabase
        .from('visit_services')
        .insert(visitServices)

      if (vsError) throw vsError

      router.push('/check-in/success')
    } catch (error) {
      console.error(error)
      toast.error('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="bg-[#1B4332] px-4 py-6 text-center">
        <div className="flex items-center justify-center gap-2">
          <Scissors className="size-7 text-white" />
          <h1 className="text-2xl font-bold text-white">Salon On The Go</h1>
        </div>
        <p className="mt-1 text-sm text-green-200">Welcome! Please check in below.</p>
      </div>

      <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-5 px-4 py-6">
        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First Name *</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Juan"
              required
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last Name *</Label>
            <Input
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Dela Cruz"
              required
              className="h-10"
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09171234567"
            required
            className="h-10"
          />
        </div>

        {/* City */}
        <div className="space-y-1.5">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Mabalacat City"
            required
            className="h-10"
          />
        </div>

        {/* First Time Checkbox */}
        <div className="flex items-center gap-2.5">
          <Checkbox
            id="firstTime"
            checked={isFirstTime}
            onCheckedChange={(checked) => setIsFirstTime(checked === true)}
          />
          <Label htmlFor="firstTime" className="text-sm font-normal cursor-pointer">
            First time visiting?
          </Label>
        </div>

        {/* Service Selection */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Select Services *</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingServices ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin text-[#40916C]" />
              </div>
            ) : services.length === 0 ? (
              <p className="text-sm text-muted-foreground">No services available</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 transition-colors ${
                      selectedServices.includes(service.id)
                        ? 'border-[#40916C] bg-[#40916C]/10'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <Checkbox
                      checked={selectedServices.includes(service.id)}
                      onCheckedChange={() => toggleService(service.id)}
                    />
                    <span className="text-sm font-medium">{service.name}</span>
                  </label>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Submit Button */}
        <Button
          type="submit"
          disabled={loading}
          className="h-12 w-full bg-[#1B4332] text-base font-semibold text-white hover:bg-[#1B4332]/90"
        >
          {loading ? (
            <>
              <Loader2 className="size-5 animate-spin" />
              Checking in...
            </>
          ) : (
            'Check In'
          )}
        </Button>

        <div className="text-center pt-2">
          <a href="/login" className="text-xs text-gray-400 hover:text-gray-600">
            Staff Login →
          </a>
        </div>
      </form>
    </div>
  )
}
