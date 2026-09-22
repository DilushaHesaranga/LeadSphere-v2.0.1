import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canAccessConsolePathForRoles,
  isSystemAdministrator,
  navigationForRoles,
} from './access.js'

const navigation = [
  { path: '/console', label: 'Overview' },
  { path: '/console/cases', label: 'Cases' },
  { path: '/console/timeline', label: 'Timeline' },
  { path: '/console/team', label: 'Team Management' },
]

test('system administrator navigation contains only Team Management', () => {
  const roles = [{ slug: 'system_admin', status: 'active' }]
  assert.equal(isSystemAdministrator(roles), true)
  assert.deepEqual(navigationForRoles(navigation, roles), [navigation[3]])
  assert.equal(canAccessConsolePathForRoles('/console/team', roles), true)
  assert.equal(canAccessConsolePathForRoles('/console', roles), true)
  assert.equal(canAccessConsolePathForRoles('/console/cases', roles), false)
  assert.equal(canAccessConsolePathForRoles('/console/timeline', roles), false)
  assert.equal(canAccessConsolePathForRoles('/console/tickets/123', roles), false)
})

test('inactive system administrator role does not restrict a current business role', () => {
  const roles = [
    { slug: 'system_admin', status: 'disabled' },
    { slug: 'sales_manager', status: 'active' },
  ]
  assert.equal(isSystemAdministrator(roles), false)
  assert.deepEqual(navigationForRoles(navigation, roles), navigation)
  assert.equal(canAccessConsolePathForRoles('/console/cases', roles), true)
})
