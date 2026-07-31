import test from 'node:test'
import assert from 'node:assert/strict'
import {
  canAccessNavigation,
  consoleDestination,
  protectedRouteDestination,
  validateInvitation,
} from '../src/utils/access.js'

test('unauthenticated users are redirected from protected routes', () => {
  assert.equal(protectedRouteDestination({ loading: false, hasSession: false }), '/login')
  assert.equal(protectedRouteDestination({ loading: true, hasSession: false }), null)
})

test('the console CTA routes guests to login and sessions to the console', () => {
  assert.equal(consoleDestination(null), '/login')
  assert.equal(consoleDestination({ access_token: 'token' }), '/console')
})

test('navigation requires the assigned permission', () => {
  const teamItem = { permission: 'team.members.read' }
  assert.equal(canAccessNavigation(teamItem, { 'console.access': 'company' }), false)
  assert.equal(canAccessNavigation(teamItem, {
    'console.access': 'company',
    'team.members.read': 'company',
  }), true)
})

test('any-permission navigation supports scoped manager access', () => {
  const customerItem = { anyPermission: ['accounts.read', 'customer_context.read'] }
  assert.equal(canAccessNavigation(customerItem, { 'pipeline.read': 'team' }), false)
  assert.equal(canAccessNavigation(customerItem, { 'accounts.read': 'assigned' }), true)
})

test('invitation validation rejects bad input and accepts assigned roles', () => {
  assert.equal(validateInvitation('bad-address', 'viewer'), 'Enter a valid email address.')
  assert.equal(validateInvitation('person@example.com', ''), 'Select a role for this member.')
  assert.equal(validateInvitation('person@example.com', 'viewer'), '')
})
