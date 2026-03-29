import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPeso(amount: number): string {
  if (amount < 0) return `(₱${Math.abs(amount).toLocaleString('en-PH')})`
  return `₱${amount.toLocaleString('en-PH')}`
}

export function getToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

export async function copyTableToClipboard(headers: string[], rows: string[][]): Promise<void> {
  const tsv = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n')
  await navigator.clipboard.writeText(tsv)
}
