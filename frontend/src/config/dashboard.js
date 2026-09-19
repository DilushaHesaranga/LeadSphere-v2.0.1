import { addReportDays, todayInReportTimezone } from './reports.js'
import { SALES_CURRENCIES } from './ticketSales.js'

export const DASHBOARD_PRESETS = Object.freeze([
  { value: 'month', label: 'This month' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: '365', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom dates' },
])

export function dashboardRange(preset = 'month', today = todayInReportTimezone()) {
  return { from: preset === 'month' ? `${today.slice(0, 7)}-01` : addReportDays(today, -(Number(preset) || 30) + 1), to: today }
}

export function defaultDashboardFilters(today = todayInReportTimezone()) {
  return { preset: 'month', ...dashboardRange('month', today), pipelineId: '', ownerId: '', department: '' }
}

export function refreshDashboardFilters(filters, today = todayInReportTimezone()) {
  if (filters.preset === 'custom') return filters
  const range = dashboardRange(filters.preset, today)
  if (range.from === filters.from && range.to === filters.to) return filters
  return { ...filters, ...range }
}

function realDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function dashboardRangeError(from, to, today = todayInReportTimezone()) {
  if (!realDate(from) || !realDate(to)) return 'Choose a valid start and end date.'
  if (from > to) return 'The start date must be on or before the end date.'
  if (to > today) return 'The end date cannot be in the future.'
  if ((new Date(to) - new Date(from)) / 86_400_000 > 730) return 'Choose a date range of 731 days or fewer.'
  return ''
}

export function parseDashboardFilters(search = '', today = todayInReportTimezone()) {
  const params = new URLSearchParams(search)
  const defaults = defaultDashboardFilters(today)
  const preset = DASHBOARD_PRESETS.some((item) => item.value === params.get('period')) ? params.get('period') : defaults.preset
  const range = preset === 'custom' ? { from: params.get('from'), to: params.get('to') } : dashboardRange(preset, today)
  return {
    ...(dashboardRangeError(range.from, range.to, today) ? defaults : { ...defaults, preset, ...range }),
    pipelineId: params.get('pipeline') ?? '',
    ownerId: params.get('owner') ?? '',
    department: ['marketing', 'sales', 'delivery'].includes(params.get('department')) ? params.get('department') : '',
  }
}

export function serializeDashboardFilters(filters) {
  const params = new URLSearchParams({ period: filters.preset })
  if (filters.preset === 'custom') { params.set('from', filters.from); params.set('to', filters.to) }
  if (filters.pipelineId) params.set('pipeline', filters.pipelineId)
  if (filters.ownerId) params.set('owner', filters.ownerId)
  if (filters.department) params.set('department', filters.department)
  return `?${params}`
}

export function dashboardParameters(filters) {
  return { p_from: filters.from, p_to: filters.to, p_pipeline_id: filters.pipelineId || null, p_owner_id: filters.ownerId || null, p_department: filters.department || null }
}

export function dashboardErrorMessage(error) {
  const message = error?.message ?? ''
  if (/permission|forbidden|access denied/i.test(message)) return 'Your role does not have access to this dashboard.'
  if (error?.code === 'PGRST202' || /schema cache|does not exist/i.test(message)) return 'The dashboard database update is not installed yet. Your project administrator needs to complete dashboard setup.'
  if (/^(Select a valid|Report date ranges|Report end date)/.test(message)) return message
  return 'The dashboard could not be loaded. Please try again.'
}

// Keep currencies separate and include empty months so a gap never looks like missing data.
export function dashboardSalesMonths(series = [], currency, from, to) {
  if (!realDate(from) || !realDate(to) || from > to) return []
  const rows = new Map(series.filter((item) => item.currency === currency).map((item) => [item.month.slice(0, 7), item]))
  const date = new Date(`${from.slice(0, 7)}-01T00:00:00Z`)
  const end = to.slice(0, 7)
  const result = []
  while (date.toISOString().slice(0, 7) <= end && result.length < 25) {
    const key = date.toISOString().slice(0, 7)
    result.push({ month: `${key}-01`, currency, wonValue: 0, wonCount: 0, withValue: 0, missingValue: 0, ...rows.get(key) })
    date.setUTCMonth(date.getUTCMonth() + 1)
  }
  return result
}

export function dashboardCount(value) {
  return value == null || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat().format(Number(value))
}

// Aggregates may exceed the maximum allowed for a single ticket.
export function dashboardMoney(value, currency = 'LKR') {
  if (value == null || value === '') return 'Not recorded'
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0 || !SALES_CURRENCIES.includes(currency)) return 'Unavailable'
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'code', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

export function dashboardSalesValue(sales, currency, kind = 'won') {
  if (!SALES_CURRENCIES.includes(currency)) return 'Unavailable'
  if (Number(sales?.[`${kind}WithValue`]) > 0) return dashboardMoney(sales[`${kind}Value`], currency)
  if (Number(sales?.[`${kind}MissingValue`]) > 0) return 'Not recorded'
  return `No ${currency} value`
}
