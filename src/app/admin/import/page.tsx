'use client'

import { useState, useCallback } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { getToday } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Upload, CheckCircle2, XCircle, Loader2, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'

// ── Types ──────────────────────────────────────────────────────

interface ParsedSale {
  type: 'sale'
  date: string            // YYYY-MM-DD
  name: string
  firstName: string
  lastName: string
  phone: string
  location: string
  amount: number
  services: string[]      // e.g. ["Basic", "Protein"]
  customerNotes: string
}

interface ParsedExpense {
  type: 'expense'
  date: string
  amount: number
  category: string        // raw Notes column value
  categoryKey: string     // normalized key for DB
}

type ParsedRow = ParsedSale | ParsedExpense

interface ImportResult {
  salesSuccess: number
  salesErrors: number
  expensesSuccess: number
  expensesErrors: number
  errorMessages: string[]
}

// ── Helpers ────────────────────────────────────────────────────

/** Strip peso sign and commas from amount strings like "₱4,500" -> 4500 */
function parseAmount(raw: string): number {
  if (!raw || !raw.trim()) return 0
  const cleaned = raw.replace(/[₱,\s]/g, '')
  const num = Number(cleaned)
  return isNaN(num) ? 0 : num
}

/** Parse M/D/YYYY -> YYYY-MM-DD */
function parseDate(raw: string): string {
  if (!raw || !raw.trim()) return getToday()
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return raw.trim()
  const [m, d, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Split full name into first and last */
function splitName(full: string): { firstName: string; lastName: string } {
  const trimmed = full.trim()
  if (!trimmed) return { firstName: 'Unknown', lastName: '' }
  const spaceIdx = trimmed.indexOf(' ')
  if (spaceIdx === -1) return { firstName: trimmed, lastName: '' }
  return {
    firstName: trimmed.slice(0, spaceIdx),
    lastName: trimmed.slice(spaceIdx + 1).trim(),
  }
}

/** Normalize expense category: "Meds" -> "meds", "Food" -> "food" */
function normalizeCategory(raw: string): string {
  if (!raw || !raw.trim()) return 'other'
  return raw.trim().toLowerCase()
}

/** Detect if headers match the SOTG format */
function isSOTGFormat(headers: string[]): boolean {
  const joined = headers.join(',').toLowerCase()
  return joined.includes('transaction') && joined.includes('income')
}

/** Parse comma-separated services, trimming whitespace */
function parseServices(raw: string): string[] {
  if (!raw || !raw.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

// ── Column indices in the SOTG CSV format ──────────────────────
// Date(0), Transaction(1), Income(2), Expenses(3), Notes(4),
// Date(5), Name(6), Phone No.(7), Location(8), Sale(9),
// Services(10), Customer Notes(11), empty(12), empty(13), Month(14)

const COL = {
  DATE: 0,
  TRANSACTION: 1,
  INCOME: 2,
  EXPENSES: 3,
  NOTES: 4,
  NAME: 6,
  PHONE: 7,
  LOCATION: 8,
  SALE: 9,
  SERVICES: 10,
  CUSTOMER_NOTES: 11,
} as const

// ── Component ──────────────────────────────────────────────────

export default function ImportPage() {
  const [rawText, setRawText] = useState('')
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([])
  const [isParsed, setIsParsed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [result, setResult] = useState<ImportResult | null>(null)

  const salesCount = parsedRows.filter(r => r.type === 'sale').length
  const expenseCount = parsedRows.filter(r => r.type === 'expense').length

  // ── Parse & Preview ────────────────────────────────────────

  const handleParse = useCallback(() => {
    if (!rawText.trim()) {
      toast.error('Please paste some data first')
      return
    }

    const parsed = Papa.parse(rawText.trim(), {
      header: false,
      skipEmptyLines: true,
    })

    if (parsed.data.length < 2) {
      toast.error('Not enough data. Need at least a header row and one data row.')
      return
    }

    const allRows = parsed.data as string[][]
    const headerRow = allRows[0]

    if (!isSOTGFormat(headerRow)) {
      toast.error(
        'Unrecognized CSV format. Expected SOTG salon format with "Transaction" and "Income" columns.'
      )
      return
    }

    const dataRows = allRows.slice(1)
    const rows: ParsedRow[] = []

    for (const row of dataRows) {
      const txnType = (row[COL.TRANSACTION] ?? '').trim().toLowerCase()

      if (txnType === 'sale') {
        const amount = parseAmount(row[COL.SALE] || row[COL.INCOME] || '')
        if (amount === 0) continue // skip rows with no sale amount
        const { firstName, lastName } = splitName(row[COL.NAME] ?? '')
        rows.push({
          type: 'sale',
          date: parseDate(row[COL.DATE] ?? ''),
          name: (row[COL.NAME] ?? '').trim(),
          firstName,
          lastName,
          phone: (row[COL.PHONE] ?? '').trim(),
          location: (row[COL.LOCATION] ?? '').trim(),
          amount,
          services: parseServices(row[COL.SERVICES] ?? ''),
          customerNotes: (row[COL.CUSTOMER_NOTES] ?? '').trim(),
        })
      } else if (txnType === 'expense') {
        const amount = parseAmount(row[COL.EXPENSES] ?? '')
        if (amount === 0) continue
        rows.push({
          type: 'expense',
          date: parseDate(row[COL.DATE] ?? ''),
          amount,
          category: (row[COL.NOTES] ?? '').trim(),
          categoryKey: normalizeCategory(row[COL.NOTES] ?? ''),
        })
      }
      // Skip rows that are neither Sale nor Expense
    }

    setParsedRows(rows)
    setIsParsed(true)
    setResult(null)
    toast.success(`Parsed ${rows.length} rows: ${rows.filter(r => r.type === 'sale').length} sales, ${rows.filter(r => r.type === 'expense').length} expenses`)
  }, [rawText])

  // ── Import ─────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (parsedRows.length === 0) {
      toast.error('No data to import')
      return
    }

    setImporting(true)
    setResult(null)
    setProgress({ current: 0, total: parsedRows.length })

    const supabase = createClient()
    const importResult: ImportResult = {
      salesSuccess: 0,
      salesErrors: 0,
      expensesSuccess: 0,
      expensesErrors: 0,
      errorMessages: [],
    }

    // Fetch existing services from DB for matching
    const { data: dbServices } = await supabase
      .from('services')
      .select('id, name')
      .eq('is_active', true)

    const serviceMap = new Map<string, string>() // lowercase name -> id
    for (const svc of dbServices ?? []) {
      serviceMap.set(svc.name.toLowerCase(), svc.id)
    }

    // Fetch existing customers by phone to avoid duplicates
    const { data: existingCustomers } = await supabase
      .from('customers')
      .select('id, phone')

    const customerByPhone = new Map<string, string>() // phone -> id
    for (const c of existingCustomers ?? []) {
      if (c.phone) customerByPhone.set(c.phone, c.id)
    }

    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i]
      setProgress({ current: i + 1, total: parsedRows.length })

      try {
        if (row.type === 'sale') {
          await importSaleRow(supabase, row, serviceMap, customerByPhone)
          importResult.salesSuccess++
        } else {
          await importExpenseRow(supabase, row)
          importResult.expensesSuccess++
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (row.type === 'sale') {
          importResult.salesErrors++
          importResult.errorMessages.push(`Sale row ${i + 1} (${row.name}): ${msg}`)
        } else {
          importResult.expensesErrors++
          importResult.errorMessages.push(`Expense row ${i + 1} (${row.category}): ${msg}`)
        }
      }
    }

    setResult(importResult)
    setImporting(false)

    const totalSuccess = importResult.salesSuccess + importResult.expensesSuccess
    const totalErrors = importResult.salesErrors + importResult.expensesErrors
    if (totalErrors === 0) {
      toast.success(`Import complete: ${totalSuccess} records imported successfully`)
    } else {
      toast.warning(`Import complete: ${totalSuccess} succeeded, ${totalErrors} failed`)
    }
  }, [parsedRows])

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="size-5" />
            SOTG Salon CSV Import
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <p>
            Paste your salon spreadsheet data below. The expected format has these columns:
          </p>
          <div className="bg-gray-50 rounded-md p-3 font-mono text-xs overflow-x-auto">
            Date, Transaction, Income, Expenses, Notes, Date, Name, Phone No., Location, Sale, Services, Customer Notes
          </div>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Sale rows:</strong> Transaction = &quot;Sale&quot; with customer name, phone, location, amount, and services</li>
            <li><strong>Expense rows:</strong> Transaction = &quot;Expense&quot; with amount in Expenses column and category in Notes</li>
            <li>Amounts can include the peso sign and commas (e.g. &#x20B1;4,500)</li>
            <li>Services can be comma-separated (e.g. &quot;Basic, Protein&quot;)</li>
          </ul>
        </CardContent>
      </Card>

      {/* Paste Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" /> Paste CSV Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={rawText}
            onChange={e => setRawText(e.target.value)}
            rows={10}
            placeholder={`Date,Transaction,Income,Expenses,Notes,Date,Name,Phone No. ,Location,Sale,Services,Customer Notes,,,Month\n1/4/2026,Expense,,₱200,Meds,...\n1/4/2026,Sale,"₱1,000",,,1/4/2026,Cherry Mangahas,09667459729,Mabalacat City,"₱1,000",Brazilian,,,,1.00`}
            className="font-mono text-xs"
          />
          <Button onClick={handleParse}>
            Parse &amp; Preview
          </Button>
        </CardContent>
      </Card>

      {/* Preview */}
      {isParsed && (
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg border">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                  {salesCount} Sales
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">
                  {expenseCount} Expenses
                </Badge>
              </div>
              <span className="text-sm text-gray-500">
                {parsedRows.length} total rows to import
              </span>
            </div>

            {/* Preview Table */}
            {parsedRows.length > 0 && (
              <div className="overflow-x-auto">
                <p className="text-sm text-gray-500 mb-2">
                  Showing {Math.min(parsedRows.length, 20)} of {parsedRows.length} rows
                </p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Name / Category</TableHead>
                      <TableHead>Services / Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedRows.slice(0, 20).map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="text-xs text-gray-400">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{row.date}</TableCell>
                        <TableCell>
                          {row.type === 'sale' ? (
                            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Sale</Badge>
                          ) : (
                            <Badge className="bg-orange-100 text-orange-800 hover:bg-orange-100">Expense</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-right font-medium">
                          {row.amount.toLocaleString('en-PH', { style: 'currency', currency: 'PHP' })}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.type === 'sale' ? (
                            <div>
                              <span className="font-medium">{row.name}</span>
                              {row.phone && (
                                <span className="text-gray-400 ml-2 text-xs">{row.phone}</span>
                              )}
                            </div>
                          ) : (
                            <span>{row.category}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {row.type === 'sale' ? (
                            <div className="flex flex-wrap gap-1">
                              {row.services.map((s, si) => (
                                <Badge key={si} variant="secondary" className="text-xs">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-400">--</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Import Button */}
            <div className="pt-2">
              <Button
                onClick={handleImport}
                disabled={importing || parsedRows.length === 0}
                className="bg-[#1B4332] hover:bg-[#40916C]"
              >
                {importing ? (
                  <>
                    <Loader2 className="size-4 mr-2 animate-spin" />
                    Importing {progress.current} / {progress.total}...
                  </>
                ) : (
                  <>Import {parsedRows.length} Records</>
                )}
              </Button>
            </div>

            {/* Progress Bar */}
            {importing && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-[#40916C] h-2 rounded-full transition-all duration-200"
                  style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                />
              </div>
            )}

            {/* Results */}
            {result && (
              <div className="space-y-3 p-4 rounded-lg bg-gray-50 border">
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="size-5" />
                    <span className="font-medium">
                      {result.salesSuccess} sales, {result.expensesSuccess} expenses imported
                    </span>
                  </div>
                  {(result.salesErrors + result.expensesErrors) > 0 && (
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="size-5" />
                      <span className="font-medium">
                        {result.salesErrors + result.expensesErrors} errors
                      </span>
                    </div>
                  )}
                </div>

                {result.errorMessages.length > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-sm font-semibold text-red-700">Error details:</p>
                    <div className="max-h-48 overflow-y-auto text-xs text-red-600 space-y-0.5">
                      {result.errorMessages.map((msg, i) => (
                        <p key={i}>{msg}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ── Import helpers (outside component to keep it clean) ────────

async function importSaleRow(
  supabase: ReturnType<typeof createClient>,
  row: ParsedSale,
  serviceMap: Map<string, string>,
  customerByPhone: Map<string, string>,
) {
  // 1. Find or create customer
  let customerId = ''

  if (row.phone && customerByPhone.has(row.phone)) {
    customerId = customerByPhone.get(row.phone)!
  } else {
    const customerInsert: Record<string, unknown> = {
      first_name: row.firstName,
      last_name: row.lastName,
      phone: row.phone || null,
      city: row.location || null,
      is_returning: false,
    }
    const { data: newCustomer, error: custError } = await supabase
      .from('customers')
      .insert(customerInsert)
      .select('id')
      .single()

    if (custError) throw new Error(`Customer create failed: ${custError.message}`)
    customerId = newCustomer.id

    // Cache for subsequent rows with same phone
    if (row.phone) {
      customerByPhone.set(row.phone, customerId)
    }
  }

  // 2. Create visit
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .insert({
      customer_id: customerId,
      date: row.date,
      status: 'completed',
      total_amount: row.amount,
      notes: row.customerNotes || null,
      completed_at: `${row.date}T12:00:00`,
    })
    .select('id')
    .single()

  if (visitError) throw new Error(`Visit create failed: ${visitError.message}`)
  const visitId = visit.id

  // 3. Create visit_services
  if (row.services.length > 0) {
    const visitServices = row.services.map(svcName => {
      const serviceId = serviceMap.get(svcName.toLowerCase()) ?? null
      return {
        visit_id: visitId,
        service_id: serviceId,
        price: null as number | null,
      }
    })

    const { error: vsError } = await supabase
      .from('visit_services')
      .insert(visitServices)

    if (vsError) throw new Error(`Visit services create failed: ${vsError.message}`)
  }

  // 4. Create visit_payment (default cash)
  const { error: payError } = await supabase
    .from('visit_payments')
    .insert({
      visit_id: visitId,
      method: 'cash',
      amount: row.amount,
    })

  if (payError) throw new Error(`Visit payment create failed: ${payError.message}`)

  // 5. Create transaction
  const { error: txError } = await supabase
    .from('transactions')
    .insert({
      date: row.date,
      type: 'sale',
      amount: row.amount,
      visit_id: visitId,
      payment_method: 'cash',
    })

  if (txError) throw new Error(`Transaction create failed: ${txError.message}`)
}

async function importExpenseRow(
  supabase: ReturnType<typeof createClient>,
  row: ParsedExpense,
) {
  const { error } = await supabase
    .from('transactions')
    .insert({
      date: row.date,
      type: 'expense',
      amount: row.amount,
      category: row.categoryKey,
      description: row.category, // original label as description
      payment_method: 'cash',
    })

  if (error) throw new Error(`Expense create failed: ${error.message}`)
}
