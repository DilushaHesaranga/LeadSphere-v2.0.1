import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { ROLES } from '../src/auth/permissions.js'
import {
  canCreateTicketFollowUp,
  FOLLOW_UP_CREATOR_ROLES,
  hasFollowUpCreatorRole,
  isUserAssociatedWithTicket,
} from '../src/config/followUps.js'

const migration = await readFile(
  new URL('../../supabase/migrations/20260905000100_follow_up_creation_authorization.sql', import.meta.url),
  'utf8',
)
const service = await readFile(new URL('../src/services/followUpService.js', import.meta.url), 'utf8')
const workspace = await readFile(new URL('../src/components/FollowUpWorkspace.jsx', import.meta.url), 'utf8')
const casePage = await readFile(new URL('../src/pages/CaseDetailPage.jsx', import.meta.url), 'utf8')

function ticket({ managerId = 'manager', assigneeIds = [] } = {}) {
  return {
    id: 'ticket-1',
    status: 'active',
    responsibleManagerId: managerId,
    assignedUsers: assigneeIds.map((id) => ({ id, name: id })),
  }
}

function roles(slug) {
  return [{ slug, name: slug }]
}

test('associated Sales Executive can create a Follow Up', () => {
  assert.equal(canCreateTicketFollowUp({
    ticket: ticket({ assigneeIds: ['sales-user'] }),
    userId: 'sales-user',
    roles: roles(ROLES.SALES_EXECUTIVE),
  }), true)
})

test('associated Marketing Executive can create a Follow Up', () => {
  assert.equal(canCreateTicketFollowUp({
    ticket: ticket({ assigneeIds: ['marketing-user'] }),
    userId: 'marketing-user',
    roles: roles(ROLES.MARKETING_EXECUTIVE),
  }), true)
})

test('associated Sales Manager can create a Follow Up as responsible manager', () => {
  assert.equal(canCreateTicketFollowUp({
    ticket: ticket({ managerId: 'sales-manager' }),
    userId: 'sales-manager',
    roles: roles(ROLES.SALES_MANAGER),
  }), true)
})

test('associated Delivery Manager can create a Follow Up as responsible manager', () => {
  assert.equal(canCreateTicketFollowUp({
    ticket: ticket({ managerId: 'delivery-manager' }),
    userId: 'delivery-manager',
    roles: roles(ROLES.DELIVERY_MANAGER),
  }), true)
})

test('an allowed role without a Ticket association is denied', () => {
  assert.equal(canCreateTicketFollowUp({
    ticket: ticket({ managerId: 'another-manager', assigneeIds: ['another-user'] }),
    userId: 'sales-user',
    roles: roles(ROLES.SALES_EXECUTIVE),
  }), false)
})

test('an associated user with a disallowed role is denied', () => {
  assert.equal(canCreateTicketFollowUp({
    ticket: ticket({ assigneeIds: ['leader'] }),
    userId: 'leader',
    roles: roles(ROLES.LEADERSHIP),
  }), false)
  assert.equal(hasFollowUpCreatorRole(roles(ROLES.SYSTEM_ADMIN)), false)
})

test('the frontend uses canonical roles and both supported association relationships', () => {
  assert.deepEqual(FOLLOW_UP_CREATOR_ROLES, [
    ROLES.SALES_EXECUTIVE,
    ROLES.MARKETING_EXECUTIVE,
    ROLES.SALES_MANAGER,
    ROLES.DELIVERY_MANAGER,
  ])
  assert.equal(isUserAssociatedWithTicket(ticket({ managerId: 'manager' }), 'manager'), true)
  assert.equal(isUserAssociatedWithTicket(ticket({ assigneeIds: ['employee'] }), 'employee'), true)
  assert.equal(isUserAssociatedWithTicket(ticket(), null), false)
})

test('backend creation validates authentication, existence, association, and role in order', () => {
  const body = migration.match(/create or replace function public\.create_crm_follow_up[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  const authentication = body.indexOf("raise exception 'Authentication required'")
  const ticketLookup = body.indexOf('select * into ticket_record')
  const notFound = body.indexOf("raise exception 'Ticket not found'")
  const association = body.indexOf("raise exception 'You are not assigned to this ticket.'")
  const allowedRole = body.indexOf("raise exception 'Your role does not support this action.'")
  const insert = body.indexOf('insert into public.crm_follow_up_occurrences')

  assert.ok(authentication >= 0)
  assert.ok(authentication < ticketLookup)
  assert.ok(ticketLookup < notFound)
  assert.ok(notFound < association)
  assert.ok(association < allowedRole)
  assert.ok(allowedRole < insert)
})

test('backend association uses only the responsible manager or an active assignment', () => {
  const body = migration.match(/create or replace function public\.create_crm_follow_up[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(body, /actor <> ticket_record\.responsible_manager_id/)
  assert.match(body, /from public\.crm_ticket_assignments assignment/)
  assert.match(body, /assignment\.user_id = actor/)
  assert.match(body, /assignment\.removed_at is null/)
  assert.doesNotMatch(body, /ticket_record\.created_by_user_id/)
})

test('backend permits exactly the four requested roles and preserves authorized persistence', () => {
  const body = migration.match(/create or replace function public\.create_crm_follow_up[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  for (const role of FOLLOW_UP_CREATOR_ROLES) assert.ok(body.includes(`'${role}'`))
  for (const role of [ROLES.SYSTEM_ADMIN, ROLES.LEADERSHIP, ROLES.MARKETING_MANAGER]) {
    assert.equal(body.includes(`'${role}'`), false)
  }
  assert.match(body, /insert into public\.crm_follow_up_occurrences/)
  assert.match(body, /insert into public\.crm_ticket_activity/)
  assert.match(body, /'FOLLOW_UP_CREATED'/)
  assert.match(body, /pg_advisory_xact_lock/)
})

test('unauthenticated and nonexistent Ticket requests retain established backend errors', () => {
  assert.match(migration, /if actor is null then\s+raise exception 'Authentication required'/)
  assert.match(migration, /if ticket_record\.id is null then\s+raise exception 'Ticket not found'/)
  assert.match(migration, /revoke all on function public\.create_crm_follow_up[\s\S]*?from public, anon/)
})

test('Ticket search and creation controls apply the same role and association policy', () => {
  const search = migration.match(/create or replace function public\.search_crm_follow_up_tickets[\s\S]*?end;\n\$\$;/)?.[0] ?? ''
  assert.match(search, /public\.crm_user_has_role\(actor/)
  assert.match(search, /ticket\.responsible_manager_id = actor/)
  assert.match(search, /assignment\.removed_at is null/)
  assert.match(workspace, /canCreateTicketFollowUp/)
  assert.match(workspace, /hasFollowUpCreatorRole/)
  assert.match(casePage, /followUpTickets=.*canCreateTicketFollowUp/)
})

test('frontend preserves the two explicit backend authorization messages', () => {
  assert.match(service, /You are not assigned to this ticket\./)
  assert.match(service, /Your role does not support this action\./)
})
