import assert from 'node:assert/strict'
import test from 'node:test'
import { canAccessDashboard, canAccessManagementReports, DASHBOARD_ROLES } from '../src/auth/dashboardAccess.js'

const scopes = { 'dashboards.read': 'company', 'tickets.read': 'assigned' }

test('each of the four permitted business roles can use the dashboard with a granted scope', () => {
  assert.deepEqual(DASHBOARD_ROLES, ['marketing_manager', 'sales_manager', 'delivery_manager', 'leadership'])
  for (const slug of DASHBOARD_ROLES) {
    assert.equal(canAccessDashboard([{ slug }], scopes), true)
    assert.equal(canAccessDashboard([{ slug }], {}), false)
  }
})

test('admin and unknown roles cannot bypass dashboard access with a permission alone', () => {
  for (const slug of ['system_admin', 'viewer', 'unknown']) {
    assert.equal(canAccessDashboard([{ slug }], scopes), false)
  }
  assert.equal(canAccessDashboard([], scopes), false)
  assert.equal(canAccessDashboard([{ slug: 'leadership', status: 'inactive' }], scopes), false)
})

test('multi-role accounts need at least one permitted active role and a valid permission scope', () => {
  assert.equal(canAccessDashboard([{ slug: 'system_admin' }, { slug: 'sales_manager', status: 'active' }], { 'dashboards.read': 'team', 'tickets.read': 'team' }), true)
  assert.equal(canAccessDashboard([{ slug: 'leadership' }], { 'dashboards.read': 'invalid' }), false)
})

test('executives get personal dashboards without gaining management sales access', () => {
  for (const slug of ['sales_executive','marketing_executive']) {
    assert.equal(canAccessDashboard([{slug}],scopes),true)
    assert.equal(canAccessManagementReports([{slug}],scopes),false)
    assert.equal(canAccessDashboard([{slug}],{'dashboards.read':'assigned'}),false)
    assert.equal(canAccessDashboard([{slug,status:'inactive'}],scopes),false)
  }
})
