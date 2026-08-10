import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { calculateAcceptanceRate, calculateWinRate, formatRate, rankCaseEmployees } from '../src/config/cases.js'

const migration = await readFile(new URL('../../supabase/migrations/20260810000100_case_management_360.sql', import.meta.url), 'utf8')
const casesPage = await readFile(new URL('../src/pages/CasesPage.jsx', import.meta.url), 'utf8')
const caseDetail = await readFile(new URL('../src/pages/CaseDetailPage.jsx', import.meta.url), 'utf8')
const consolePage = await readFile(new URL('../src/pages/ConsolePage.jsx', import.meta.url), 'utf8')
const service = await readFile(new URL('../src/services/caseTicketService.js', import.meta.url), 'utf8')
const styles = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')

test('acceptance rate includes only accepted and rejected decisions', () => {
  assert.equal(calculateAcceptanceRate(8, 2), 80)
  assert.equal(calculateAcceptanceRate(0, 0), null)
  assert.equal(formatRate(null), 'N/A')
  assert.match(migration, /request_type = 'POST_TICKET' and request\.status <> 'PENDING'/)
})

test('win rate excludes open and pending Tickets', () => {
  assert.equal(calculateWinRate(15, 5), 75)
  assert.equal(calculateWinRate(0, 0), null)
  assert.match(migration, /stage = 'close_won'/)
  assert.match(migration, /stage = 'lost'/)
})

test('employee ranking uses outcome rate, volume, and a minimum sample', () => {
  const ranked = rankCaseEmployees([
    { name: 'Small sample', ticketsHandled: 1, won: 1, lost: 0, accepted: 1, rejected: 0 },
    { name: 'Proven', ticketsHandled: 8, won: 6, lost: 2, accepted: 6, rejected: 2 },
  ])
  assert.equal(ranked[0].name, 'Proven')
  assert.equal(ranked.find((item) => item.name === 'Small sample').qualified, false)
  assert.match(migration, /won\+lost>=3/)
})

test('Cases use the existing company entity and mandatory Ticket foreign key', () => {
  assert.match(migration, /alter table public\.crm_cases/)
  assert.doesNotMatch(migration, /create table[^\n]*companies/i)
  assert.match(migration, /crm_ticket_contacts_sync_case/)
})

test('Case contacts enforce one active primary contact at database level', () => {
  assert.match(migration, /crm_case_contacts_one_primary/)
  assert.match(migration, /where is_primary and status = 'active'/)
  assert.match(migration, /update public\.crm_case_contacts set is_primary=false/)
})

test('Case writes use permission-guarded RPCs and field whitelisting', () => {
  assert.match(migration, /crm_can_access_case\(p_case_id,'cases\.update'\)/)
  assert.match(migration, /Unsupported Case field/)
  assert.match(migration, /crm_can_access_case\(p_case_id,'cases\.contacts\.manage'\)/)
  assert.match(migration, /crm_can_access_case\(p_case_id,'cases\.notes\.create'\)/)
  assert.match(migration, /revoke insert, update, delete on public\.crm_case_contacts, public\.crm_case_notes from authenticated/)
})

test('Case listing is searchable, filterable, sortable, and server paginated', () => {
  assert.match(migration, /create or replace function public\.list_crm_case_management/)
  assert.match(migration, /limit safe_size offset \(safe_page-1\)\*safe_size/)
  assert.match(casesPage, /setTimeout\(\(\) => \{ setSearch\(query\.trim\(\)\); setPage\(1\) \}, 300\)/)
  assert.match(casesPage, /applySort/)
  assert.match(casesPage, /openTickets/)
  assert.match(service, /listCaseManagement/)
})

test('Cases navigation opens the implemented page instead of a placeholder', () => {
  assert.match(consolePage, /pathname === '\/console\/cases'\) content = <CasesPage/)
  assert.doesNotMatch(consolePage, /Cases functionality will be available/)
})

test('Case profile exposes the complete 360-degree tab structure', () => {
  for (const tab of ['Overview','Tickets','Timeline','Contacts','Performance','Employees','Communications','Follow-Ups','Notes','Documents','Details']) assert.ok(caseDetail.includes(tab))
  assert.match(caseDetail, /navigate\(`\/console\/tickets\/\$\{t\.id\}`\)/)
  assert.match(caseDetail, /Follow Ups remain linked to a Ticket/)
})

test('Case UI has dark-mode-compatible token styling and responsive layouts', () => {
  assert.match(styles, /\/\* Case 360 \*\//)
  assert.match(styles, /var\(--surface\)/)
  assert.match(styles, /@media\(max-width:850px\)/)
  assert.match(styles, /@media\(max-width:560px\)/)
})

test('Case activity, contacts, notes, communications, and Follow Ups load independently', () => {
  for (const operation of ['getCaseTimeline','listCaseContacts','listCaseEmployees','listCaseCommunications','listCaseFollowUps','listCaseNotes']) assert.ok(service.includes(operation))
  assert.match(migration, /union all select f\.id,f\.created_at,'FOLLOW_UP'/)
  assert.match(migration, /union all select c\.id,c\.occurred_at,c\.category/)
})

test('archival remains approval-based and restoration preserves duplicate safety', () => {
  assert.match(caseDetail, /requestCaseDeletion/)
  assert.match(migration, /create or replace function public\.restore_crm_case/)
  assert.match(migration, /An active Case already uses this company name/)
  assert.doesNotMatch(caseDetail, /delete from public\.crm_cases/)
})
