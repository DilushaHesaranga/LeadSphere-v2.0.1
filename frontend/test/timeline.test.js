import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  timelineGrouping, timelinePresetRange, timelineRangeIsValid, timelineTotals, toggleTimelineCategory,
} from '../src/config/timeline.js'

const migration = await readFile(new URL('../../supabase/migrations/20260806000200_ticket_timeline.sql', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/TimelineWorkspace.jsx', import.meta.url), 'utf8')
const chart = await readFile(new URL('../src/components/TimelineChart.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/timelineService.js', import.meta.url), 'utf8')
const ticketPage = await readFile(new URL('../src/pages/TicketDetailPage.jsx', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('category filtering supports combinations while retaining one category', () => {
  assert.deepEqual(toggleTimelineCategory(['activity', 'email'], 'activity'), ['email'])
  assert.deepEqual(toggleTimelineCategory(['email'], 'email'), ['email'])
  assert.deepEqual(toggleTimelineCategory(['email'], 'call'), ['email', 'call'])
})

test('preset ranges and automatic grouping use calendar-safe boundaries', () => {
  assert.deepEqual(timelinePresetRange(7, new Date('2026-08-06T05:00:00Z')), { from: '2026-07-31', to: '2026-08-06' })
  assert.equal(timelineGrouping('2026-07-07', '2026-08-06'), 'day')
  assert.equal(timelineGrouping('2026-05-01', '2026-08-06'), 'week')
  assert.equal(timelineGrouping('2025-01-01', '2026-08-06'), 'month')
  assert.equal(timelineRangeIsValid('2026-08-01', '2026-08-06'), true)
  assert.equal(timelineRangeIsValid('2026-08-07', '2026-08-06'), false)
})

test('totals preserve separate selected series without double counting', () => {
  const series = [{ activity: 5, email: 10, call: 3 }, { activity: 2, email: 1, call: 0 }]
  assert.deepEqual(timelineTotals(series), { activity: 7, email: 11, call: 3 })
  assert.deepEqual(timelineTotals(series, ['email']), { activity: 0, email: 11, call: 0 })
})

test('database aggregation is chart-ready, timezone-aware, and server filtered', () => {
  assert.match(migration, /create or replace function public\.get_crm_timeline/)
  assert.match(migration, /Asia\/Colombo/)
  assert.match(migration, /at time zone timezone_name/)
  assert.match(migration, /count\(\*\) filter \(where event_category = 'activity'\)/)
  assert.match(migration, /public\.crm_can_access_ticket\(ticket\.id, 'tickets\.read'\)/)
  assert.match(migration, /p_department[\s\S]*p_manager_id[\s\S]*p_status[\s\S]*p_stage[\s\S]*p_activity_type/)
})

test('detail retrieval is paginated and protects sensitive communication fields', () => {
  assert.match(migration, /create or replace function public\.list_crm_timeline_details/)
  assert.match(migration, /limit safe_size offset/)
  assert.match(migration, /current_user_has_permission\('activities\.read'\)/)
  assert.match(migration, /communication\.created_by_user_id = actor/)
  assert.match(migration, /revoke all on public\.crm_ticket_communications from anon, authenticated/)
  assert.match(migration, /recordingAvailable/)
  assert.doesNotMatch(workspace, /recordingUrl|<audio/)
})

test('communications are genuine idempotent launches with future recording fields', () => {
  assert.match(migration, /create table if not exists public\.crm_ticket_communications/)
  assert.match(migration, /recording_id text[\s\S]*recording_url text[\s\S]*recording_access_permission text/)
  assert.match(migration, /crm_ticket_communications_request_unique/)
  assert.match(migration, /EMAIL_INITIATED[\s\S]*CALL_INITIATED/)
  assert.match(ticketPage, /timelineService\.recordCommunicationLaunch/)
  assert.match(ticketPage, /leadsphere:timeline-changed/)
})

test('Ticket and global Timeline share the same workspace and service', () => {
  assert.match(ticketPage, /<TimelineWorkspace ticket=\{ticket\}/)
  assert.match(consolePage, /pathname === '\/console\/timeline'.*<TimelinePage/)
  assert.match(workspace, /timelineService\.summary/)
  assert.match(workspace, /timelineService\.details/)
  assert.match(service, /get_crm_timeline/)
  assert.match(service, /list_crm_timeline_details/)
})

test('chart has grouped selectable bars, tooltips, legend, and accessible fallback', () => {
  assert.match(chart, /visibleCategories\.map/)
  assert.match(chart, /timeline-bar-group/)
  assert.match(chart, /onMouseEnter/)
  assert.match(chart, /onFocus/)
  assert.match(chart, /aria-label=\{`\$\{timelineBucketLabel/)
  assert.match(chart, /horizontal axis shows dates and the vertical axis shows occurrence counts/i)
  assert.match(chart, /right\.date\.localeCompare\(left\.date\)/)
  assert.match(styles, /repeating-linear-gradient[\s\S]*radial-gradient/)
})

test('bar selection keeps the detail loading transition render-safe', () => {
  assert.match(workspace, /details && details\.total > details\.pageSize/)
  assert.match(workspace, /details\?\.records\?\.length/)
})

test('global filters, stale request protection, refresh, dark mode, and responsive layouts are present', () => {
  assert.match(workspace, /Department[\s\S]*Responsible manager[\s\S]*Ticket status[\s\S]*Ticket stage[\s\S]*Activity type/)
  assert.match(workspace, /requestSequence/)
  assert.match(workspace, /detailSequence/)
  assert.match(workspace, /setInterval\(load, 60_000\)/)
  assert.match(styles, /:root\[data-theme='dark'\] \.timeline-page/)
  assert.match(styles, /@media \(max-width:760px\)[\s\S]*\.timeline-summary/)
  assert.match(styles, /\.timeline-chart-scroll \{ overflow-x:auto/)
})
