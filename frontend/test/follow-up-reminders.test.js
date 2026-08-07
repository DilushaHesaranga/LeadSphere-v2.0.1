import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migration = await readFile(new URL('../../supabase/migrations/20260807000100_follow_up_reminder_notifications.sql', import.meta.url), 'utf8')
const notificationCenter = await readFile(new URL('../src/components/NotificationCenter.jsx', import.meta.url), 'utf8')

function futureCheckpoints(scheduledAt, currentTime) {
  const scheduled = new Date(scheduledAt).getTime()
  const now = new Date(currentTime).getTime()
  return [30, 15, 5, 0]
    .map((offset) => ({ offset, at: scheduled - offset * 60_000 }))
    .filter((checkpoint) => checkpoint.at >= now)
}

test('checkpoint calculation includes all four reminders exactly 30 minutes ahead', () => {
  assert.deepEqual(futureCheckpoints('2026-08-07T09:30:00Z', '2026-08-07T09:00:00Z').map(({ offset }) => offset), [30, 15, 5, 0])
})

test('expired checkpoints are skipped without flooding near-future Follow Ups', () => {
  assert.deepEqual(futureCheckpoints('2026-08-07T09:30:00Z', '2026-08-07T09:20:00Z').map(({ offset }) => offset), [5, 0])
  assert.deepEqual(futureCheckpoints('2026-08-07T09:30:00Z', '2026-08-07T09:28:00Z').map(({ offset }) => offset), [0])
  assert.deepEqual(futureCheckpoints('2026-08-07T09:30:00Z', '2026-08-07T09:31:00Z'), [])
})

test('queue identity and notification identity make processing idempotent', () => {
  assert.match(migration, /unique \(occurrence_id, schedule_revision, reminder_offset_minutes\)/)
  assert.match(migration, /on conflict \(occurrence_id, schedule_revision, reminder_offset_minutes\) do nothing/)
  assert.match(migration, /'follow-up-reminder:' \|\| occurrence\.id::text \|\| ':' \|\| reminder\.schedule_revision::text/)
  assert.match(migration, /on conflict \(user_id, event_key\) do nothing/)
})

test('overlapping workers atomically claim due reminders', () => {
  assert.match(migration, /for update skip locked/)
  assert.match(migration, /set status = 'PROCESSING', attempt_count = queued\.attempt_count \+ 1/)
  assert.match(migration, /where queued\.id = candidates\.id\s+returning queued\.\*/)
})

test('recipients are current active assignees only and are resolved during dispatch', () => {
  const processor = migration.match(/create or replace function public\.process_crm_follow_up_reminders[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(processor, /from public\.crm_ticket_assignments assignment/)
  assert.match(processor, /assignment\.removed_at is null/)
  assert.match(processor, /profile\.status = 'active'/)
  assert.match(processor, /select distinct assignment\.user_id/)
  assert.doesNotMatch(processor, /responsible_manager_id|created_by_user_id/)
})

test('editing invalidates the old revision and schedules only future checkpoints', () => {
  assert.match(migration, /new\.reminder_revision := old\.reminder_revision \+ 1/)
  assert.match(migration, /schedule_revision <> new\.reminder_revision/)
  assert.match(migration, /scheduled_at - make_interval\(mins => checkpoint\.offset_minutes\) >= now\(\)/)
})

test('completion, cancellation, deletion, closing, and archiving cancel future reminders', () => {
  assert.match(migration, /after insert or update of scheduled_at, status/)
  assert.match(migration, /if new\.status <> 'PENDING'/)
  assert.match(migration, /after update of status, deleted_at on public\.crm_tickets/)
  assert.match(migration, /new\.status <> 'active' or new\.deleted_at is not null/)
})

test('recurring occurrences receive a bounded new set of checkpoints', () => {
  assert.match(migration, /after insert or update of scheduled_at, status on public\.crm_follow_up_occurrences/)
  assert.match(migration, /from unnest\(array\[30, 15, 5, 0\]\)/)
  assert.doesNotMatch(migration, /generate_series/)
})

test('content matches the four required professional messages', () => {
  for (const title of ['Follow Up in 30 Minutes', 'Follow Up in 15 Minutes', 'Follow Up in 5 Minutes', 'Follow Up Due Now']) assert.ok(migration.includes(title))
  assert.match(migration, /A follow up for ticket #' \|\| p_ticket_number \|\| ' is scheduled in 30 minutes\.'/)
  assert.match(migration, /The scheduled follow up for ticket #' \|\| p_ticket_number \|\| ' is due now\.'/)
})

test('temporary failures retry with a bounded backoff and do not stop the batch', () => {
  assert.match(migration, /exception when others then/)
  assert.match(migration, /attempt_count < 5/)
  assert.match(migration, /power\(2, reminder\.attempt_count - 1\)/)
  assert.match(migration, /last_error = left\(sqlerrm, 1000\)/)
})

test('the database scheduler runs independently and the notification UI refreshes automatically', () => {
  assert.match(migration, /create extension if not exists pg_cron/)
  assert.match(migration, /'leadsphere-follow-up-reminders'/)
  assert.match(migration, /'\* \* \* \* \*'/)
  assert.match(notificationCenter, /window\.setInterval/)
  assert.match(notificationCenter, /visibilitychange/)
  assert.match(notificationCenter, /navigate\(notification\.link\)/)
})

test('scheduler internals remain unavailable to browser roles', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on table public\.crm_follow_up_reminders from public, anon, authenticated/)
  assert.match(migration, /revoke all on function public\.process_crm_follow_up_reminders\(integer, timestamptz\) from public, anon, authenticated/)
})
