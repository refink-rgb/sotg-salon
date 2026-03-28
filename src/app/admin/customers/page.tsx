'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Customer, Visit, VisitService, Service } from '@/types/database'

interface CustomerWithVisitCount extends Customer {
  visit_count: number
}

interface VisitDetail extends Visit {
  visit_services: (VisitService & { service: Service })[]
}

function formatCurrency(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerWithVisitCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visitDetails, setVisitDetails] = useState<VisitDetail[]>([])
  const [loadingVisits, setLoadingVisits] = useState(false)

  useEffect(() => {
    async function fetchCustomers() {
      setLoading(true)
      const supabase = createClient()

      try {
        // Fetch all customers
        const { data: customerData, error: customerError } = await supabase
          .from('customers')
          .select('*')
          .order('created_at', { ascending: false })

        if (customerError) throw customerError

        // Fetch visit counts per customer
        const { data: visitCounts, error: visitError } = await supabase
          .from('visits')
          .select('customer_id')

        if (visitError) throw visitError

        // Count visits per customer
        const countMap: Record<string, number> = {}
        visitCounts?.forEach(v => {
          countMap[v.customer_id] = (countMap[v.customer_id] || 0) + 1
        })

        const enriched: CustomerWithVisitCount[] = (customerData ?? []).map(c => ({
          ...c,
          visit_count: countMap[c.id] || 0,
        }))

        setCustomers(enriched)
      } catch (error) {
        console.error('Error:', error)
        toast.error('Failed to load customers')
      } finally {
        setLoading(false)
      }
    }

    fetchCustomers()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(c =>
      `${c.first_name} ${c.last_name}`.toLowerCase().includes(q) ||
      (c.phone && c.phone.toLowerCase().includes(q))
    )
  }, [customers, search])

  async function toggleExpand(customerId: string) {
    if (expandedId === customerId) {
      setExpandedId(null)
      setVisitDetails([])
      return
    }

    setExpandedId(customerId)
    setLoadingVisits(true)

    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('visits')
        .select('*, visit_services(*, service:services(*))')
        .eq('customer_id', customerId)
        .order('date', { ascending: false })

      if (error) throw error
      setVisitDetails((data as VisitDetail[]) ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load visit details')
    } finally {
      setLoadingVisits(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Customer History</h1>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" />
        <Input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No customers found.</div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Registration Date</TableHead>
                  <TableHead className="text-right">Total Visits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(customer => (
                  <>
                    <TableRow
                      key={customer.id}
                      className="cursor-pointer"
                      onClick={() => toggleExpand(customer.id)}
                    >
                      <TableCell>
                        {expandedId === customer.id ? (
                          <ChevronUp className="size-4 text-gray-500" />
                        ) : (
                          <ChevronDown className="size-4 text-gray-500" />
                        )}
                      </TableCell>
                      <TableCell className="font-medium">
                        {customer.first_name} {customer.last_name}
                      </TableCell>
                      <TableCell>{customer.phone || '-'}</TableCell>
                      <TableCell>{customer.city || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={customer.is_returning ? 'default' : 'secondary'}>
                          {customer.is_returning ? 'Returning' : 'First Visit'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {format(new Date(customer.created_at), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {customer.visit_count}
                      </TableCell>
                    </TableRow>

                    {expandedId === customer.id && (
                      <TableRow key={`${customer.id}-detail`}>
                        <TableCell colSpan={7} className="bg-gray-50 p-0">
                          <div className="p-4 space-y-4">
                            {/* Customer Info */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                              <Card>
                                <CardContent className="p-3">
                                  <p className="text-xs text-gray-500">Name</p>
                                  <p className="font-medium">{customer.first_name} {customer.last_name}</p>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="p-3">
                                  <p className="text-xs text-gray-500">Phone</p>
                                  <p className="font-medium">{customer.phone || '-'}</p>
                                </CardContent>
                              </Card>
                              <Card>
                                <CardContent className="p-3">
                                  <p className="text-xs text-gray-500">City</p>
                                  <p className="font-medium">{customer.city || '-'}</p>
                                </CardContent>
                              </Card>
                            </div>

                            {/* Visit History */}
                            <div>
                              <h3 className="text-sm font-semibold mb-2">Visit History</h3>
                              {loadingVisits ? (
                                <p className="text-sm text-gray-500">Loading visits...</p>
                              ) : visitDetails.length === 0 ? (
                                <p className="text-sm text-gray-500">No visits recorded.</p>
                              ) : (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Date</TableHead>
                                      <TableHead>Services</TableHead>
                                      <TableHead className="text-right">Amount</TableHead>
                                      <TableHead>Status</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {visitDetails.map(visit => (
                                      <TableRow key={visit.id}>
                                        <TableCell>
                                          {format(new Date(visit.date), 'MMM d, yyyy')}
                                        </TableCell>
                                        <TableCell>
                                          {visit.visit_services?.length > 0
                                            ? visit.visit_services.map(vs => vs.service?.name || 'Unknown').join(', ')
                                            : '-'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                          {visit.total_amount != null
                                            ? formatCurrency(visit.total_amount)
                                            : '-'}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant={visit.status === 'completed' ? 'default' : 'secondary'}>
                                            {visit.status === 'completed' ? 'Completed' : 'In Progress'}
                                          </Badge>
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              )}
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
