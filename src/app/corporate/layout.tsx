'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  FileText,
  Users,
  DollarSign,
  List,
  ArrowLeft,
  LogOut,
  Menu,
  Building2,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'

const navLinks = [
  { href: '/corporate', label: 'Overview', icon: LayoutDashboard },
  { href: '/corporate/income-statement', label: 'Income Statement', icon: FileText },
  { href: '/corporate/payroll', label: 'Payroll', icon: Users },
  { href: '/corporate/cash-flow', label: 'Cash Flow', icon: DollarSign },
  { href: '/corporate/transactions', label: 'Transactions', icon: List },
  { href: '/corporate/branches', label: 'Branches', icon: Building2 },
]

function SidebarContent({ pathname, onLogout, onNavigate }: { pathname: string; onLogout: () => void; onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-white/10">
        <img src="/logo-192.png" alt="SOTG" className="h-12 w-12 rounded-full mx-auto mb-2" />
        <h1 className="text-xl font-bold tracking-tight text-center">SOTG</h1>
        <p className="text-xs text-white/60 text-center">Corporate</p>
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
                  ? 'bg-[#40916C] text-white'
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
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:shrink-0 bg-[#0B2545] text-white">
        <SidebarContent pathname={pathname} onLogout={handleLogout} />
      </aside>

      {/* Mobile header + sidebar sheet */}
      <div className="flex flex-col flex-1 min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#0B2545] text-white">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger render={<Button variant="ghost" size="icon" className="text-white hover:bg-white/10" />}>
              <Menu className="size-5" />
            </SheetTrigger>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="w-60 p-0 bg-[#0B2545] text-white border-none"
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
  )
}
