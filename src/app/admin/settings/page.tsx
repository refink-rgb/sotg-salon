'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useBranch } from '@/lib/branch-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Plus, Pencil, Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { Service, Employee, RecurringExpense, Partner, AppSettings } from '@/types/database'
import { EXPENSE_CATEGORIES } from '@/lib/constants'

export default function SettingsPage() {
  const { branchId } = useBranch()
  const [services, setServices] = useState<Service[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([])
  const [partners, setPartners] = useState<Partner[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  // Service form state
  const [newServiceName, setNewServiceName] = useState('')
  const [editingService, setEditingService] = useState<Service | null>(null)
  const [editServiceName, setEditServiceName] = useState('')

  // Employee dialog state
  const [empDialogOpen, setEmpDialogOpen] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [empForm, setEmpForm] = useState({
    name: '',
    daily_rate: '',
    commission_per_head_rate: '',
    commission_percentage: '',
    is_in_service_charge_pool: true,
    is_internal: true,
  })

  // Recurring expense form
  const [newExpName, setNewExpName] = useState('')
  const [newExpCategory, setNewExpCategory] = useState('other')
  const [newExpAmount, setNewExpAmount] = useState('')

  // Partner dialog
  const [partnerDialogOpen, setPartnerDialogOpen] = useState(false)
  const [editingPartner, setEditingPartner] = useState<Partner | null>(null)
  const [partnerForm, setPartnerForm] = useState({ name: '', split_percentage: '' })

  // General settings
  const [scThreshold, setScThreshold] = useState('3000')
  const [scAmount, setScAmount] = useState('100')
  const [bonusThreshold, setBonusThreshold] = useState('3000')
  const [bonusAmount, setBonusAmount] = useState('100')

  const supabase = createClient()

  useEffect(() => {
    fetchAll()
  }, [branchId])

  async function fetchAll() {
    if (!branchId) return
    setLoading(true)
    try {
      const [svcRes, empRes, reRes, partRes, settRes] = await Promise.all([
        supabase.from('services').select('*').order('display_order'),
        supabase.from('employees').select('*').order('name'),
        supabase.from('recurring_expenses').select('*').eq('branch_id', branchId).order('name'),
        supabase.from('partners').select('*').order('name'),
        supabase.from('app_settings').select('*'),
      ])

      setServices(svcRes.data ?? [])
      setEmployees(empRes.data ?? [])
      setRecurringExpenses(reRes.data ?? [])
      setPartners(partRes.data ?? [])

      const s: Record<string, string> = {}
      ;(settRes.data ?? []).forEach((row: AppSettings) => { s[row.key] = row.value })
      setSettings(s)
      setScThreshold(s['service_charge_threshold'] || '3000')
      setScAmount(s['service_charge_amount'] || '100')
      setBonusThreshold(s['commission_bonus_threshold'] || '3000')
      setBonusAmount(s['commission_bonus_amount'] || '100')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  // ---- SERVICES ----
  const handleAddService = async () => {
    if (!newServiceName.trim()) return
    try {
      const maxOrder = services.reduce((max, s) => Math.max(max, s.display_order), 0)
      const { error } = await supabase.from('services').insert({
        name: newServiceName.trim(),
        display_order: maxOrder + 1,
        is_active: true,
      })
      if (error) throw error
      setNewServiceName('')
      toast.success('Service added')
      const { data } = await supabase.from('services').select('*').order('display_order')
      setServices(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to add service')
    }
  }

  const handleToggleService = async (svc: Service) => {
    try {
      const { error } = await supabase.from('services').update({ is_active: !svc.is_active }).eq('id', svc.id)
      if (error) throw error
      setServices(prev => prev.map(s => s.id === svc.id ? { ...s, is_active: !s.is_active } : s))
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update service')
    }
  }

  const handleSaveServiceName = async () => {
    if (!editingService || !editServiceName.trim()) return
    try {
      const { error } = await supabase.from('services').update({ name: editServiceName.trim() }).eq('id', editingService.id)
      if (error) throw error
      setServices(prev => prev.map(s => s.id === editingService.id ? { ...s, name: editServiceName.trim() } : s))
      setEditingService(null)
      toast.success('Service updated')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update service')
    }
  }

  // ---- EMPLOYEES ----
  const openEmpDialog = (emp?: Employee) => {
    if (emp) {
      setEditingEmployee(emp)
      setEmpForm({
        name: emp.name,
        daily_rate: String(emp.daily_rate),
        commission_per_head_rate: String(emp.commission_per_head_rate),
        commission_percentage: String(emp.commission_percentage * 100),
        is_in_service_charge_pool: emp.is_in_service_charge_pool,
        is_internal: emp.is_internal,
      })
    } else {
      setEditingEmployee(null)
      setEmpForm({ name: '', daily_rate: '', commission_per_head_rate: '', commission_percentage: '', is_in_service_charge_pool: true, is_internal: true })
    }
    setEmpDialogOpen(true)
  }

  const handleSaveEmployee = async () => {
    if (!empForm.name.trim()) {
      toast.error('Name is required')
      return
    }
    const payload = {
      name: empForm.name.trim(),
      daily_rate: Number(empForm.daily_rate) || 0,
      commission_per_head_rate: Number(empForm.commission_per_head_rate) || 0,
      commission_percentage: (Number(empForm.commission_percentage) || 0) / 100,
      is_in_service_charge_pool: empForm.is_in_service_charge_pool,
      is_internal: empForm.is_internal,
    }

    try {
      if (editingEmployee) {
        const { error } = await supabase.from('employees').update(payload).eq('id', editingEmployee.id)
        if (error) throw error
        toast.success('Employee updated')
      } else {
        const { error } = await supabase.from('employees').insert({ ...payload, is_active: true })
        if (error) throw error
        toast.success('Employee added')
      }
      setEmpDialogOpen(false)
      const { data } = await supabase.from('employees').select('*').order('name')
      setEmployees(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to save employee')
    }
  }

  const handleDeactivateEmployee = async (emp: Employee) => {
    try {
      const { error } = await supabase.from('employees').update({ is_active: !emp.is_active }).eq('id', emp.id)
      if (error) throw error
      setEmployees(prev => prev.map(e => e.id === emp.id ? { ...e, is_active: !e.is_active } : e))
      toast.success(emp.is_active ? 'Employee deactivated' : 'Employee reactivated')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update employee')
    }
  }

  // ---- RECURRING EXPENSES ----
  const handleAddRecurring = async () => {
    if (!newExpName.trim()) return
    try {
      const { error } = await supabase.from('recurring_expenses').insert({
        name: newExpName.trim(),
        category: newExpCategory,
        default_amount: Number(newExpAmount) || 0,
        is_active: true,
        branch_id: branchId,
      })
      if (error) throw error
      setNewExpName('')
      setNewExpAmount('')
      toast.success('Recurring expense added')
      const { data } = await supabase.from('recurring_expenses').select('*').eq('branch_id', branchId).order('name')
      setRecurringExpenses(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to add expense')
    }
  }

  const handleUpdateRecurringAmount = async (re: RecurringExpense, newAmount: string) => {
    try {
      const { error } = await supabase.from('recurring_expenses').update({ default_amount: Number(newAmount) || 0 }).eq('id', re.id)
      if (error) throw error
      setRecurringExpenses(prev => prev.map(e => e.id === re.id ? { ...e, default_amount: Number(newAmount) || 0 } : e))
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to update amount')
    }
  }

  const handleDeleteRecurring = async (id: string) => {
    try {
      const { error } = await supabase.from('recurring_expenses').delete().eq('id', id)
      if (error) throw error
      setRecurringExpenses(prev => prev.filter(e => e.id !== id))
      toast.success('Expense removed')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to remove expense')
    }
  }

  // ---- PARTNERS ----
  const openPartnerDialog = (p?: Partner) => {
    if (p) {
      setEditingPartner(p)
      setPartnerForm({ name: p.name, split_percentage: String(p.split_percentage) })
    } else {
      setEditingPartner(null)
      setPartnerForm({ name: '', split_percentage: '' })
    }
    setPartnerDialogOpen(true)
  }

  const handleSavePartner = async () => {
    if (!partnerForm.name.trim()) {
      toast.error('Name is required')
      return
    }
    const pct = Number(partnerForm.split_percentage) || 0

    // Validate: total must sum to 100
    const existingTotal = partners
      .filter(p => editingPartner ? p.id !== editingPartner.id : true)
      .reduce((s, p) => s + p.split_percentage, 0)

    if (existingTotal + pct > 100) {
      toast.error(`Total split would be ${existingTotal + pct}%. Must sum to 100% or less.`)
      return
    }

    try {
      if (editingPartner) {
        const { error } = await supabase.from('partners').update({ name: partnerForm.name.trim(), split_percentage: pct }).eq('id', editingPartner.id)
        if (error) throw error
        toast.success('Partner updated')
      } else {
        const { error } = await supabase.from('partners').insert({ name: partnerForm.name.trim(), split_percentage: pct, is_active: true })
        if (error) throw error
        toast.success('Partner added')
      }
      setPartnerDialogOpen(false)
      const { data } = await supabase.from('partners').select('*').order('name')
      setPartners(data ?? [])
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to save partner')
    }
  }

  const handleDeletePartner = async (id: string) => {
    try {
      const { error } = await supabase.from('partners').delete().eq('id', id)
      if (error) throw error
      setPartners(prev => prev.filter(p => p.id !== id))
      toast.success('Partner removed')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to remove partner')
    }
  }

  // ---- GENERAL SETTINGS ----
  const handleSaveSettings = async () => {
    const pairs = [
      { key: 'service_charge_threshold', value: scThreshold },
      { key: 'service_charge_amount', value: scAmount },
      { key: 'commission_bonus_threshold', value: bonusThreshold },
      { key: 'commission_bonus_amount', value: bonusAmount },
    ]

    try {
      for (const pair of pairs) {
        const { error } = await supabase
          .from('app_settings')
          .upsert({ key: pair.key, value: pair.value }, { onConflict: 'key' })
        if (error) throw error
      }
      toast.success('Settings saved')
    } catch (error) {
      console.error('Error:', error)
      toast.error('Failed to save settings')
    }
  }

  const totalPartnerSplit = partners.reduce((s, p) => s + p.split_percentage, 0)

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>

      <Tabs defaultValue="services">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="recurring">Recurring Expenses</TabsTrigger>
          <TabsTrigger value="partners">Partners</TabsTrigger>
          <TabsTrigger value="general">General</TabsTrigger>
        </TabsList>

        {/* SERVICES TAB */}
        <TabsContent value="services">
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-center">Order</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {services.map(svc => (
                    <TableRow key={svc.id}>
                      <TableCell>
                        {editingService?.id === svc.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editServiceName}
                              onChange={e => setEditServiceName(e.target.value)}
                              className="h-7 w-40"
                              onKeyDown={e => e.key === 'Enter' && handleSaveServiceName()}
                            />
                            <Button size="xs" onClick={handleSaveServiceName}>Save</Button>
                            <Button size="xs" variant="ghost" onClick={() => setEditingService(null)}>Cancel</Button>
                          </div>
                        ) : (
                          <span className="font-medium">{svc.name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">{svc.display_order}</TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={svc.is_active}
                          onCheckedChange={() => handleToggleService(svc)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon-xs"
                          variant="ghost"
                          onClick={() => { setEditingService(svc); setEditServiceName(svc.name) }}
                        >
                          <Pencil className="size-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <Separator />
              <div className="flex items-center gap-3">
                <Input
                  placeholder="New service name"
                  value={newServiceName}
                  onChange={e => setNewServiceName(e.target.value)}
                  className="w-60"
                  onKeyDown={e => e.key === 'Enter' && handleAddService()}
                />
                <Button size="sm" onClick={handleAddService}>
                  <Plus className="size-4 mr-1" /> Add Service
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* EMPLOYEES TAB */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Employees</CardTitle>
              <Button size="sm" onClick={() => openEmpDialog()}>
                <Plus className="size-4 mr-1" /> Add Employee
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Daily Rate</TableHead>
                    <TableHead className="text-right">Per Head</TableHead>
                    <TableHead className="text-right">Comm %</TableHead>
                    <TableHead className="text-center">SC Pool</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employees.map(emp => (
                    <TableRow key={emp.id}>
                      <TableCell className="font-medium">{emp.name}</TableCell>
                      <TableCell>
                        <Badge variant={emp.is_internal ? 'default' : 'outline'}>
                          {emp.is_internal ? 'Internal' : 'External'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">₱{emp.daily_rate.toLocaleString()}</TableCell>
                      <TableCell className="text-right">₱{emp.commission_per_head_rate.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{(emp.commission_percentage * 100).toFixed(1)}%</TableCell>
                      <TableCell className="text-center">{emp.is_in_service_charge_pool ? 'Yes' : 'No'}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant={emp.is_active ? 'default' : 'secondary'}>
                          {emp.is_active ? 'Active' : 'Inactive'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon-xs" variant="ghost" onClick={() => openEmpDialog(emp)}>
                            <Pencil className="size-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => handleDeactivateEmployee(emp)}>
                            <Trash2 className="size-3 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Employee Dialog */}
          <Dialog open={empDialogOpen} onOpenChange={setEmpDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingEmployee ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
                <DialogDescription>
                  {editingEmployee ? 'Update employee details.' : 'Enter new employee details.'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Name</Label>
                  <Input value={empForm.name} onChange={e => setEmpForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Daily Rate</Label>
                    <Input type="number" value={empForm.daily_rate} onChange={e => setEmpForm(p => ({ ...p, daily_rate: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Per Head Rate (pesos)</Label>
                    <Input type="number" value={empForm.commission_per_head_rate} onChange={e => setEmpForm(p => ({ ...p, commission_per_head_rate: e.target.value }))} />
                  </div>
                </div>
                <div>
                  <Label>Commission Percentage (%)</Label>
                  <Input type="number" value={empForm.commission_percentage} onChange={e => setEmpForm(p => ({ ...p, commission_percentage: e.target.value }))} />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={empForm.is_in_service_charge_pool}
                    onCheckedChange={v => setEmpForm(p => ({ ...p, is_in_service_charge_pool: v }))}
                  />
                  <Label>In Service Charge Pool</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={empForm.is_internal}
                    onCheckedChange={v => setEmpForm(p => ({ ...p, is_internal: v }))}
                  />
                  <Label>{empForm.is_internal ? 'Internal' : 'External'}</Label>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSaveEmployee}>
                  {editingEmployee ? 'Update' : 'Add'} Employee
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* RECURRING EXPENSES TAB */}
        <TabsContent value="recurring">
          <Card>
            <CardHeader>
              <CardTitle>Recurring Monthly Expenses</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Default Amount</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recurringExpenses.map(re => (
                    <TableRow key={re.id}>
                      <TableCell className="font-medium">{re.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{re.category}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          defaultValue={re.default_amount}
                          className="w-28 h-7 text-right inline-block"
                          onBlur={e => handleUpdateRecurringAmount(re, e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="icon-xs" variant="ghost" onClick={() => handleDeleteRecurring(re.id)}>
                          <Trash2 className="size-3 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {recurringExpenses.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-gray-500 py-8">No recurring expenses</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>

              <Separator />
              <div className="flex items-end gap-3">
                <div className="flex-1">
                  <Label>Name</Label>
                  <Input value={newExpName} onChange={e => setNewExpName(e.target.value)} />
                </div>
                <div className="w-32">
                  <Label>Category</Label>
                  <select
                    value={newExpCategory}
                    onChange={e => setNewExpCategory(e.target.value)}
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    {EXPENSE_CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Label>Amount</Label>
                  <Input type="number" value={newExpAmount} onChange={e => setNewExpAmount(e.target.value)} />
                </div>
                <Button size="sm" onClick={handleAddRecurring}>
                  <Plus className="size-4 mr-1" /> Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* PARTNERS TAB */}
        <TabsContent value="partners">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Partners</CardTitle>
                <p className={`text-sm mt-1 ${totalPartnerSplit === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  Total split: {totalPartnerSplit}% {totalPartnerSplit !== 100 && '(must sum to 100%)'}
                </p>
              </div>
              <Button size="sm" onClick={() => openPartnerDialog()}>
                <Plus className="size-4 mr-1" /> Add Partner
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead className="text-right">Split %</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map(p => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.split_percentage}%</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button size="icon-xs" variant="ghost" onClick={() => openPartnerDialog(p)}>
                            <Pencil className="size-3" />
                          </Button>
                          <Button size="icon-xs" variant="ghost" onClick={() => handleDeletePartner(p.id)}>
                            <Trash2 className="size-3 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {partners.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-gray-500 py-8">No partners</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Partner Dialog */}
          <Dialog open={partnerDialogOpen} onOpenChange={setPartnerDialogOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>{editingPartner ? 'Edit Partner' : 'Add Partner'}</DialogTitle>
                <DialogDescription>Set partner name and profit split percentage.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Name</Label>
                  <Input value={partnerForm.name} onChange={e => setPartnerForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Split Percentage (%)</Label>
                  <Input type="number" value={partnerForm.split_percentage} onChange={e => setPartnerForm(p => ({ ...p, split_percentage: e.target.value }))} />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleSavePartner}>
                  {editingPartner ? 'Update' : 'Add'} Partner
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* GENERAL SETTINGS TAB */}
        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>General Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <div>
                  <Label>Service Charge Threshold</Label>
                  <Input type="number" value={scThreshold} onChange={e => setScThreshold(e.target.value)} />
                  <p className="text-xs text-gray-500 mt-1">{"Bills >= this amount incur a service charge"}</p>
                </div>
                <div>
                  <Label>Service Charge Amount</Label>
                  <Input type="number" value={scAmount} onChange={e => setScAmount(e.target.value)} />
                  <p className="text-xs text-gray-500 mt-1">Amount charged per qualifying bill</p>
                </div>
                <div>
                  <Label>Commission Bonus Threshold</Label>
                  <Input type="number" value={bonusThreshold} onChange={e => setBonusThreshold(e.target.value)} />
                  <p className="text-xs text-gray-500 mt-1">{"Bills >= this amount trigger a bonus"}</p>
                </div>
                <div>
                  <Label>Commission Bonus Amount</Label>
                  <Input type="number" value={bonusAmount} onChange={e => setBonusAmount(e.target.value)} />
                  <p className="text-xs text-gray-500 mt-1">Bonus per qualifying bill</p>
                </div>
              </div>

              <Button onClick={handleSaveSettings} className="bg-[#1B4332] hover:bg-[#40916C]">
                <Save className="size-4 mr-1" /> Save Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
