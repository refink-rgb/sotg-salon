'use client'

import { useState, useMemo } from 'react'
import Papa from 'papaparse'
import { createClient } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Upload, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'

const SYSTEM_FIELDS = [
  { value: '', label: '-- Skip --' },
  { value: 'date', label: 'Date' },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'phone', label: 'Phone' },
  { value: 'city', label: 'City' },
  { value: 'amount', label: 'Amount' },
  { value: 'category', label: 'Category' },
  { value: 'description', label: 'Description' },
  { value: 'service', label: 'Service' },
  { value: 'payment_method', label: 'Payment Method' },
  { value: 'type', label: 'Type (sale/expense/salary/commission)' },
]

type ImportType = 'transactions' | 'customers' | 'expenses'

export default function ImportPage() {
  const [rawText, setRawText] = useState('')
  const [parsedData, setParsedData] = useState<string[][]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>({})
  const [importType, setImportType] = useState<ImportType>('transactions')
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: number } | null>(null)

  const handleParse = () => {
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

    const rows = parsed.data as string[][]
    const headerRow = rows[0]
    const dataRows = rows.slice(1)

    setHeaders(headerRow)
    setParsedData(dataRows)
    setResult(null)

    // Auto-map columns by guessing from header names
    const mapping: Record<number, string> = {}
    headerRow.forEach((h, i) => {
      const lower = h.toLowerCase().trim()
      if (lower.includes('date')) mapping[i] = 'date'
      else if (lower.includes('first') && lower.includes('name')) mapping[i] = 'first_name'
      else if (lower.includes('last') && lower.includes('name')) mapping[i] = 'last_name'
      else if (lower === 'name' || lower === 'first name') mapping[i] = 'first_name'
      else if (lower.includes('phone') || lower.includes('mobile')) mapping[i] = 'phone'
      else if (lower.includes('city') || lower.includes('location')) mapping[i] = 'city'
      else if (lower.includes('amount') || lower.includes('total') || lower.includes('price')) mapping[i] = 'amount'
      else if (lower.includes('category') || lower.includes('type')) mapping[i] = 'category'
      else if (lower.includes('description') || lower.includes('desc') || lower.includes('note')) mapping[i] = 'description'
      else if (lower.includes('service')) mapping[i] = 'service'
      else if (lower.includes('payment') || lower.includes('method')) mapping[i] = 'payment_method'
    })
    setColumnMapping(mapping)

    toast.success(`Parsed ${dataRows.length} rows with ${headerRow.length} columns`)
  }

  const previewRows = useMemo(() => parsedData.slice(0, 10), [parsedData])

  const handleImport = async () => {
    if (parsedData.length === 0) {
      toast.error('No data to import')
      return
    }

    setImporting(true)
    setResult(null)
    const supabase = createClient()
    let success = 0
    let errors = 0

    try {
      for (const row of parsedData) {
        const mapped: Record<string, string> = {}
        Object.entries(columnMapping).forEach(([colIdx, field]) => {
          if (field) {
            mapped[field] = (row[Number(colIdx)] ?? '').trim()
          }
        })

        try {
          if (importType === 'transactions') {
            const { error } = await supabase.from('transactions').insert({
              date: mapped.date || new Date().toISOString().split('T')[0],
              type: (mapped.type || mapped.category || 'sale') as 'sale' | 'expense' | 'salary' | 'commission',
              amount: Number(mapped.amount) || 0,
              category: mapped.category || null,
              description: mapped.description || null,
              payment_method: mapped.payment_method || null,
            })
            if (error) throw error
            success++
          } else if (importType === 'customers') {
            const { error } = await supabase.from('customers').insert({
              first_name: mapped.first_name || 'Unknown',
              last_name: mapped.last_name || '',
              phone: mapped.phone || '',
              city: mapped.city || '',
              is_returning: false,
            })
            if (error) throw error
            success++
          } else if (importType === 'expenses') {
            const { error } = await supabase.from('transactions').insert({
              date: mapped.date || new Date().toISOString().split('T')[0],
              type: 'expense' as const,
              amount: Number(mapped.amount) || 0,
              category: mapped.category || 'other',
              description: mapped.description || null,
              payment_method: mapped.payment_method || 'cash',
            })
            if (error) throw error
            success++
          }
        } catch (rowError) {
          console.error('Row import error:', rowError)
          errors++
        }
      }

      setResult({ success, errors })
      toast.success(`Import complete: ${success} succeeded, ${errors} failed`)
    } catch (error) {
      console.error('Import error:', error)
      toast.error('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>

      {/* Input Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" /> Paste Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="raw-data">Paste your spreadsheet data here (CSV or tab-separated)</Label>
            <Textarea
              id="raw-data"
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              rows={8}
              placeholder={"Date\tName\tAmount\tCategory\n2024-01-15\tJohn Doe\t1500\tSale\n..."}
              className="mt-1 font-mono text-sm"
            />
          </div>
          <Button onClick={handleParse}>
            Parse Data
          </Button>
        </CardContent>
      </Card>

      {/* Column Mapping */}
      {headers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Column Mapping</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4 mb-4">
              <Label>Import Type:</Label>
              <Select value={importType} onValueChange={v => setImportType(v as ImportType)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transactions">Transactions</SelectItem>
                  <SelectItem value="customers">Customers</SelectItem>
                  <SelectItem value="expenses">Expenses</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {headers.map((header, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700 min-w-[100px] truncate" title={header}>
                    {header}
                  </span>
                  <Select
                    value={columnMapping[idx] || ''}
                    onValueChange={(v) => setColumnMapping(prev => ({ ...prev, [idx]: v ?? '' }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="-- Skip --" />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_FIELDS.map(f => (
                        <SelectItem key={f.value || 'skip'} value={f.value || 'skip'}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {/* Preview Table */}
            <div>
              <p className="text-sm font-semibold text-gray-600 mb-2">
                Preview (first {Math.min(previewRows.length, 10)} of {parsedData.length} rows)
              </p>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((h, i) => (
                        <TableHead key={i}>
                          <div className="text-xs">
                            <div className="font-medium">{h}</div>
                            {columnMapping[i] && columnMapping[i] !== 'skip' && (
                              <Badge variant="secondary" className="mt-0.5 text-[10px]">
                                {columnMapping[i]}
                              </Badge>
                            )}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, ri) => (
                      <TableRow key={ri}>
                        {row.map((cell, ci) => (
                          <TableCell key={ci} className="text-xs">{cell}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <Button onClick={handleImport} disabled={importing} className="bg-[#1B4332] hover:bg-[#40916C]">
              {importing ? 'Importing...' : `Import ${parsedData.length} rows`}
            </Button>

            {/* Result */}
            {result && (
              <div className="flex items-center gap-4 p-4 rounded-lg bg-gray-50 border">
                <div className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="size-5" />
                  <span className="font-medium">{result.success} succeeded</span>
                </div>
                {result.errors > 0 && (
                  <div className="flex items-center gap-2 text-red-600">
                    <XCircle className="size-5" />
                    <span className="font-medium">{result.errors} failed</span>
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
