'use server'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function nameToEmail(name: string): string {
  return `${name.trim().toLowerCase().replace(/\s+/g, '')}@sotg.local`
}

export async function createUser(
  displayName: string,
  password: string,
  role: 'stylist' | 'admin' | 'owner',
  branchId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient()
    const email = nameToEmail(displayName)

    // Create auth user
    const { data, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) {
      if (authError.message.includes('already been registered')) {
        return { success: false, error: 'A user with this name already exists' }
      }
      return { success: false, error: authError.message }
    }

    if (!data.user) {
      return { success: false, error: 'Failed to create user' }
    }

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: data.user.id,
      display_name: displayName.trim(),
      role,
      branch_id: branchId,
    })

    if (profileError) {
      // Clean up: delete auth user if profile creation fails
      await supabase.auth.admin.deleteUser(data.user.id)
      return { success: false, error: profileError.message }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Unexpected error' }
  }
}

export async function updateUser(
  userId: string,
  updates: {
    displayName?: string
    role?: 'stylist' | 'admin' | 'owner'
    branchId?: string | null
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient()

    const profileUpdate: Record<string, unknown> = {}
    if (updates.displayName !== undefined) profileUpdate.display_name = updates.displayName.trim()
    if (updates.role !== undefined) profileUpdate.role = updates.role
    if (updates.branchId !== undefined) profileUpdate.branch_id = updates.branchId

    if (Object.keys(profileUpdate).length > 0) {
      const { error } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)

      if (error) return { success: false, error: error.message }
    }

    // If display name changed, update auth email too
    if (updates.displayName) {
      const newEmail = nameToEmail(updates.displayName)
      await supabase.auth.admin.updateUserById(userId, { email: newEmail })
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: 'Unexpected error' }
  }
}

export async function resetPassword(
  userId: string,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getAdminClient()

    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword,
    })

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (error) {
    return { success: false, error: 'Unexpected error' }
  }
}

export async function listUsers(): Promise<{
  users: Array<{
    id: string
    display_name: string
    role: string
    branch_id: string | null
    branch_name: string | null
    created_at: string
  }>
}> {
  const supabase = getAdminClient()

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, role, branch_id, created_at')
    .order('created_at')

  if (!profiles) return { users: [] }

  // Get branch names
  const { data: branches } = await supabase
    .from('branches')
    .select('id, name')

  const branchMap = new Map((branches || []).map(b => [b.id, b.name]))

  return {
    users: profiles.map(p => ({
      ...p,
      branch_name: p.branch_id ? branchMap.get(p.branch_id) || null : null,
    })),
  }
}
