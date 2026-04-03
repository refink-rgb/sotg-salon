'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { Plus, Pencil, Building2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { Branch } from '@/types/database'

export default function BranchesPage() {
  const supabase = createClient()
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | null>(null)
  const [form, setForm] = useState({ name: '', slug: '', address: '' })
  const [saving, setSaving] = useState(false)

  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('*').order('name')
    setBranches(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchBranches() }, [])

  function openAdd() {
    setEditing(null)
    setForm({ name: '', slug: '', address: '' })
    setDialogOpen(true)
  }

  function openEdit(branch: Branch) {
    setEditing(branch)
    setForm({ name: branch.name, slug: branch.slug, address: branch.address || '' })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Name and slug are required')
      return
    }
    const slug = form.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
    setSaving(true)
    try {
      if (editing) {
        const { error } = await supabase
          .from('branches')
          .update({ name: form.name.trim(), slug, address: form.address.trim() || null })
          .eq('id', editing.id)
        if (error) throw error
        toast.success('Branch updated')
      } else {
        const { error } = await supabase
          .from('branches')
          .insert({ name: form.name.trim(), slug, address: form.address.trim() || null })
        if (error) throw error
        toast.success('Branch created')
      }
      setDialogOpen(false)
      fetchBranches()
    } catch (error) {
      console.error(error)
      toast.error('Failed to save branch')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Branches</h1>
        <Button onClick={openAdd} size="sm">
          <Plus className="size-4 mr-1" /> Add Branch
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Kiosk URL</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {branches.map(branch => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Building2 className="size-4 text-[#40916C]" />
                        {branch.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-gray-500 font-mono text-sm">{branch.slug}</TableCell>
                    <TableCell className="text-gray-500">{branch.address || '-'}</TableCell>
                    <TableCell>
                      <a
                        href={`/b/${branch.slug}/check-in`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#40916C] hover:underline flex items-center gap-1"
                      >
                        /b/{branch.slug}/check-in
                        <ExternalLink className="size-3" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant={branch.is_active ? 'default' : 'secondary'}>
                        {branch.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(branch)}>
                        <Pencil className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Branch' : 'Add Branch'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Update the branch details.' : 'Create a new branch location.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Branch Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Angeles City" />
            </div>
            <div>
              <Label>URL Slug</Label>
              <Input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} placeholder="angeles" />
              <p className="text-xs text-gray-400 mt-1">Used in kiosk URL: /b/{form.slug || 'slug'}/check-in</p>
            </div>
            <div>
              <Label>Address</Label>
              <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Optional address" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Branch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
