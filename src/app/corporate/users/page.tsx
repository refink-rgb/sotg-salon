'use client'

import { useEffect, useState } from 'react'
import { createUser, updateUser, resetPassword, listUsers } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Pencil, Loader2, Key, Users } from 'lucide-react'
import { toast } from 'sonner'
import type { Branch } from '@/types/database'

interface UserRow {
  id: string
  display_name: string
  role: string
  branch_id: string | null
  branch_name: string | null
  created_at: string
}

const ROLE_LABELS: Record<string, string> = {
  stylist: 'Stylist',
  admin: 'Branch Admin',
  owner: 'Owner',
}

const ROLE_COLORS: Record<string, string> = {
  stylist: 'bg-blue-100 text-blue-700',
  admin: 'bg-green-100 text-green-700',
  owner: 'bg-amber-100 text-amber-700',
}

export default function UsersPage() {
  const supabase = createClient()
  const [users, setUsers] = useState<UserRow[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  // Add dialog
  const [addOpen, setAddOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<string>('stylist')
  const [newBranch, setNewBranch] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editUser, setEditUser] = useState<UserRow | null>(null)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState<string>('stylist')
  const [editBranch, setEditBranch] = useState<string>('')
  const [editPassword, setEditPassword] = useState('')

  async function fetchData() {
    const [usersRes, branchesRes] = await Promise.all([
      listUsers(),
      supabase.from('branches').select('*').eq('is_active', true).order('name'),
    ])
    setUsers(usersRes.users)
    setBranches(branchesRes.data || [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleAdd() {
    if (!newName.trim()) { toast.error('Name is required'); return }
    if (!newPassword || newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if ((newRole === 'stylist' || newRole === 'admin') && !newBranch) { toast.error('Please select a branch'); return }

    setSaving(true)
    const result = await createUser(
      newName.trim(),
      newPassword,
      newRole as 'stylist' | 'admin' | 'owner',
      newRole === 'owner' ? null : newBranch
    )

    if (result.success) {
      toast.success(`User "${newName.trim()}" created`)
      setAddOpen(false)
      setNewName('')
      setNewPassword('')
      setNewRole('stylist')
      setNewBranch('')
      fetchData()
    } else {
      toast.error(result.error || 'Failed to create user')
    }
    setSaving(false)
  }

  function openEdit(user: UserRow) {
    setEditUser(user)
    setEditName(user.display_name)
    setEditRole(user.role)
    setEditBranch(user.branch_id || '')
    setEditPassword('')
    setEditOpen(true)
  }

  async function handleEdit() {
    if (!editUser) return
    setSaving(true)

    // Update profile
    const result = await updateUser(editUser.id, {
      displayName: editName.trim() !== editUser.display_name ? editName.trim() : undefined,
      role: editRole !== editUser.role ? editRole as 'stylist' | 'admin' | 'owner' : undefined,
      branchId: editBranch !== (editUser.branch_id || '') ? (editBranch || null) : undefined,
    })

    if (!result.success) {
      toast.error(result.error || 'Failed to update user')
      setSaving(false)
      return
    }

    // Reset password if provided
    if (editPassword.trim()) {
      if (editPassword.length < 6) {
        toast.error('Password must be at least 6 characters')
        setSaving(false)
        return
      }
      const pwResult = await resetPassword(editUser.id, editPassword)
      if (!pwResult.success) {
        toast.error(pwResult.error || 'Failed to reset password')
        setSaving(false)
        return
      }
      toast.success('Password updated')
    }

    toast.success('User updated')
    setEditOpen(false)
    fetchData()
    setSaving(false)
  }

  if (loading) {
    return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="size-8 animate-spin text-amber-600" /></div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">Manage staff accounts, roles, and branch access</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger render={<Button><Plus className="size-4 mr-1" /> Add User</Button>} />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Add New User</DialogTitle>
              <DialogDescription>Create a staff account. They will log in with their name and the password you set.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>Display Name *</Label>
                <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Maria Santos" />
                {newName.trim() && (
                  <p className="text-xs text-gray-400 mt-1">
                    Login name: <strong>{newName.trim().toLowerCase().replace(/\s+/g, '')}</strong>
                  </p>
                )}
              </div>
              <div>
                <Label>Password *</Label>
                <Input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Set a password (min 6 chars)" />
              </div>
              <div>
                <Label>Role *</Label>
                <Select value={newRole} onValueChange={v => setNewRole(v ?? 'stylist')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stylist">Stylist (queue only)</SelectItem>
                    <SelectItem value="admin">Branch Admin (full branch access)</SelectItem>
                    <SelectItem value="owner">Owner (all branches + corporate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {newRole !== 'owner' && (
                <div>
                  <Label>Branch *</Label>
                  <Select value={newBranch} onValueChange={v => setNewBranch(v ?? '')}>
                    <SelectTrigger><SelectValue placeholder="Select branch..." /></SelectTrigger>
                    <SelectContent>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={handleAdd} disabled={saving}>
                {saving ? 'Creating...' : 'Create User'}
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
                <TableHead>Name</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map(user => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.display_name}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                      {user.display_name.trim().toLowerCase().replace(/\s+/g, '')}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge className={ROLE_COLORS[user.role] || ''}>
                      {ROLE_LABELS[user.role] || user.role}
                    </Badge>
                  </TableCell>
                  <TableCell>{user.branch_name || <span className="text-gray-400">All branches</span>}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(user)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {users.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">No users found</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details, role, or reset their password.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Display Name</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={editRole} onValueChange={v => setEditRole(v ?? 'stylist')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stylist">Stylist</SelectItem>
                  <SelectItem value="admin">Branch Admin</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editRole !== 'owner' && (
              <div>
                <Label>Branch</Label>
                <Select value={editBranch} onValueChange={v => setEditBranch(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Select branch..." /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => (
                      <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="border-t pt-4">
              <Label className="flex items-center gap-2"><Key className="size-3.5" /> Reset Password</Label>
              <Input
                type="text"
                value={editPassword}
                onChange={e => setEditPassword(e.target.value)}
                placeholder="Leave blank to keep current password"
                className="mt-1.5"
              />
              <p className="text-xs text-gray-400 mt-1">Only you (the owner) can change passwords</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleEdit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
