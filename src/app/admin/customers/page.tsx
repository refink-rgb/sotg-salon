'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { format, differenceInMinutes } from 'date-fns'
import { Search, ChevronDown, ChevronUp, Trash2, Copy } from 'lucide-react'
import { copyTableToClipboard, formatPeso } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useBranch } from '@/lib/branch-context'
import type { Customer, Visit, VisitService, Service } from '@/types/database'

interface CustomerWithVisitCount extends Customer {
  visit_count: number
}

interface VisitDetail extends Visit {
  visit_services: (VisitService & { service: Service })[]
}


export default function CustomersPage() {
  const { branchId } = useBranch()
  const [customers, setCustomers] = useState<CustomerWithVisitCount[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [visitDetails, setVisitDetails] = useState<VisitDetail[]>([])
  const [loadingVisits, setLoadingVisits] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [customerToDelete, setCustomerToDelete] = useState<CustomerWithVisitCount | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCustomers = async () => {
    if (!branchId) return
    setLoading(true)
    const supabase = createClient()

    try {
      // Customers are GLOBAL - do NOT filter by branch
      const { data: customerData, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .order('created_at', { ascending: false })

      if (customerError) throw customerError

      // Visit counts ARE branch-scoped
      const { data: visitCounts, error: visitError } = await supabase
        .from('visits')
        .select('customer_id')
        .eq('branch_id', branchId)

      if (visitError) throw visitError

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

  useEffect(() => {
    fetchCustomers()
  }, [branchId])

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
        .eq('branch_id', branchId)
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

  const handleDeleteCustomer = async () => {
    if (!customerToDelete) return
    setDeleting(true)
    try {
      const supabase = createClient()
      const { error } = await supabase.from('customers').delete().eq('id', customerToDelete.id)
      if (error) throw error
      toast.success(`Deleted ${customerToDelete.first_name} ${customerToDelete.last_name}`)
      setDeleteDialogOpen(false)
      setCustomerToDelete(null)
      if (expandedId === customerToDelete.id) {
        setExpandedId(null)
        setVisitDetails([])
      }
      await fetchCustomers()
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to delete customer')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customer History</h1>
        <Button variant="outline" size="sm" onClick={async () => {
          const headers = ['Name', 'Phone', 'City', 'Type', 'Registration Date', 'Visits']
          const rows = filtered.map(c => [`${c.first_name} ${c.last_name}`, c.phone || '', c.city || '', c.is_returning ? 'Returning' : 'First Visit', c.created_at ? format(new Date(c.created_at), 'yyyy-MM-dd') : '', String(c.visit_count)])
          await copyTableToClipboard(headers, rows)
          toast.success(`Copied ${rows.length} customers`)
        }}>
          <Copy className="size-3.5 mr-1" /> Copy
        </Button>
      </div>

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
                  <TableHead />
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
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={(e) => {
                            e.stopPropagation()
                            setCustomerToDelete(customer)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>

                    {expandedId === customer.id && (
                      <TableRow key={`${customer.id}-detail`}>
                        <TableCell colSpan={8} className="bg-gray-50 p-0">
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
                                      <TableHead>Service Time</TableHead>
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
                                            ? formatPeso(visit.total_amount)
                                            : '-'}
                                        </TableCell>
                                        <TableCell>
                                          {visit.created_at && visit.completed_at ? (() => {
                                            const mins = differenceInMinutes(new Date(visit.completed_at), new Date(visit.created_at))
                                            if (mins < 60) return `${mins} min`
                                            const h = Math.floor(mins / 60)
                                            const m = mins % 60
                                            return m > 0 ? `${h}h ${m}m` : `${h}h`
                                          })() : visit.status === 'in_progress' ? 'In progress' : '-'}
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {customerToDelete?.first_name} {customerToDelete?.last_name}? This will also delete all their visit records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteCustomer} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
