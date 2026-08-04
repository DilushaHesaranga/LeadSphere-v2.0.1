import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migration = await readFile(new URL('../../supabase/migrations/20260804000200_user_notifications.sql', import.meta.url), 'utf8')
const notificationCenter = await readFile(new URL('../src/components/NotificationCenter.jsx', import.meta.url), 'utf8')
const notificationService = await readFile(new URL('../src/services/notificationService.js', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const ticketPage = await readFile(new URL('../src/pages/TicketDetailPage.jsx', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('global Cases and Timeline navigation is visible without a permission gate', () => {
  assert.match(consolePage, /\{ path: '\/console\/cases', label: 'Cases', icon: 'file' \}/)
  assert.match(consolePage, /\{ path: '\/console\/timeline', label: 'Timeline', icon: 'timeline' \}/)
})

test('Cases is removed from Ticket tabs while Ticket Timeline remains', () => {
  assert.doesNotMatch(ticketPage, /\['cases', 'Cases'\]/)
  assert.match(ticketPage, /\['timeline', 'Timeline'\]/)
})

test('the ElDream workspace top-bar label is removed', () => {
  assert.doesNotMatch(consolePage, /ElDream workspace/)
})

test('notification records are private to their recipient', () => {
  assert.match(migration, /user_notifications_read_own[\s\S]*user_id = \(select auth\.uid\(\)\)/)
  assert.match(migration, /user_notifications_update_own[\s\S]*user_id = \(select auth\.uid\(\)\)/)
})

test('new permission requests notify the assigned manager', () => {
  assert.match(migration, /crm_notify_permission_request_created/)
  assert.match(migration, /new\.assigned_manager_id/)
  assert.match(migration, /'permission-request-created:' \|\| new\.id/)
})

test('approved, rejected, and modified requests notify the requester', () => {
  assert.match(migration, /crm_notify_permission_request_reviewed/)
  assert.match(migration, /new\.requested_by_user_id/)
  for (const status of ['APPROVED', 'REJECTED', 'MODIFIED']) assert.ok(migration.includes(`'${status}'`))
})

test('important direct Ticket events notify other involved users', () => {
  assert.match(migration, /crm_notify_ticket_activity/)
  for (const action of ['NOTE_ADDED', 'ASSIGNMENT_DIRECT', 'TRANSFER_DIRECT', 'TICKET_CLOSED', 'TICKET_DELETE_DIRECT']) assert.ok(migration.includes(`'${action}'`))
})

test('notification RPCs list and mark only the signed-in user records', () => {
  assert.match(migration, /create or replace function public\.get_user_notifications/)
  assert.match(migration, /where user_id = actor/)
  assert.match(migration, /create or replace function public\.mark_user_notifications_read/)
  assert.match(notificationService, /get_user_notifications/)
  assert.match(notificationService, /mark_user_notifications_read/)
})

test('notification bell appears immediately before the profile control', () => {
  assert.match(consolePage, /<div className="topbar-actions"><NotificationCenter\/><UserProfileMenu/)
  assert.match(notificationCenter, /aria-label=\{unreadCount/)
  assert.match(notificationCenter, /notification-count/)
})

test('notification center refreshes, supports read state, and opens linked records', () => {
  assert.match(notificationCenter, /setInterval\(\(\) => load\(\{ quiet: true \}\), 30000\)/)
  assert.match(notificationCenter, /notificationService\.markRead/)
  assert.match(notificationCenter, /notificationService\.markAllRead/)
  assert.match(notificationCenter, /navigate\(notification\.link\)/)
})

test('notification panel is responsive and empty modules use full available width', () => {
  assert.match(styles, /\.notification-panel[\s\S]*max-height/)
  assert.match(styles, /@media \(max-width:430px\)[\s\S]*\.notification-panel/)
  assert.match(styles, /\.module-empty \{ width:100%;max-width:none; \}/)
})

test('Permissions navigation shows and refreshes the pending review count', () => {
  assert.match(consolePage, /caseTicketService\.listRequests\('PENDING'\)/)
  assert.match(consolePage, /className="sidebar-count"/)
  assert.match(consolePage, /pending permission requests/)
  assert.match(consolePage, /leadsphere:permissions-changed/)
  assert.match(styles, /\.sidebar-count \{[^}]*background:var\(--danger\)/)
})
