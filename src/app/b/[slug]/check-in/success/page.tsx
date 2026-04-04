'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function BranchCheckInSuccessPage() {
  const params = useParams()
  const slug = params.slug as string

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4 text-center">
      <div className="bg-[#40916C]/10 rounded-full p-6 mb-6">
        <CheckCircle2 className="size-16 text-[#40916C]" />
      </div>

      <h1 className="text-3xl font-bold text-[#1B4332]">You're Checked In!</h1>
      <p className="mt-3 text-gray-500 max-w-xs">
        Thank you! Please have a seat and a stylist will be with you shortly.
      </p>

      <Link href={`/b/${slug}/check-in`} className="mt-8">
        <Button className="h-12 px-8 bg-[#1B4332] text-white hover:bg-[#1B4332]/90 text-base">
          New Customer
        </Button>
      </Link>
    </div>
  )
}
