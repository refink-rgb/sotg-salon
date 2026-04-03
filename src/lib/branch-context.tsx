'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Branch, UserRole } from '@/types/database'

interface BranchContextValue {
  branchId: string | null
  branch: Branch | null
  userRole: UserRole | null
  loading: boolean
}

const BranchContext = createContext<BranchContextValue>({
  branchId: null,
  branch: null,
  userRole: null,
  loading: true,
})

export function useBranch() {
  return useContext(BranchContext)
}

/**
 * Provides branch context from the logged-in user's profile.
 * Used by dashboard and admin layouts.
 */
export function BranchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BranchContextValue>({
    branchId: null,
    branch: null,
    userRole: null,
    loading: true,
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setState(s => ({ ...s, loading: false }))
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id')
        .eq('id', user.id)
        .single()

      if (!profile) {
        setState(s => ({ ...s, loading: false }))
        return
      }

      let branch: Branch | null = null
      if (profile.branch_id) {
        const { data } = await supabase
          .from('branches')
          .select('*')
          .eq('id', profile.branch_id)
          .single()
        branch = data
      }

      setState({
        branchId: profile.branch_id,
        branch,
        userRole: profile.role as UserRole,
        loading: false,
      })
    }
    load()
  }, [])

  return (
    <BranchContext.Provider value={state}>
      {children}
    </BranchContext.Provider>
  )
}
