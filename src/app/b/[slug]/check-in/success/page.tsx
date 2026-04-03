'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { CheckCircle2 } from 'lucide-react'

export default function BranchCheckInSuccessPage() {
  const params = useParams<{ slug: string }>()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="flex flex-col items-center text-center">
        <img src="/logo-192.png" alt="Salon On The Go" className="h-20 w-20 rounded-full mb-4" />
        <CheckCircle2 className="size-20 text-[#40916C]" />
        <h1 className="mt-6 text-2xl font-bold text-[#1B4332]">Thank You!</h1>
        <p className="mt-2 text-base text-gray-600">
          Your stylist will be with you shortly.
        </p>
        <Link href={`/b/${params.slug}/check-in`} className="mt-8">
          <Button className="h-12 bg-[#1B4332] px-8 text-base font-semibold text-white hover:bg-[#1B4332]/90">
            Check In Another Customer
          </Button>
        </Link>
      </div>
    </div>
  )
}
