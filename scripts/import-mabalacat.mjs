import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import Papa from 'papaparse'

const SUPABASE_URL = 'https://lamlcjbrkuffmxltghwd.supabase.co'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxhbWxjamJya3VmZm14bHRnaHdkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDcxMjE1NiwiZXhwIjoyMDkwMjg4MTU2fQ.qfrLg-s0vjbxVVjFrKJXcuwN5xvuJfsCqMFma5WGp8I'
const BRANCH_ID = '029387e1-6dac-46a8-9141-60eb7efbd45a' // Mabalacat City

const sb = createClient(SUPABASE_URL, SERVICE_KEY)

// ── Service mapping ──────────────────────────────────────────
// Existing services in DB
const EXISTING_SERVICES = {
  'basic': '23289603-c2f5-4078-b503-8209f07c3619',
  'regular hair color': '21e44291-ede9-4d76-9310-ca7c498d0726',
  'brazilian': '82065a61-8a05-4db7-aaab-60348f757cf9',
  'protein': 'a6dee455-8588-49d9-84cb-b604bab2b307',
  'botox': 'e5360533-90f3-4d15-857a-f9bf4faf3ae2',
  'balayage': '8b558f9a-1269-4e79-ba88-cbe17228f097',
  'highlights': '66357771-37e2-40f1-b3e5-2fa455587342',
  'color': 'c8d86b34-a3b2-4074-b347-c8d227394f31',
}

// New services to create
const NEW_SERVICES = ['Rebond', 'Organic', 'Premium Botox', 'Treatment']
const newServiceIds = {}

// Typo fixes (normalized lowercase)
const TYPO_MAP = {
  'brailian': 'brazilian',
  'barzilian': 'brazilian',
  'braz': 'brazilian',
  'rebobd': 'rebond',
  'rbond': 'rebond',
  'rebind': 'rebond',
  'botoxo': 'botox',
  'botx': 'botox',
  'organiz': 'organic',
  'cello': 'treatment',
  'hairspa': 'treatment',
  'hair chain treatment': 'treatment',
  'scalp t': 'treatment',
  'regular': 'regular hair color',
  'mens color': 'color',
  'fashion color': 'color',
  'color treatment': 'color',
  'color organic': 'organic',
  'premium': 'premium botox',
  'premiummm botox': 'premium botox',
  'premiumm botox': 'premium botox',
  'premium rebond': 'rebond',
  'glam botox': 'botox',
  'non bleach balayage': 'balayage',
  'retouch color': 'color',
  'extensions': 'treatment',
  'hair extension': 'treatment',
  'hair extensions': 'treatment',
  'amazon': 'treatment',
  'haircut': 'basic',
  'color & botox': 'color',  // will also pick up botox separately
}

// Employee name -> detection patterns for commission/salary
const EMPLOYEE_PATTERNS = {
  'jet': { name: 'Jet' },
  'pong': { name: 'Pong' },
  'christian': { name: 'Christian' },
  'xtian': { name: 'Christian' },
  'bulik': { name: 'Bulik' },
  'kyla': { name: 'Kyla' },
  'omey': { name: 'Omey' },
  'jomey': { name: 'Omey' },
  'sarah': { name: 'Sarah' },
  'jason': { name: 'Jason' },
  'jen': { name: 'Jen' },
  'jenny': { name: 'Jenny' },
}

// ── Helpers ──────────────────────────────────────────────────

function parseAmount(raw) {
  if (!raw || !raw.trim()) return 0
  const cleaned = raw.replace(/[₱,\s"]/g, '')
  const num = Number(cleaned)
  return isNaN(num) ? 0 : num
}

function parseDate(raw) {
  if (!raw || !raw.trim()) return null
  const parts = raw.trim().split('/')
  if (parts.length !== 3) return raw.trim()
  const [m, d, y] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

/** Parse service string like "Rebond Color Botox" into individual service names */
function parseServices(raw) {
  if (!raw || !raw.trim() || raw.trim() === '-') return []

  // First replace commas and & with spaces to normalize
  let cleaned = raw.replace(/,/g, ' ').replace(/&/g, ' ').replace(/\s+/g, ' ').trim()

  // Split into words
  const words = cleaned.split(' ')

  // Greedily match known service names (multi-word first, then single)
  const result = []
  let i = 0
  while (i < words.length) {
    // Try 3-word match
    if (i + 2 < words.length) {
      const three = [words[i], words[i+1], words[i+2]].join(' ').toLowerCase()
      const fixed = TYPO_MAP[three] || null
      if (fixed) { result.push(fixed); i += 3; continue }
    }
    // Try 2-word match
    if (i + 1 < words.length) {
      const two = [words[i], words[i+1]].join(' ').toLowerCase()
      const fixed = TYPO_MAP[two] || null
      if (fixed) { result.push(fixed); i += 2; continue }
      // Check if it's a known service
      if (EXISTING_SERVICES[two] || newServiceIds[two]) { result.push(two); i += 2; continue }
    }
    // Single word
    const one = words[i].toLowerCase()
    const fixed = TYPO_MAP[one] || null
    if (fixed) { result.push(fixed); i++; continue }
    if (EXISTING_SERVICES[one] || newServiceIds[one]) { result.push(one); i++; continue }
    // Unknown - skip
    i++
  }

  // Deduplicate
  return [...new Set(result)]
}

function resolveServiceId(name) {
  return EXISTING_SERVICES[name] || newServiceIds[name] || null
}

/** Detect employee from expense notes like "Commission Pong" or "Salary-Christian" */
function detectEmployee(notes) {
  const lower = notes.toLowerCase().replace(/[-_]/g, ' ')
  for (const [pattern, info] of Object.entries(EMPLOYEE_PATTERNS)) {
    if (lower.includes(pattern)) return info.name
  }
  return null
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
  if (lower.includes('meds') || lower.includes('gloves') || lower.includes('sabon') || lower.includes('soap') || lower.includes('sponge') || lower.includes('tissue')) return 'meds'
  if (lower.includes('meta ads') || lower.includes('meta ad')) return 'ads'
  if (lower.includes('bir') || lower.includes('tax') || lower.includes('business permit')) return 'bir'
  if (lower.includes('pagibig')) return 'pagibig'
  return 'other'
}

// ── Main ─────────────────────────────────────────────────────

async function main() {
  console.log('=== Mabalacat Transaction Import ===\n')

  // 1. Create new services
  console.log('Creating new services...')
  let maxOrder = 8
  for (const name of NEW_SERVICES) {
    maxOrder++
    const { data, error } = await sb.from('services').insert({
      name,
      display_order: maxOrder,
      is_active: true,
    }).select('id').single()

    if (error) {
      // Might already exist
      const { data: existing } = await sb.from('services').select('id').eq('name', name).single()
      if (existing) {
        newServiceIds[name.toLowerCase()] = existing.id
        console.log(`  ${name}: already exists (${existing.id})`)
      } else {
        console.log(`  ${name}: ERROR - ${error.message}`)
      }
    } else {
      newServiceIds[name.toLowerCase()] = data.id
      console.log(`  ${name}: created (${data.id})`)
    }
  }

  // 2. Read CSV
  const csv = fs.readFileSync('/Users/robertofink/Downloads/Salon On The Go - Sales CRM 2025 - Mabalacat - Transactions.csv', 'utf8')
  const parsed = Papa.parse(csv, { header: false, skipEmptyLines: true })
  const rows = parsed.data.slice(1) // skip header

  console.log(`\nParsed ${rows.length} data rows`)

  // 3. Build customer phone cache
  const { data: existingCustomers } = await sb.from('customers').select('id, phone')
  const customerByPhone = new Map()
  for (const c of existingCustomers || []) {
    if (c.phone) customerByPhone.set(c.phone, c.id)
  }

  // Stats
  let salesOk = 0, salesErr = 0, expOk = 0, expErr = 0, wdOk = 0, skipped = 0
  const errors = []

  // 4. Process each row
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const txnType = (row[1] || '').trim().toLowerCase()

    if (txnType === 'sale') {
      try {
        await importSale(row, customerByPhone)
        salesOk++
      } catch (err) {
        salesErr++
        errors.push(`Row ${i+2} (sale ${(row[7]||'').trim()}): ${err.message}`)
      }
    } else if (txnType === 'expense' || txnType === 'expenses') {
      try {
        await importExpense(row)
        expOk++
      } catch (err) {
        salesErr++
        errors.push(`Row ${i+2} (expense ${(row[5]||'').trim()}): ${err.message}`)
      }
    } else if (txnType === 'withdrawal') {
      try {
        await importWithdrawal(row)
        wdOk++
      } catch (err) {
        errors.push(`Row ${i+2} (withdrawal): ${err.message}`)
      }
    } else {
      skipped++
    }

    // Progress every 100 rows
    if ((i + 1) % 100 === 0) {
      process.stdout.write(`  ${i+1}/${rows.length} rows processed...\r`)
    }
  }

  console.log(`\n\n=== IMPORT COMPLETE ===`)
  console.log(`Sales:       ${salesOk} ok, ${salesErr} errors`)
  console.log(`Expenses:    ${expOk} ok`)
  console.log(`Withdrawals: ${wdOk} ok`)
  console.log(`Skipped:     ${skipped} blank/unknown rows`)

  if (errors.length > 0) {
    console.log(`\nErrors (${errors.length}):`)
    errors.slice(0, 20).forEach(e => console.log(`  ${e}`))
    if (errors.length > 20) console.log(`  ... and ${errors.length - 20} more`)
  }
}

async function importSale(row, customerByPhone) {
  const date = parseDate(row[0])
  if (!date) throw new Error('No date')

  const fullName = (row[7] || '').trim()
  if (!fullName) throw new Error('No customer name')

  const phone = (row[8] || '').trim()
  const location = (row[9] || '').trim()
  const amount = parseAmount(row[10] || row[2] || '')
  if (amount === 0) throw new Error('Zero amount')

  const servicesRaw = (row[11] || '').trim()
  const serviceNames = parseServices(servicesRaw)

  // Split name
  const spaceIdx = fullName.indexOf(' ')
  const firstName = spaceIdx === -1 ? fullName : fullName.slice(0, spaceIdx)
  const lastName = spaceIdx === -1 ? '' : fullName.slice(spaceIdx + 1).trim()

  // Find or create customer
  let customerId
  if (phone && customerByPhone.has(phone)) {
    customerId = customerByPhone.get(phone)
  } else {
    const { data: newCust, error } = await sb.from('customers').insert({
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      city: location || null,
      is_returning: false,
    }).select('id').single()
    if (error) throw new Error(`Customer: ${error.message}`)
    customerId = newCust.id
    if (phone) customerByPhone.set(phone, customerId)
  }

  // Create visit
  const { data: visit, error: vErr } = await sb.from('visits').insert({
    customer_id: customerId,
    date,
    status: 'completed',
    total_amount: amount,
    completed_at: `${date}T12:00:00`,
    branch_id: BRANCH_ID,
  }).select('id').single()
  if (vErr) throw new Error(`Visit: ${vErr.message}`)

  // Visit services
  if (serviceNames.length > 0) {
    const vs = serviceNames.map(name => ({
      visit_id: visit.id,
      service_id: resolveServiceId(name),
      price: null,
    })).filter(v => v.service_id) // skip unresolved

    if (vs.length > 0) {
      await sb.from('visit_services').insert(vs)
    }
  }

  // Visit payment (default cash)
  await sb.from('visit_payments').insert({
    visit_id: visit.id,
    method: 'cash',
    amount,
  })

  // Transaction
  await sb.from('transactions').insert({
    date,
    type: 'sale',
    amount,
    visit_id: visit.id,
    payment_method: 'cash',
    branch_id: BRANCH_ID,
    description: `Sale - ${fullName}`,
  })
}

async function importExpense(row) {
  const date = parseDate(row[0])
  if (!date) throw new Error('No date')

  const amount = parseAmount(row[3] || '')
  if (amount === 0) throw new Error('Zero amount')

  const notes = (row[5] || '').trim()
  const type = detectExpenseType(notes)
  const category = type === 'expense' ? normalizeCategory(notes) : (type === 'salary' ? 'salary' : 'commission')

  const txn = {
    date,
    type,
    amount,
    category,
    description: notes,
    payment_method: 'cash',
    branch_id: BRANCH_ID,
  }

  // Try to link to employee for commission/salary
  const empName = detectEmployee(notes)
  if (empName) {
    // Look up or note the employee name in description
    txn.description = `${type === 'commission' ? 'Commission' : 'Salary'} - ${empName}`
  }

  const { error } = await sb.from('transactions').insert(txn)
  if (error) throw new Error(error.message)
}

async function importWithdrawal(row) {
  const date = parseDate(row[0])
  if (!date) throw new Error('No date')

  const amount = parseAmount(row[3] || row[2] || '')
  if (amount === 0) throw new Error('Zero amount')

  const notes = (row[5] || '').trim()

  const { error } = await sb.from('transactions').insert({
    date,
    type: 'withdrawal',
    amount,
    description: notes || 'Owner withdrawal',
    payment_method: 'cash',
    branch_id: BRANCH_ID,
  })
  if (error) throw new Error(error.message)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
