export const SALES_CURRENCIES = Object.freeze(['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD'])
export const DEFAULT_SALES_CURRENCY = 'LKR'
export const MAX_DEAL_VALUE = 999999999999.99

export function validateDealValue(input) {
  const text = typeof input === 'string' ? input.trim() : input == null ? '' : String(input)
  if (!text) return { value: null, error: '' }
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) {
    return { value: null, error: 'Enter a positive amount or zero, with up to two decimal places.' }
  }
  const value = Number(text)
  if (!Number.isFinite(value) || value > MAX_DEAL_VALUE) {
    return { value: null, error: 'Enter an amount no greater than 999,999,999,999.99.' }
  }
  return { value, error: '' }
}

export function formatDealValue(value, currency = DEFAULT_SALES_CURRENCY) {
  if (value == null || value === '') return 'Not recorded'
  const parsed = validateDealValue(value)
  if (parsed.error || !SALES_CURRENCIES.includes(currency)) return 'Unavailable'
  if (parsed.value == null) return 'Not recorded'
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(parsed.value)
}

export function normalizeTicketSales(data) {
  if (!data || !Object.hasOwn(data, 'dealValue') || !SALES_CURRENCIES.includes(data.currency)) {
    throw new Error('Recorded deal value is unavailable. Please try again.')
  }
  const parsed = validateDealValue(data.dealValue)
  if (parsed.error) throw new Error('Recorded deal value is unavailable. Please try again.')
  return { ...data, dealValue: parsed.value }
}

export function ticketSalesErrorMessage(error) {
  if (['PGRST202', '42883'].includes(error?.code)) return 'Sales setup is pending. Apply the CRM dashboard database update to enable recorded deal values.'
  if (error?.code === '42501' || /permission|forbidden|access denied/i.test(error?.message ?? '')) {
    return 'You do not have permission to access or change this ticket’s recorded deal value.'
  }
  if (/not found|archived/i.test(error?.message ?? '')) return 'This ticket is no longer available for sales updates.'
  return 'Recorded deal value is unavailable. Please try again.'
}
