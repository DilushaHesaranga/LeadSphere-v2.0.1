import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  addReportDays, comparisonFor, csvCell, defaultReportFilters, formatReportMetric,
  parseReportFilters, pipelineStageHealth, recordsToCsv, reportByKey, reportFilename,
  reportPresetRange, REPORT_CATALOG, serializeReportFilters, summarizePipelineHealth,
  todayInReportTimezone, validReportRange,
} from '../src/config/reports.js'

const migration = await readFile(new URL('../../supabase/migrations/20260827000100_reports_and_insights.sql', import.meta.url), 'utf8')
const pipelineMigration = await readFile(new URL('../../supabase/migrations/20260829000200_pipeline_health_complete_stage_snapshot.sql', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const overviewPage = await readFile(new URL('../src/pages/ReportsPage.jsx', import.meta.url), 'utf8')
const detailPage = await readFile(new URL('../src/pages/ReportDetailPage.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/ReportsWorkspace.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/reportService.js', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('report presets use inclusive local-date boundaries', () => {
  assert.deepEqual(reportPresetRange('30', '2026-08-27'), { from: '2026-07-29', to: '2026-08-27' })
  assert.deepEqual(defaultReportFilters('2026-08-27'), {
    preset: '30', from: '2026-07-29', to: '2026-08-27', pipelineId: '', stage: '', ownerId: '',
  })
  assert.equal(addReportDays('2024-02-28', 1), '2024-02-29')
})

test('Asia/Colombo reporting day is deterministic across the UTC boundary', () => {
  assert.equal(todayInReportTimezone(new Date('2026-08-26T19:00:00Z')), '2026-08-27')
  assert.equal(todayInReportTimezone(new Date('2026-08-26T18:00:00Z')), '2026-08-26')
})

test('report range validation rejects reverse, future, malformed, and excessive ranges', () => {
  assert.equal(validReportRange('2026-08-01', '2026-08-27', '2026-08-27'), true)
  assert.equal(validReportRange('2026-08-28', '2026-08-27', '2026-08-27'), false)
  assert.equal(validReportRange('2026-08-01', '2026-08-28', '2026-08-27'), false)
  assert.equal(validReportRange('not-a-date', '2026-08-27', '2026-08-27'), false)
  assert.equal(validReportRange('2024-01-01', '2026-08-27', '2026-08-27'), false)
})

test('report filters round-trip through shareable URL parameters', () => {
  const filters = { preset: 'custom', from: '2026-08-01', to: '2026-08-20', pipelineId: 'pipe-1', stage: 'negotiation', ownerId: 'user-1' }
  const query = serializeReportFilters(filters)
  assert.match(query, /preset=custom/)
  assert.deepEqual(parseReportFilters(query, '2026-08-27'), filters)
  assert.deepEqual(parseReportFilters('?from=broken&to=2026-08-27&stage=qualification', '2026-08-27'), {
    ...defaultReportFilters('2026-08-27'), stage: 'qualification',
  })
})

test('period comparisons handle zero, null, negative change, and inverse risk metrics', () => {
  assert.deepEqual(comparisonFor({ value: 0, previous: 0 }), { percent: 0, direction: 'neutral' })
  assert.deepEqual(comparisonFor({ value: 4, previous: 0 }), { percent: null, direction: 'positive' })
  assert.deepEqual(comparisonFor({ value: 5, previous: 10 }), { percent: -50, direction: 'negative' })
  assert.deepEqual(comparisonFor({ value: 5, previous: 10 }, { inverse: true }), { percent: -50, direction: 'positive' })
  assert.equal(comparisonFor({ value: null, previous: 3 }), null)
})

test('report formatting handles unavailable and decimal metrics', () => {
  assert.equal(formatReportMetric(null), 'N/A')
  assert.equal(formatReportMetric(15.25, 'percent'), '15.3%')
  assert.equal(formatReportMetric(4.55, 'days'), '4.6 days')
})

test('CSV export quotes fields and prevents spreadsheet-formula injection', () => {
  assert.equal(csvCell('=HYPERLINK("bad")'), '"\'=HYPERLINK(""bad"")"')
  assert.equal(csvCell('+123'), '"\'+123"')
  const csv = recordsToCsv([{ key: 'company', label: 'Company' }], [{ company: '@unsafe' }, { company: 'Safe, Inc.' }])
  assert.match(csv, /^\uFEFF"Company"/)
  assert.match(csv, /"'@unsafe"/)
  assert.match(csv, /"Safe, Inc\."/)
  assert.equal(reportFilename('Won / Lost?', '2026-08-01', '2026-08-27'), 'leadsphere-won-lost-2026-08-01-to-2026-08-27.csv')
})

test('the standard report catalog is stable and contains no fabricated monetary report', () => {
  assert.deepEqual(REPORT_CATALOG.map((report) => report.key), [
    'ticket-volume', 'conversion', 'pipeline-health', 'outcomes',
    'follow-up-health', 'activity-summary', 'team-performance',
  ])
  assert.equal(reportByKey('pipeline-health')?.category, 'pipeline')
  assert.equal(reportByKey('revenue'), null)
})

test('pipeline health separates open workload from outcomes and explains ageing risk', () => {
  const summary = summarizePipelineHealth([
    { pipelineId: 'sales', pipelineName: 'Sales', stage: 'qualification', label: 'Qualification', category: 'open', count: 6, averageAgeDays: 3, probability: 25 },
    { pipelineId: 'sales', pipelineName: 'Sales', stage: 'proposal', label: 'Proposal', category: 'open', count: 3, averageAgeDays: 8, probability: 50 },
    { pipelineId: 'sales', pipelineName: 'Sales', stage: 'negotiation', label: 'Negotiation', category: 'open', count: 1, averageAgeDays: 16, probability: 75 },
    { pipelineId: 'sales', pipelineName: 'Sales', stage: 'won', label: 'Close won', category: 'won', count: 9, averageAgeDays: 20, probability: 100 },
    { pipelineId: 'sales', pipelineName: 'Sales', stage: 'lost', label: 'Lost', category: 'lost', count: 4, averageAgeDays: 12, probability: 0 },
  ], '2026-08-29')
  assert.equal(summary.total, 23)
  assert.equal(summary.activeTotal, 10)
  assert.equal(summary.outcomeTotal, 13)
  assert.equal(summary.occupiedStages, 5)
  assert.equal(summary.attentionStages, 1)
  assert.deepEqual(summary.stages.map((stage) => stage.stage), ['qualification', 'proposal', 'negotiation', 'won', 'lost'])
  assert.deepEqual(summary.stages.map((stage) => stage.health.key), ['healthy', 'watch', 'attention', 'won', 'lost'])
  assert.equal(pipelineStageHealth({ count: 0, averageAgeDays: 99 }).key, 'empty')
})

test('reporting RPCs authorize every request and derive record scope in the database', () => {
  assert.match(migration, /current_user_has_permission\('reports\.read'\)/)
  assert.match(migration, /crm_can_access_ticket\(ticket\.id, 'reports\.read'\)/)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/)
  assert.match(migration, /revoke all on function public\.crm_report_ticket_scope[\s\S]*authenticated/)
  assert.match(migration, /grant execute on function public\.get_crm_reports_overview[\s\S]*to authenticated/)
})

test('database validation and aggregation use bounded local dates and indexed server queries', () => {
  assert.match(migration, /crm_timeline_timezone\(\)/)
  assert.match(migration, /p_to - p_from > 730/)
  assert.match(migration, /Report end date cannot be in the future/)
  assert.match(migration, /Select a valid pipeline[\s\S]*Select a valid stage[\s\S]*Select a valid owner or assignee/)
  assert.match(migration, /crm_tickets_created_reporting_idx/)
  assert.match(migration, /generate_series[\s\S]*bucket_unit/)
  assert.match(migration, /nullif\(current_won \+ current_lost, 0\)/)
})

test('pipeline health RPC is permission-scoped and separates open work from outcomes', () => {
  assert.match(migration, /left join current_scope scoped[\s\S]*where stage\.is_active\s+and stage\.semantic_category = 'open'/)
  assert.match(pipelineMigration, /crm_validate_report_query\(p_as_of, p_as_of/)
  assert.match(pipelineMigration, /crm_report_ticket_scope\(as_of_utc, p_pipeline_id, p_stage, p_owner_id\)/)
  assert.match(pipelineMigration, /scoped\.ticket_status = 'active'/)
  assert.match(pipelineMigration, /grouped\.stage_category = 'open'/)
  assert.match(pipelineMigration, /grouped\.stage_category in \('won', 'lost'\)/)
  assert.match(pipelineMigration, /'activeTotal', open_total[\s\S]*'outcomeTotal', outcome_total/)
  assert.match(pipelineMigration, /grant execute on function public\.get_crm_pipeline_health[\s\S]*to authenticated/)
  assert.match(migration, /when 'pipeline-health' then ticket_status = 'active' and stage_category = 'open'/)
})

test('overview and drill-down share cohort, outcome, activity, and Follow Up boundaries', () => {
  assert.match(migration, /created_at >= from_utc and current_scope\.created_at < to_utc[\s\S]*converted_at is not null/)
  assert.match(migration, /when 'conversion' then created_at >= from_utc and created_at < to_utc and converted_at is not null/)
  assert.match(migration, /occurrence\.status = 'COMPLETED' and occurrence\.scheduled_at >= from_utc/)
  assert.match(migration, /activity\.created_at >= from_utc and activity\.created_at < to_utc/)
  assert.match(migration, /outcome_at >= from_utc and outcome_at < to_utc and stage_category in \('won','lost'\)/)
})

test('record details are paginated on the server and CSV fetches every authorized page', () => {
  assert.match(migration, /least\(greatest\(coalesce\(p_page_size, 25\), 1\), 200\)/)
  assert.match(migration, /offset \(page_number - 1\) \* page_size limit page_size/)
  assert.match(service, /list_crm_report_records/)
  assert.match(detailPage, /pageSize: 200/)
  assert.match(detailPage, /while \(exportPage <= response\.pageCount\)/)
  assert.match(detailPage, /recordsToCsv/)
})

test('Reports & Insights is permission-gated and includes resilient interactive states', () => {
  assert.match(consolePage, /Reports & Insights[\s\S]*PERMISSIONS\.REPORTS_READ/)
  assert.match(consolePage, /<ReportsPage[\s\S]*<ReportDetailPage/)
  assert.match(overviewPage, /ReportSkeleton/)
  assert.match(overviewPage, /Retry/)
  assert.match(overviewPage, /Clear filters|onClear/)
  assert.match(overviewPage, /ReportsLibrary/)
  assert.match(workspace, /aria-label="Report summary metrics"/)
  assert.match(workspace, /Tickets by pipeline stage/)
  assert.match(workspace, /Share of visible Tickets and average time in stage/)
  assert.match(workspace, /aria-label="Visible Tickets by pipeline stage"/)
  assert.match(workspace, /stage\.category === 'open' \? 'pipeline-health' : 'outcomes'/)
  assert.match(workspace, /onDrillDown/)
  assert.match(detailPage, /No records match this report/)
  assert.match(styles, /@media \(max-width:850px\)[\s\S]*report-dashboard-grid/)
  assert.match(styles, /prefers-reduced-motion:reduce/)
})
