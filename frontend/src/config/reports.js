export const REPORT_TIMEZONE = 'Asia/Colombo'
export const PIPELINE_WATCH_DAYS = 7
export const PIPELINE_ATTENTION_DAYS = 14

export const REPORT_PRESETS = Object.freeze([
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '90', label: 'Last 90 days', days: 90 },
  { value: '180', label: 'Last 6 months', days: 180 },
  { value: '365', label: 'Last 12 months', days: 365 },
  { value: 'custom', label: 'Custom range', days: null },
])

export const REPORT_SORTS = Object.freeze([
  { value: 'recent', label: 'Most recent' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'company', label: 'Company' },
  { value: 'stage', label: 'Stage' },
])

export const REPORT_CATEGORIES = Object.freeze([
  { value: '', label: 'All reports' },
  { value: 'conversion', label: 'Conversion' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'activity', label: 'Activity & Follow Ups' },
  { value: 'team', label: 'Team performance' },
])

export const REPORT_CATALOG = Object.freeze([
  {
    key: 'ticket-volume',
    name: 'Ticket Creation Trend',
    description: 'Track new CRM opportunities created during the selected period.',
    category: 'conversion',
    chart: 'volume',
  },
  {
    key: 'conversion',
    name: 'Lead-to-Customer Conversion',
    description: 'Review the selected-period Ticket cohort that reached Sales Order or a later Customer stage.',
    category: 'conversion',
    chart: 'conversion',
  },
  {
    key: 'pipeline-health',
    name: 'Pipeline Health',
    description: 'Inspect active open-stage workload, distribution, and stages that may need attention based on age.',
    category: 'pipeline',
    chart: 'pipeline',
  },
  {
    key: 'outcomes',
    name: 'Won and Lost Outcomes',
    description: 'Compare concluded Ticket outcomes and the resulting win rate.',
    category: 'pipeline',
    chart: 'outcomes',
  },
  {
    key: 'follow-up-health',
    name: 'Follow Up Health',
    description: 'Find completed, pending, cancelled, and overdue Follow Ups.',
    category: 'activity',
    chart: 'followups',
  },
  {
    key: 'activity-summary',
    name: 'CRM Activity Summary',
    description: 'Review the server-recorded workflow actions associated with authorized Tickets.',
    category: 'activity',
    chart: 'volume',
  },
  {
    key: 'team-performance',
    name: 'Assigned Team Performance',
    description: 'Compare Ticket creation, conversion, and outcomes for current assignees.',
    category: 'team',
    chart: 'team',
  },
])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function dateFromParts(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

export function addReportDays(value, amount) {
  const date = dateFromParts(value)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function todayInReportTimezone(now = new Date(), timezone = REPORT_TIMEZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const read = (type) => parts.find((part) => part.type === type)?.value
  return `${read('year')}-${read('month')}-${read('day')}`
}

export function reportPresetRange(preset = '30', today = todayInReportTimezone()) {
  const days = REPORT_PRESETS.find((item) => item.value === preset)?.days ?? 30
  return { from: addReportDays(today, -(days - 1)), to: today }
}

export function defaultReportFilters(today = todayInReportTimezone()) {
  return { preset: '30', ...reportPresetRange('30', today), pipelineId: '', stage: '', ownerId: '' }
}

export function validReportRange(from, to, today = todayInReportTimezone()) {
  if (!ISO_DATE.test(from ?? '') || !ISO_DATE.test(to ?? '')) return false
  const span = (dateFromParts(to) - dateFromParts(from)) / 86_400_000
  return span >= 0 && span <= 730 && to <= today
}

export function parseReportFilters(search = '', today = todayInReportTimezone()) {
  const params = new URLSearchParams(search)
  const defaults = defaultReportFilters(today)
  const preset = REPORT_PRESETS.some((item) => item.value === params.get('preset')) ? params.get('preset') : defaults.preset
  const candidate = {
    preset,
    from: params.get('from') ?? defaults.from,
    to: params.get('to') ?? defaults.to,
    pipelineId: params.get('pipeline') ?? '',
    stage: params.get('stage') ?? '',
    ownerId: params.get('owner') ?? '',
  }
  if (!validReportRange(candidate.from, candidate.to, today)) return { ...defaults, pipelineId: candidate.pipelineId, stage: candidate.stage, ownerId: candidate.ownerId }
  return candidate
}

export function serializeReportFilters(filters = {}) {
  const params = new URLSearchParams()
  if (filters.preset && filters.preset !== '30') params.set('preset', filters.preset)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  if (filters.pipelineId) params.set('pipeline', filters.pipelineId)
  if (filters.stage) params.set('stage', filters.stage)
  if (filters.ownerId) params.set('owner', filters.ownerId)
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function comparisonFor(metric, { inverse = false } = {}) {
  const current = Number(metric?.value)
  const previous = Number(metric?.previous)
  if (metric?.value == null || metric?.previous == null || !Number.isFinite(current) || !Number.isFinite(previous)) return null
  if (previous === 0) return current === 0 ? { percent: 0, direction: 'neutral' } : { percent: null, direction: inverse ? 'negative' : 'positive' }
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10
  const rawDirection = percent === 0 ? 'neutral' : percent > 0 ? 'positive' : 'negative'
  return { percent, direction: inverse && rawDirection !== 'neutral' ? (rawDirection === 'positive' ? 'negative' : 'positive') : rawDirection }
}

export function formatReportMetric(value, format = 'count') {
  if (value == null || Number.isNaN(Number(value))) return 'N/A'
  if (format === 'percent') return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(Number(value))}%`
  if (format === 'days') return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(Number(value))} days`
  return new Intl.NumberFormat().format(Number(value))
}

export function pipelineStageHealth(stage = {}) {
  const count = Math.max(0, Number(stage.count ?? 0))
  const averageAgeDays = Math.max(0, Number(stage.averageAgeDays ?? 0))
  if (count === 0) return { key: 'empty', label: 'No active Tickets' }
  if (averageAgeDays >= PIPELINE_ATTENTION_DAYS) return { key: 'attention', label: 'Needs attention' }
  if (averageAgeDays >= PIPELINE_WATCH_DAYS) return { key: 'watch', label: 'Watch' }
  return { key: 'healthy', label: 'On track' }
}

export function summarizePipelineHealth(stages = [], asOf = null) {
  const openStages = stages
    .filter((stage) => String(stage?.category ?? '').toLowerCase() === 'open')
    .map((stage) => ({
      ...stage,
      count: Math.max(0, Number(stage.count ?? 0)),
      averageAgeDays: Math.max(0, Number(stage.averageAgeDays ?? 0)),
      probability: Math.max(0, Number(stage.probability ?? 0)),
    }))
  const total = openStages.reduce((sum, stage) => sum + stage.count, 0)
  const normalizedStages = openStages.map((stage) => ({
    ...stage,
    workloadShare: total ? Math.round((stage.count / total) * 1000) / 10 : 0,
    health: pipelineStageHealth(stage),
  }))
  return {
    asOf,
    total,
    occupiedStages: normalizedStages.filter((stage) => stage.count > 0).length,
    attentionStages: normalizedStages.filter((stage) => stage.health.key === 'attention').length,
    stages: normalizedStages,
  }
}

export function reportDateLabel(from, to) {
  const options = { dateStyle: 'medium', timeZone: 'UTC' }
  const start = new Intl.DateTimeFormat(undefined, options).format(dateFromParts(from))
  const end = new Intl.DateTimeFormat(undefined, options).format(dateFromParts(to))
  return from === to ? start : `${start} – ${end}`
}

export function reportBucketLabel(bucket) {
  return reportDateLabel(bucket.from, bucket.to)
}

export function reportByKey(key) {
  return REPORT_CATALOG.find((report) => report.key === key) ?? null
}

export function csvCell(value) {
  const joined = Array.isArray(value) ? value.join('; ') : value == null ? '' : String(value)
  const protectedValue = /^[=+\-@]/.test(joined.trimStart()) ? `'${joined}` : joined
  return `"${protectedValue.replaceAll('"', '""')}"`
}

export function recordsToCsv(columns = [], records = []) {
  const header = columns.map((column) => csvCell(column.label)).join(',')
  const rows = records.map((record) => columns.map((column) => csvCell(record[column.key])).join(','))
  return `\uFEFF${[header, ...rows].join('\r\n')}`
}

export function reportFilename(reportName, from, to) {
  const safeName = reportName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'report'
  return `leadsphere-${safeName}-${from}-to-${to}.csv`
}
