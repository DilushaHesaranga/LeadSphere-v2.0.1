import test from 'node:test'
import assert from 'node:assert/strict'
import {
  can,
  getScope,
  hasRole,
  normalizeAuthorization,
} from '../src/auth/authorization.js'

test('can enforces the own-assigned-team-company hierarchy', () => {
  const scopes = { 'deals.read': 'team' }
  assert.equal(can(scopes, 'deals.read', 'own'), true)
  assert.equal(can(scopes, 'deals.read', 'assigned'), true)
  assert.equal(can(scopes, 'deals.read', 'team'), true)
  assert.equal(can(scopes, 'deals.read', 'company'), false)
})

test('role and scope helpers use normalized trusted authorization', () => {
  const access = normalizeAuthorization({
    profile: { id: 'user-1' },
    roles: [{ slug: 'sales_manager', name: 'Sales Manager' }],
    teams: [{ id: 'team-1' }],
    permissions: { 'pipeline.read': 'team' },
  })
  assert.equal(hasRole(access.roles, 'sales_manager'), true)
  assert.equal(hasRole(access.roles, 'leadership'), false)
  assert.equal(getScope(access.permissionScopes, 'pipeline.read'), 'team')
})

test('missing permissions remain denied', () => {
  assert.equal(can({}, 'team.members.invite'), false)
  assert.equal(getScope({}, 'revenue.read'), null)
})
