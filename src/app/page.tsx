import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
          <span className="text-2xl font-bold text-primary-foreground">S</span>
        </div>
        <h1 className="text-3xl font-bold text-primary">Salon On The Go</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mabalacat City</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        <Link
          href="/check-in"
          className="flex h-16 items-center justify-center rounded-lg bg-secondary text-lg font-semibold text-secondary-foreground shadow transition-colors hover:bg-secondary/90"
        >
          Customer Check-In
        </Link>
        <Link
          href="/login"
          className="flex h-16 items-center justify-center rounded-lg border border-primary bg-background text-lg font-semibold text-primary shadow transition-colors hover:bg-accent"
        >
          Staff Login
        </Link>
      </div>
    </div>
  )
}
