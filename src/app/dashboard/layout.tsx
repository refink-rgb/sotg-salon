'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Scissors, LogOut, ClipboardList, Receipt, Users, Settings, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const navLinks = [
  { href: '/dashboard', label: 'Queue', icon: ClipboardList },
  { href: '/dashboard/expenses', label: 'Expenses', icon: Receipt },
  { href: '/dashboard/summary', label: 'Summary', icon: BarChart3 },
  { href: '/dashboard/attendance', label: 'Attendance', icon: Users },
]

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const supabase = createClient()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    async function checkRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()
        setIsAdmin(profile?.role === 'admin')
      }
    }
    checkRole()
  }, [])

  async function handleLogout() {
    const { error } = await supabase.auth.signOut()
    if (error) {
      toast.error('Failed to sign out')
    } else {
      router.push('/login')
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b bg-[#1B4332] text-white">
        <div className="flex h-14 items-center justify-between px-4">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <Scissors className="size-5" />
            <span className="text-lg font-bold">SOTG</span>
          </div>

          {/* Nav Links */}
          <nav className="flex items-center gap-1">
            {navLinks.map((link) => {
              const isActive =
                link.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'
                  )}
                >
                  <link.icon className="size-4" />
                  <span className="hidden sm:inline">{link.label}</span>
                </Link>
              )
            })}
          </nav>

          {/* Admin Link + Logout */}
          <div className="flex items-center gap-1">
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Settings className="size-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="text-white/70 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-4" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">{children}</main>
    </div>
  )
}
