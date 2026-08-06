import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  calculateNextOccurrence,
  createFollowUpRequestId,
  localDateTimeToIso,
  toDateTimeLocalValue,
  validateFollowUp,
} from '../src/config/followUps.js'

const migration = await readFile(new URL('../../supabase/migrations/20260806000100_follow_ups.sql', import.meta.url), 'utf8')
const dialog = await readFile(new URL('../src/components/FollowUpDialog.jsx', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/FollowUpWorkspace.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/followUpService.js', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const ticketPage = await readFile(new URL('../src/pages/TicketDetailPage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('Follow Up validation requires Ticket, future date, type, and conditional frequency', () => {
  const base = { ticketId: '', scheduledAt: '', type: '', purpose: '', recurring: false, frequency: '' }
  const errors = validateFollowUp(base, { requireTicket: true, now: Date.parse('2026-01-01T00:00:00Z') })
  assert.ok(errors.ticketId)
  assert.ok(errors.scheduledAt)
  assert.ok(errors.type)
  assert.equal(errors.frequency, undefined)

  const recurring = validateFollowUp({ ...base, ticketId: 'ticket', scheduledAt: '2026-02-01T00:00:00Z', type: 'EMAIL', recurring: true }, { requireTicket: true, now: Date.parse('2026-01-01T00:00:00Z') })
  assert.ok(recurring.frequency)
  assert.deepEqual(validateFollowUp({ ...base, ticketId: 'ticket', scheduledAt: '2026-02-01T00:00:00Z', type: 'CALL', recurring: true, frequency: 'WEEKLY' }, { requireTicket: true, now: Date.parse('2026-01-01T00:00:00Z') }), {})
})

test('Follow Up validation rejects long purpose and stale or invalid dates', () => {
  const input = { ticketId: 'ticket', scheduledAt: 'invalid', type: 'MEETING', purpose: 'x'.repeat(1001), recurring: false, frequency: '' }
  const invalid = validateFollowUp(input, { requireTicket: true, now: 0 })
  assert.ok(invalid.scheduledAt)
  assert.ok(invalid.purpose)
  const stale = validateFollowUp({ ...input, scheduledAt: '2025-01-01T00:00:00Z', purpose: '' }, { requireTicket: true, now: Date.parse('2026-01-01T00:00:00Z') })
  assert.ok(stale.scheduledAt)
})

test('daily, every-three-day, and weekly recurrence use the previous schedule', () => {
  assert.equal(calculateNextOccurrence('2026-08-01T09:30:00.000Z', 'DAILY'), '2026-08-02T09:30:00.000Z')
  assert.equal(calculateNextOccurrence('2026-08-01T09:30:00.000Z', 'EVERY_3_DAYS'), '2026-08-04T09:30:00.000Z')
  assert.equal(calculateNextOccurrence('2026-08-01T09:30:00.000Z', 'WEEKLY'), '2026-08-08T09:30:00.000Z')
})

test('monthly recurrence clamps month ends including normal and leap February', () => {
  assert.equal(calculateNextOccurrence('2025-01-31T10:15:00.000Z', 'MONTHLY'), '2025-02-28T10:15:00.000Z')
  assert.equal(calculateNextOccurrence('2024-01-31T10:15:00.000Z', 'MONTHLY'), '2024-02-29T10:15:00.000Z')
  assert.equal(calculateNextOccurrence('2026-03-31T10:15:00.000Z', 'MONTHLY'), '2026-04-30T10:15:00.000Z')
})

test('date-time input conversion preserves the browser local wall-clock value', () => {
  const local = '2026-08-06T09:30'
  const iso = localDateTimeToIso(local)
  assert.equal(iso, new Date(local).toISOString())
  assert.equal(toDateTimeLocalValue(iso), local)
})

test('creation request IDs are valid UUIDs for duplicate-submit protection', () => {
  assert.match(createFollowUpRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
})

test('database schema separates recurring series and historical occurrences', () => {
  assert.match(migration, /create table if not exists public\.crm_follow_up_series/)
  assert.match(migration, /create table if not exists public\.crm_follow_up_occurrences/)
  assert.match(migration, /series_id uuid/)
  assert.match(migration, /foreign key \(series_id, ticket_id\)/)
  assert.match(migration, /status in \('PENDING','COMPLETED','CANCELLED'\)/)
  for (const index of ['ticket_idx', 'scheduled_idx', 'status_idx', 'series_idx', 'created_by_idx']) assert.ok(migration.includes(index))
})

test('database access follows Ticket visibility and mutation permissions', () => {
  assert.match(migration, /crm_follow_up_occurrences_read[\s\S]*crm_can_access_ticket\(ticket_id, 'tickets\.read'\)/)
  assert.match(migration, /create_crm_follow_up[\s\S]*crm_can_access_ticket\(p_ticket_id, 'tickets\.notes\.create'\)/)
  assert.match(migration, /search_crm_follow_up_tickets[\s\S]*crm_can_access_ticket\(ticket\.id, 'tickets\.notes\.create'\)/)
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on public\.crm_follow_up_series, public\.crm_follow_up_occurrences/)
})

test('recurring completion creates exactly one next occurrence idempotently', () => {
  const complete = migration.match(/create or replace function public\.complete_crm_follow_up[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(complete, /crm_next_follow_up_at\(occurrence\.scheduled_at/)
  assert.match(complete, /on conflict \(series_id, scheduled_at\) where series_id is not null do nothing/)
  assert.match(migration, /crm_follow_up_occurrences_one_series_date/)
  assert.match(migration, /pg_advisory_xact_lock/)
  assert.match(migration, /crm_follow_up_occurrences_request_unique/)
})

test('cancelling one recurring occurrence advances the active series without deleting history', () => {
  const cancel = migration.match(/create or replace function public\.cancel_crm_follow_up[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(cancel, /set status = 'CANCELLED'/)
  assert.match(cancel, /if series\.is_active then/)
  assert.match(cancel, /crm_next_follow_up_at\(occurrence\.scheduled_at/)
  assert.doesNotMatch(cancel, /delete from/)
})

test('ticket and global Follow Ups share one persisted service', () => {
  assert.match(ticketPage, /\['follow-ups', 'Follow Ups'\]/)
  assert.match(ticketPage, /<FollowUpWorkspace ticket=\{ticket\}/)
  assert.match(consolePage, /path: '\/console\/follow-ups', label: 'Follow Ups'/)
  assert.match(consolePage, /<FollowUpsPage/)
  assert.match(workspace, /followUpService\.list/)
  assert.match(service, /list_crm_follow_ups/)
})

test('ticket creation fixes context while global creation requires searchable Ticket selection', () => {
  assert.match(dialog, /step !== 'ticket'/)
  assert.match(dialog, /followUpService\.searchTickets\(search\)/)
  assert.match(dialog, /Ticket number, title, or company/)
  assert.match(dialog, /requireTicket: true/)
  assert.match(dialog, /selectedTicket\?\.id/)
})

test('recurrence control is conditional and resets frequency when deselected', () => {
  assert.match(dialog, /frequency: checked \? current\.frequency : ''/)
  assert.match(dialog, /\{form\.recurring && <label/)
  assert.match(dialog, /required/)
  assert.match(dialog, /Create the next occurrence only after this one is completed/)
})

test('global Follow Ups provide responsive accessible creation and complete states', () => {
  assert.match(workspace, /aria-label="Create follow-up"/)
  assert.match(workspace, /Loading Follow Ups/)
  assert.match(workspace, /No \{view/)
  assert.match(workspace, /Follow Up completed/)
  assert.match(styles, /\.follow-up-fab/)
  assert.match(styles, /@media \(max-width:760px\)[\s\S]*\.follow-up-board/)
  assert.match(styles, /var\(--surface\)/)
  assert.doesNotMatch(workspace + dialog, /https?:\/\//)
})

test('Follow Ups use ticket-scoped chronological cadence lanes', () => {
  assert.match(workspace, /groupFollowUps/)
  assert.match(workspace, /new Date\(left\.scheduledAt\) - new Date\(right\.scheduledAt\)/)
  assert.match(workspace, /follow-up-board-scroll/)
  assert.match(workspace, /Follow-up \{index \+ 1\}/)
  assert.match(workspace, /Horizontally scrollable follow-up sequence/)
  assert.match(styles, /\.follow-up-stage:not\(:last-child\)::before/)
  assert.match(styles, /grid-auto-flow:column/)
})
