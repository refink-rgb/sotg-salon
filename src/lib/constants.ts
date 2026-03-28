export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'gcash', label: 'GCash' },
  { value: 'bpi', label: 'BPI' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
] as const

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'electric', label: 'Electric' },
  { value: 'water', label: 'Water' },
  { value: 'wifi', label: 'Wifi' },
  { value: 'food', label: 'Food' },
  { value: 'meds', label: 'Meds/Supplies' },
  { value: 'ads', label: 'Ads/Marketing' },
  { value: 'pagibig', label: 'PAGIBIG' },
  { value: 'bir', label: 'BIR' },
  { value: 'other', label: 'Other' },
] as const

export const DEFAULT_SERVICES = [
  'Basic', 'Regular', 'Brazilian', 'Protein', 'Botox', 'Balayage', 'Highlights', 'Color'
]

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
] as const
