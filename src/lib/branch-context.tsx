'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Branch } from '@/types/database'

interface BranchContextValue {
  branchId: string | null
  branchName: string | null
  userRole: string | null
  branches: Branch[]
  loading: boolean
}

const BranchContext = createContext<BranchContextValue>({
  branchId: null,
  branchName: null,
  userRole: null,
  branches: [],
  loading: true,
})

export function useBranch() {
  return useContext(BranchContext)
}

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const [branchId, setBranchId] = useState<string | null>(null)
  const [branchName, setBranchName] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function init() {
      const supabase = createClient()

      // Get current user's profile
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, branch_id')
        .eq('id', user.id)
        .single()

      if (!profile) { setLoading(false); return }

      setUserRole(profile.role)

      // Owner sees all branches
      if (profile.role === 'owner') {
        const { data: allBranches } = await supabase
          .from('branches')
          .select('*')
          .eq('is_active', true)
          .order('name')
        setBranches(allBranches || [])
        // Default to first branch for owner's dashboard queries
        if (allBranches && allBranches.length > 0) {
          setBranchId(allBranches[0].id)
          setBranchName(allBranches[0].name)
        }
      } else {
        // Stylist/admin: use their assigned branch
        setBranchId(profile.branch_id)
        if (profile.branch_id) {
          const { data: branch } = await supabase
            .from('branches')
            .select('*')
            .eq('id', profile.branch_id)
            .single()
          if (branch) {
            setBranchName(branch.name)
            setBranches([branch])
          }
        }
      }

      setLoading(false)
    }

    init()
  }, [])

  return (
    <BranchContext.Provider value={{ branchId, branchName, userRole, branches, loading }}>
      {children}
    </BranchContext.Provider>
  )
}
