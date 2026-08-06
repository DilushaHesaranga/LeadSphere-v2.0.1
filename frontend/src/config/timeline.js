export const TIMELINE_TIMEZONE = 'Asia/Colombo'

export const TIMELINE_CATEGORIES = Object.freeze([
  { value: 'activity', label: 'Activity', symbol: 'A' },
  { value: 'email', label: 'Emails', symbol: 'E' },
  { value: 'call', label: 'Calls', symbol: 'C' },
])

export const TIMELINE_PRESETS = Object.freeze([
  { value: '7', label: 'Last 7 days', days: 7 },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: 'custom', label: 'Custom range' },
])

export function timelineDate(value = new Date(), timezone = TIMELINE_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value).reduce((result, part) => ({ ...result, [part.type]: part.value }), {})
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function timelinePresetRange(days = 30, now = new Date()) {
  const to = timelineDate(now)
  const fromDate = new Date(`${to}T00:00:00Z`)
  fromDate.setUTCDate(fromDate.getUTCDate() - Math.max(days - 1, 0))
  return { from: fromDate.toISOString().slice(0, 10), to }
}

export function timelineGrouping(from, to) {
  const days = Math.floor((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86_400_000) + 1
  if (days <= 31) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

export function timelineBucketLabel(value, grouping = 'day') {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return new Intl.DateTimeFormat(undefined, grouping === 'month'
    ? { month: 'short', year: 'numeric', timeZone: 'UTC' }
    : { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)
}

export function timelineRangeIsValid(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(to ?? '')) return false
  const difference = new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)
  return difference >= 0 && difference <= 730 * 86_400_000
}

export function toggleTimelineCategory(categories, category) {
  if (categories.includes(category)) return categories.length === 1 ? categories : categories.filter((item) => item !== category)
  return [...categories, category]
}

export function timelineTotals(series = [], categories = TIMELINE_CATEGORIES.map((item) => item.value)) {
  return series.reduce((totals, bucket) => {
    categories.forEach((category) => { totals[category] += Number(bucket[category] ?? 0) })
    return totals
  }, { activity: 0, email: 0, call: 0 })
}

export function humanizeTimelineType(value = '') {
  return value.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

export function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return ''
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}
