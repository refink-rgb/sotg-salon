'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Building2, Plus, Copy, Loader2, Pencil, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { useBranch } from '@/lib/branch-context'
import type { Branch } from '@/types/database'

export default function BranchesPage() {
  const supabase = createClient()
  const router = useRouter()
  const { switchBranch } = useBranch()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [saving, setSaving] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)
  const [editName, setEditName] = useState('')
  const [editAddress, setEditAddress] = useState('')
  const [editActive, setEditActive] = useState(true)

  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('*').order('created_at')
    setBranches(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBranches() }, [])

  function generateSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30)
  }

  async function handleAdd() {
    if (!newName.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    try {
      const slug = generateSlug(newName)
      const { error } = await supabase.from('branches').insert({
        name: newName.trim(),
        slug,
        address: newAddress.trim() || null,
      })
      if (error) throw error
      toast.success(`Branch "${newName.trim()}" created`)
      setAddOpen(false)
      setNewName('')
      setNewAddress('')
      fetchBranches()
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to create branch'
      toast.error(msg.includes('duplicate') ? 'A branch with a similar name already exists' : msg)
    } finally {
      setSaving(false)
    }
  }

  function openEdit(branch: Branch) {
    setEditBranch(branch)
    setEditName(branch.name)
    setEditAddress(branch.address || '')
    setEditActive(branch.is_active)
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editBranch || !editName.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('branches').update({
        name: editName.trim(),
        address: editAddress.trim() || null,
        is_active: editActive,
      }).eq('id', editBranch.id)
      if (error) throw error
      toast.success('Branch updated')
      setEditOpen(false)
      fetchBranches()
    } catch {
      toast.error('Failed to update branch')
    } finally {
      setSaving(false)
    }
  }

  function copyKioskUrl(slug: string) {
    const url = `${window.location.origin}/b/${slug}/check-in`
    navigator.clipboard.writeText(url)
    toast.success('Kiosk URL copied to clipboard')
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-amber-600" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Branches</h1>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button><Plus className="size-4 mr-1" /> Add Branch</Button>} />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New Branch</DialogTitle>
              <DialogDescription>Create a new salon location. Each branch gets its own kiosk URL and staff accounts.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label htmlFor="branch-name">Branch Name *</Label>
                <Input id="branch-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Angeles City" />
                {newName.trim() && (
                  <p className="text-xs text-gray-400 mt-1">
                    Kiosk URL: /b/<strong>{generateSlug(newName)}</strong>/check-in
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="branch-address">Address (optional)</Label>
                <Input id="branch-address" value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="123 Main St, Angeles City" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create Branch'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Kiosk URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.map(branch => (
                <TableRow
                  key={branch.id}
                  className="cursor-pointer hover:bg-amber-50"
                  onClick={() => {
                    switchBranch(branch.id)
                    router.push('/dashboard')
                  }}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-amber-600" />
                      <div>
                        <p className="font-medium">{branch.name}</p>
                        {branch.address && <p className="text-xs text-gray-400">{branch.address}</p>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{branch.slug}</code></TableCell>
                  <TableCell>
                    <button
                      onClick={(e) => { e.stopPropagation(); copyKioskUrl(branch.slug) }}
                      className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800"
                    >
                      <Copy className="size-3" />
                      Copy Link
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                      {branch.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openEdit(branch) }}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <ArrowRight className="size-4 text-gray-300 group-hover:text-amber-500" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Branch</DialogTitle>
            <DialogDescription>Update branch details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Branch Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editActive} onCheckedChange={setEditActive} />
              <Label>Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
