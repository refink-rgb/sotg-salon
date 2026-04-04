'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Building2,
  Users,
  ArrowLeft,
  LogOut,
  Menu,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { BranchProvider } from '@/lib/branch-context'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

const navLinks = [
  { href: '/corporate', label: 'Overview', icon: LayoutDashboard },
  { href: '/corporate/branches', label: 'Branches', icon: Building2 },
  { href: '/corporate/users', label: 'Users', icon: Users },
]

function SidebarContent({ pathname, onLogout, onNavigate }: { pathname: string; onLogout: () => void; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <img src="/logo-192.png" alt="SOTG" className="h-12 w-12 rounded-full mx-auto mb-2" />
        <h1 className="text-xl font-bold tracking-tight text-center">SOTG</h1>
        <p className="text-xs text-amber-300/80 text-center">Corporate</p>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navLinks.map((link) => {
          const Icon = link.icon
          const isActive = pathname === link.href
          return (
            <Link
              key={link.href}
              href={link.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-amber-600 text-white'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="size-4 shrink-0" />
              {link.label}
            </Link>
          )
        })}

        <div className="my-3 border-t border-white/10" />

        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <ArrowLeft className="size-4 shrink-0" />
          Back to Dashboard
        </Link>
      </nav>

      <div className="p-2 border-t border-white/10">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="size-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  )
}

export default function CorporateLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <BranchProvider>
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 bg-[#1a1a2e] text-white">
        <SidebarContent pathname={pathname} onLogout={handleLogout} />
      </aside>

      <div className="flex flex-col flex-1 min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#1a1a2e] text-white">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="text-white hover:bg-white/10" />}>
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-60 p-0 bg-[#1a1a2e] text-white border-none"
            >
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent pathname={pathname} onLogout={handleLogout} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <h1 className="text-lg font-bold">SOTG Corporate</h1>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
    </BranchProvider>
  )
}
