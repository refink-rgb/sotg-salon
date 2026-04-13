import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import Papa from 'papaparse'

const SUPABASE_URL = 'https://lamlcjbrkuffmxltghwd.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhbWxjamJya3VmZm14bHRnaHdkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDcxMjE1NiwiZXhwIjoyMDkwMjg4MTU2fQ.qfrLg-s0vjbxVVjFrKJXcuwN5xvuJfsCqMFma5WGp8I'
const BRANCH_ID = '029387e1-6dac-46a8-9141-60eb7efbd45a'

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Service IDs (fetched at runtime) ──
const serviceMap = {}

// ── Helpers ──
function parseAmount(raw) {
  if (!raw || !raw.trim()) return 0
  return Number(raw.replace(/[₱,\s"]/g, '')) || 0
}

function parseDate(raw) {
  if (!raw || !raw.trim()) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return raw.trim()
  const [m, d, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

const TYPO_MAP = {
  'brailian': 'brazilian', 'barzilian': 'brazilian', 'braz': 'brazilian',
  'rebobd': 'rebond', 'rbond': 'rebond', 'rebind': 'rebond',
  'botoxo': 'botox', 'botx': 'botox',
  'organiz': 'organic',
  'cello': 'treatment', 'hairspa': 'treatment',
  'regular': 'regular hair color',
  'mens color': 'color', 'fashion color': 'color',
  'premium': 'premium botox', 'premiumm botox': 'premium botox',
  'glam botox': 'botox', 'non bleach balayage': 'balayage',
}

function parseServices(raw) {
  if (!raw || !raw.trim() || raw.trim() === '-') return []
  const cleaned = raw.replace(/,/g, ' ').replace(/&/g, ' ').replace(/\s+/g, ' ').trim()
  const words = cleaned.split(' ')
  const result = []
  let i = 0
  while (i < words.length) {
    if (i + 1 < words.length) {
      const two = [words[i], words[i+1]].join(' ').toLowerCase()
      const fixed = TYPO_MAP[two] || null
      if (fixed) { result.push(fixed); i += 2; continue }
      if (serviceMap[two]) { result.push(two); i += 2; continue }
    }
    const one = words[i].toLowerCase()
    const fixed = TYPO_MAP[one] || null
    if (fixed) { result.push(fixed); i++; continue }
    if (serviceMap[one]) { result.push(one); i++; continue }
    i++
  }
  return [...new Set(result)]
}

function detectExpenseType(notes) {
  const lower = notes.toLowerCase()
  if (lower.includes('commission') || lower.includes('commisson')) return 'commission'
  if (lower.includes('salary')) return 'salary'
  if (lower.includes('service charge')) return 'salary'
  return 'expense'
}

function normalizeCategory(notes) {
  const lower = notes.toLowerCase().trim()
  if (lower.includes('rent')) return 'rent'
  if (lower.includes('electric')) return 'electric'
  if (lower.includes('water')) return 'water'
  if (lower.includes('wifi') || lower.includes('internet')) return 'wifi'
  if (lower.includes('food')) return 'food'
  if (lower.includes('meds') || lower.includes('gloves') || lower.includes('sabon') || lower.includes('soap')) return 'meds'
  if (lower.includes('meta ads') || lower.includes('meta ad') || lower.includes('ads')) return 'ads'
  if (lower.includes('bir') || lower.includes('tax')) return 'bir'
  if (lower.includes('pagibig')) return 'pagibig'
  return 'other'
}

function detectEmployee(notes) {
  const lower = notes.toLowerCase().replace(/[-_]/g, ' ')
  const patterns = { jet: 'Jet', pong: 'Pong', christian: 'Christian', xtian: 'Christian', bulik: 'Bulik', kyla: 'Kyla', omey: 'Omey', jomey: 'Omey', sarah: 'Sarah', jason: 'Jason', jen: 'Jen', jenny: 'Jenny' }
  for (const [p, name] of Object.entries(patterns)) {
    if (lower.includes(p)) return name
  }
  return null
}

// ── Main ──
async function main() {
  console.log('=== Mabalacat 2026 Import (Clean Slate) ===\n')

  // 1. Load services
  const { data: services } = await sb.from('services').select('id, name').eq('is_active', true)
  for (const s of services || []) serviceMap[s.name.toLowerCase()] = s.id
  console.log('Loaded', Object.keys(serviceMap).length, 'services')

  // 2. CLEAR all existing data for this branch
  console.log('\nClearing existing Mabalacat data...')

  // Get all visit IDs for this branch
  const { data: branchVisits } = await sb.from('visits').select('id').eq('branch_id', BRANCH_ID).limit(50000)
  const visitIds = (branchVisits || []).map(v => v.id)
  console.log('  Found', visitIds.length, 'visits to delete')

  // Delete in batches of 500
  for (let i = 0; i < visitIds.length; i += 500) {
    const batch = visitIds.slice(i, i + 500)
    await sb.from('visit_payments').delete().in('visit_id', batch)
    await sb.from('visit_services').delete().in('visit_id', batch)
  }
  console.log('  Cleared visit_payments and visit_services')

  // Delete visits
  await sb.from('visits').delete().eq('branch_id', BRANCH_ID)
  console.log('  Cleared visits')

  // Delete transactions
  const { count: txCount } = await sb.from('transactions').select('id', { count: 'exact', head: true }).eq('branch_id', BRANCH_ID)
  await sb.from('transactions').delete().eq('branch_id', BRANCH_ID)
  console.log('  Cleared', txCount, 'transactions')

  // Delete daily_attendance
  await sb.from('daily_attendance').delete().eq('branch_id', BRANCH_ID)
  console.log('  Cleared attendance')

  console.log('  Done clearing!\n')

  // 3. Read CSV
  const csv = fs.readFileSync('/Users/robertofink/Downloads/Mabalacat - SOTG - Sales CRM 2026 - Transactions (1).csv', 'utf8')
  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: true })
  const rows = parsed.data.slice(1)
  console.log('Parsed', rows.length, 'data rows\n')

  // Customer cache
  const { data: existingCustomers } = await sb.from('customers').select('id, phone')
  const customerByPhone = new Map()
  for (const c of existingCustomers || []) {
    if (c.phone) customerByPhone.set(c.phone, c.id)
  }

  let salesOk = 0, salesErr = 0, expOk = 0, expErr = 0, wdOk = 0, skipped = 0
  const errors = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const txnType = (row[1] || '').trim().toLowerCase()

    if (txnType === 'sale') {
      try {
        await importSale(row, customerByPhone)
        salesOk++
      } catch (err) {
        salesErr++
        errors.push(`Row ${i+2}: ${err.message}`)
      }
    } else if (txnType === 'expense' || txnType === 'expenses') {
      try {
        const amount = parseAmount(row[3] || '')
        if (amount === 0) { skipped++; continue }
        await importExpense(row)
        expOk++
      } catch (err) {
        expErr++
        errors.push(`Row ${i+2}: ${err.message}`)
      }
    } else if (txnType === 'withdrawal') {
      try {
        await importWithdrawal(row)
        wdOk++
      } catch (err) {
        errors.push(`Row ${i+2}: ${err.message}`)
      }
    } else {
      skipped++
    }

    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i+1}/${rows.length}...\r`)
  }

  console.log(`\n=== IMPORT COMPLETE ===`)
  console.log(`Sales:       ${salesOk} ok, ${salesErr} errors`)
  console.log(`Expenses:    ${expOk} ok, ${expErr} errors`)
  console.log(`Withdrawals: ${wdOk} ok`)
  console.log(`Skipped:     ${skipped}`)
  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`)
    errors.forEach(e => console.log(`  ${e}`))
  }
}

async function importSale(row, customerByPhone) {
  const date = parseDate(row[0])
  if (!date) throw new Error('No date')

  const fullName = (row[6] || '').trim()
  const phone = (row[7] || '').trim()
  const location = (row[8] || '').trim()
  const amount = parseAmount(row[9] || row[2] || '')
  if (amount === 0) throw new Error('Zero amount')
  const servicesRaw = (row[10] || '').trim()
  const serviceNames = parseServices(servicesRaw)

  const firstName = fullName ? (fullName.indexOf(' ') === -1 ? fullName : fullName.slice(0, fullName.indexOf(' '))) : 'Walk-in'
  const lastName = fullName && fullName.indexOf(' ') !== -1 ? fullName.slice(fullName.indexOf(' ') + 1).trim() : ''

  let customerId
  if (phone && customerByPhone.has(phone)) {
    customerId = customerByPhone.get(phone)
  } else {
    const { data: newCust, error } = await sb.from('customers').insert({
      first_name: firstName, last_name: lastName,
      phone: phone || null, city: location || null, is_returning: false,
    }).select('id').single()
    if (error) throw new Error(`Customer: ${error.message}`)
    customerId = newCust.id
    if (phone) customerByPhone.set(phone, customerId)
  }

  const { data: visit, error: vErr } = await sb.from('visits').insert({
    customer_id: customerId, date, status: 'completed',
    total_amount: amount, completed_at: `${date}T12:00:00`, branch_id: BRANCH_ID,
  }).select('id').single()
  if (vErr) throw new Error(`Visit: ${vErr.message}`)

  if (serviceNames.length > 0) {
    const vs = serviceNames.map(name => ({
      visit_id: visit.id, service_id: serviceMap[name] || null, price: null,
    })).filter(v => v.service_id)
    if (vs.length > 0) await sb.from('visit_services').insert(vs)
  }

  await sb.from('visit_payments').insert({ visit_id: visit.id, method: 'cash', amount })

  await sb.from('transactions').insert({
    date, type: 'sale', amount, visit_id: visit.id,
    payment_method: 'cash', branch_id: BRANCH_ID,
    description: `Sale - ${fullName || 'Walk-in'}`,
  })
}

async function importExpense(row) {
  const date = parseDate(row[0])
  if (!date) throw new Error('No date')
  const amount = parseAmount(row[3] || '')
  if (amount === 0) throw new Error('Zero amount')
  const notes = (row[4] || '').trim()
  const type = detectExpenseType(notes)
  const category = type === 'expense' ? normalizeCategory(notes) : (type === 'salary' ? 'salary' : 'commission')
  const empName = detectEmployee(notes)

  await sb.from('transactions').insert({
    date, type, amount, category,
    description: empName ? `${type === 'commission' ? 'Commission' : 'Salary'} - ${empName}` : notes,
    payment_method: 'cash', branch_id: BRANCH_ID,
  })
}

async function importWithdrawal(row) {
  const date = parseDate(row[0])
  if (!date) throw new Error('No date')
  const amount = parseAmount(row[3] || row[2] || '')
  if (amount === 0) throw new Error('Zero amount')
  const notes = (row[4] || '').trim()

  await sb.from('transactions').insert({
    date, type: 'withdrawal', amount,
    description: notes || 'Owner withdrawal',
    payment_method: 'cash', branch_id: BRANCH_ID,
  })
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
