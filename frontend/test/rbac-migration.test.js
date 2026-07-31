import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const migrationUrl = new URL(
  '../../supabase/migrations/20260731000200_granular_rbac_scopes.sql',
  import.meta.url,
)
const sql = await readFile(migrationUrl, 'utf8')

function mapping(role, permission, scope) {
  return `('${role}', '${permission}', '${scope}')`
}

test('migration defines all data-access scopes and is repeatable', () => {
  assert.match(sql, /'own', 'assigned', 'team', 'company'/)
  assert.match(sql, /create table if not exists public\.teams/)
  assert.match(sql, /create table if not exists public\.team_members/)
  assert.match(sql, /on conflict \(role_id, permission_id\) do update/)
})

test('Marketing Executive is assigned-only and has no administration or revenue grant', () => {
  assert.ok(sql.includes(mapping('marketing_executive', 'leads.create', 'own')))
  assert.ok(sql.includes(mapping('marketing_executive', 'leads.read', 'assigned')))
  assert.equal(sql.includes(mapping('marketing_executive', 'team.members.invite', 'company')), false)
  assert.equal(sql.includes(mapping('marketing_executive', 'revenue.read', 'company')), false)
})

test('Sales Executive and Sales Manager receive assigned and team scopes respectively', () => {
  assert.ok(sql.includes(mapping('sales_executive', 'accounts.read', 'assigned')))
  assert.ok(sql.includes(mapping('sales_executive', 'deals.move_stage', 'assigned')))
  assert.ok(sql.includes(mapping('sales_manager', 'accounts.assign', 'team')))
  assert.ok(sql.includes(mapping('sales_manager', 'pipeline.read', 'team')))
})

test('Delivery Manager is read-only for assigned customer context', () => {
  assert.ok(sql.includes(mapping('delivery_manager', 'customer_context.read', 'assigned')))
  assert.ok(sql.includes(mapping('delivery_manager', 'deals.read', 'assigned')))
  assert.equal(sql.includes(mapping('delivery_manager', 'deals.update', 'assigned')), false)
  assert.equal(sql.includes(mapping('delivery_manager', 'activities.update', 'assigned')), false)
})

test('Leadership gets company visibility without administration permissions', () => {
  assert.ok(sql.includes(mapping('leadership', 'pipeline.read', 'company')))
  assert.ok(sql.includes(mapping('leadership', 'revenue.forecast.read', 'company')))
  assert.equal(sql.includes(mapping('leadership', 'team.members.invite', 'company')), false)
  assert.equal(sql.includes(mapping('leadership', 'roles.manage', 'company')), false)
})

test('normal assignment excludes System Admin and legacy roles', () => {
  assert.match(sql, /'system_admin',[\s\S]*false/)
  assert.match(sql, /where slug in \('marketing_manager', 'viewer'\)/)
  assert.match(sql, /slug <> 'system_admin'/)
})
