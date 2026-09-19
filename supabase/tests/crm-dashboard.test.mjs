import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'
import { PGlite } from '@electric-sql/pglite'

// This test runs real PostgreSQL in memory. The small prerequisite fixture
// loads production role, permission, ticket-access, and report-scope functions unchanged.
const db = new PGlite()
const migration = await readFile(new URL('../migrations/20260917000100_crm_dashboard.sql', import.meta.url), 'utf8')
const roleAccessMigration = await readFile(new URL('../migrations/20260918000100_dashboard_role_access.sql', import.meta.url), 'utf8')
const authorization = await readFile(new URL('../migrations/20260731000200_granular_rbac_scopes.sql', import.meta.url), 'utf8')
const reports = await readFile(new URL('../migrations/20260827000100_reports_and_insights.sql', import.meta.url), 'utf8')
const tickets = await readFile(new URL('../migrations/20260803000100_case_ticket_management.sql', import.meta.url), 'utf8')
const id = (number) => `00000000-0000-0000-0000-${String(number).padStart(12, '0')}`
const leader = id(101)
const manager = id(102)
const employee = id(103)
const outsider = id(104)
const delivery = id(105)
const administrator = id(106)
const viewer = id(107)
const marketingExecutive = id(108)
const deliveryExecutive = id(109)
const disabledProfile = id(110)
const disabledMembership = id(111)
const mixedRoles = id(112)
const pipeline = id(201)
let from
let to

function productionFunction(source, name) {
  const start = source.indexOf(`create or replace function public.${name}(`)
  const end = source.indexOf('$$;', source.indexOf('as $$', start))
  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  return source.slice(start, end + 3)
}

async function actor(user, role = 'authenticated') {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user])
  await db.exec(`set role ${role}`)
}

async function dashboard({ start = from, end = to, department = null, owner = null } = {}) {
  const { rows } = await db.query('select public.get_crm_dashboard($1::date,$2::date,null,$3::uuid,$4::text) data', [start, end, owner, department])
  return rows[0].data
}

async function records(kind, { stage = null, department = null, page = 1, pageSize = 100 } = {}) {
  const { rows } = await db.query('select public.get_crm_dashboard_records($1::date,$2::date,null,null,$3::text,$4::text,$5::text,$6::integer,$7::integer) data', [from, to, department, kind, stage, page, pageSize])
  return rows[0].data
}

async function expectDeniedInTransaction(operation) {
  await db.exec('savepoint access_check')
  try {
    await assert.rejects(operation, /Permission denied/)
  } finally {
    await db.exec('rollback to savepoint access_check; release savepoint access_check')
  }
}

before(async () => {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create type public.data_access_scope as enum ('own','assigned','team','company');
    create table public.permissions (id uuid primary key default gen_random_uuid(), slug text unique, description text);
    create table public.roles (id uuid primary key default gen_random_uuid(), slug text unique);
    create table public.role_permissions (role_id uuid, permission_id uuid, access_scope public.data_access_scope, primary key(role_id,permission_id));
    insert into public.roles(slug) values ('marketing_manager'),('sales_manager'),('delivery_manager'),('leadership'),('system_admin'),
      ('sales_executive'),('marketing_executive'),('delivery_executive'),('viewer');
    create table auth.users (id uuid primary key);
    create table public.profiles (id uuid primary key, display_name text, email text, status text default 'active');
    create table public.user_roles (user_id uuid, role_id uuid, status text default 'active', primary key (user_id,role_id));
    create function public.crm_users_share_team(uuid,uuid) returns boolean language sql stable as $$ select false $$;
    create function public.crm_timeline_timezone() returns text language sql stable as $$ select 'Asia/Colombo'::text $$;
    create table public.crm_departments (slug text primary key, name text, is_active boolean default true);
    create table public.crm_pipelines (id uuid primary key, name text, status text default 'active', is_default boolean default false);
    create table public.crm_ticket_stages (slug text primary key, name text, pipeline_id uuid, semantic_category text,
      business_area text default 'leads', probability numeric default 50, sort_order integer default 1, is_active boolean default true);
    create table public.crm_cases (id uuid primary key, company_name text, deleted_at timestamptz);
    create table public.crm_tickets (id uuid primary key, case_id uuid, project_title text, stage text,
      current_department text, responsible_manager_id uuid, created_by_user_id uuid, status text default 'active',
      created_at timestamptz default now(), updated_at timestamptz default now(), stage_entered_at timestamptz default now(),
      closed_at timestamptz, deleted_at timestamptz);
    create table public.crm_ticket_assignments (ticket_id uuid, user_id uuid, removed_at timestamptz);
    create table public.crm_ticket_stage_history (id uuid default gen_random_uuid(), ticket_id uuid, new_stage_slug text, changed_at timestamptz);
    create table public.crm_ticket_activity (id uuid default gen_random_uuid(), ticket_id uuid, action text, actor_user_id uuid,
      details jsonb default '{}', created_at timestamptz default now());
    create table public.crm_follow_up_occurrences (id uuid primary key default gen_random_uuid(), ticket_id uuid,
      status text, scheduled_at timestamptz, completed_at timestamptz, follow_up_type text default 'EMAIL', purpose text default 'Check in');
  `)
  for (const name of ['scope_rank', 'user_permission_scope', 'current_user_permission_scope', 'current_user_has_permission']) {
    await db.exec(productionFunction(authorization, name))
  }
  await db.exec(productionFunction(tickets, 'crm_user_has_role'))
  await db.exec(productionFunction(tickets, 'crm_can_access_ticket'))
  await db.exec(productionFunction(reports, 'crm_validate_report_query'))
  await db.exec(productionFunction(reports, 'crm_report_ticket_scope'))
  await db.exec(migration)
  // An existing custom manager scope must survive the tightening of access.
  // Pre-existing grants for every other role must be removed by the upgrade.
  await db.exec(`
    update public.role_permissions rp set access_scope = 'assigned'
    from public.roles r, public.permissions p
    where rp.role_id = r.id and rp.permission_id = p.id
      and p.slug = 'dashboards.read' and r.slug in ('marketing_manager','sales_manager');
    insert into public.role_permissions (role_id,permission_id,access_scope)
    select r.id,p.id,'company' from public.roles r cross join public.permissions p
    where p.slug = 'dashboards.read' and r.slug in ('sales_executive','marketing_executive','delivery_executive','viewer');
  `)
  await db.exec(roleAccessMigration)
  const dates = await db.query("select ((now() at time zone 'Asia/Colombo')::date - 29)::text start, (now() at time zone 'Asia/Colombo')::date::text finish")
  from = dates.rows[0].start
  to = dates.rows[0].finish
  await db.exec(`
    insert into auth.users values ('${leader}'),('${manager}'),('${employee}'),('${outsider}'),
      ('${delivery}'),('${administrator}'),('${viewer}'),('${marketingExecutive}'),('${deliveryExecutive}'),
      ('${disabledProfile}'),('${disabledMembership}'),('${mixedRoles}');
    insert into public.profiles (id,display_name,email) values
      ('${leader}','Leader','leader@example.test'),('${manager}','Manager','manager@example.test'),
      ('${employee}','Employee','employee@example.test'),('${outsider}','Outsider','outsider@example.test'),
      ('${delivery}','Delivery Manager','delivery@example.test'),('${administrator}','Administrator','administrator@example.test'),
      ('${viewer}','Viewer','viewer@example.test'),('${marketingExecutive}','Marketing Executive','marketing@example.test'),
      ('${deliveryExecutive}','Delivery Executive','delivery.executive@example.test'),
      ('${disabledProfile}','Disabled Profile','disabled.profile@example.test'),
      ('${disabledMembership}','Disabled Membership','disabled.membership@example.test'),
      ('${mixedRoles}','Multiple Roles','multiple@example.test');
    insert into public.user_roles (user_id,role_id)
    select membership.user_id::uuid,r.id from (values
      ('${leader}','leadership'),('${manager}','sales_manager'),('${employee}','sales_executive'),
      ('${outsider}','marketing_manager'),('${delivery}','delivery_manager'),('${administrator}','system_admin'),
      ('${viewer}','viewer'),('${marketingExecutive}','marketing_executive'),('${deliveryExecutive}','delivery_executive'),
      ('${disabledProfile}','sales_manager'),('${disabledMembership}','leadership'),
      ('${mixedRoles}','system_admin'),('${mixedRoles}','delivery_manager')
    ) membership(user_id,role_slug) join public.roles r on r.slug = membership.role_slug;
    update public.profiles set status = 'disabled' where id = '${disabledProfile}';
    update public.user_roles set status = 'disabled' where user_id = '${disabledMembership}';
    insert into public.permissions (slug) values ('tickets.read'),('tickets.update');
    insert into public.role_permissions (role_id,permission_id,access_scope)
    select r.id,p.id,(case when r.slug in ('leadership','system_admin') then 'company' else 'assigned' end)::public.data_access_scope
    from public.roles r cross join public.permissions p
    where p.slug in ('tickets.read','tickets.update');
    insert into public.crm_departments values ('sales','Sales',true),('delivery','Delivery',true);
    insert into public.crm_pipelines values ('${pipeline}','Main','active');
    insert into public.crm_ticket_stages (slug,name,pipeline_id,semantic_category,business_area,probability,sort_order) values
      ('new','New','${pipeline}','open','leads',50,1),
      ('won','Won','${pipeline}','won','customers',100,2),
      ('lost','Lost','${pipeline}','lost','leads',0,3),
      ('empty','Empty stage','${pipeline}','open','leads',25,4);
    insert into public.crm_cases values ('${id(301)}','Example Ltd',null);
    insert into public.crm_tickets (id,case_id,project_title,stage,current_department,responsible_manager_id,created_by_user_id,
      status,created_at,stage_entered_at,closed_at,deleted_at) values
      ('${id(1)}','${id(301)}','Old pending','new','sales','${leader}','${leader}','active',now()-interval '20 days',now()-interval '20 days',null,null),
      ('${id(2)}','${id(301)}','Won LKR','won','sales','${leader}','${leader}','active',now()-interval '40 days',now()-interval '2 days',null,null),
      ('${id(3)}','${id(301)}','Closed without won','new','sales','${leader}','${leader}','closed',now()-interval '40 days',now()-interval '40 days',now()-interval '2 days',null),
      ('${id(4)}','${id(301)}','Lost','lost','sales','${leader}','${leader}','active',now()-interval '40 days',now()-interval '2 days',null,null),
      ('${id(5)}','${id(301)}','Won value missing','won','sales','${leader}','${leader}','active',now()-interval '40 days',now()-interval '2 days',null,null),
      ('${id(6)}','${id(301)}','Assigned USD','new','delivery','${manager}','${manager}','active',now()-interval '1 day',now()-interval '1 day',null,null),
      ('${id(7)}','${id(301)}','Archived','new','sales','${leader}','${leader}','archived',now()-interval '5 days',now()-interval '5 days',null,null),
      ('${id(8)}','${id(301)}','Deleted','new','sales','${leader}','${leader}','active',now()-interval '5 days',now()-interval '5 days',null,now()),
      ('${id(9)}','${id(301)}','Old USD win','won','sales','${leader}','${leader}','active',now()-interval '60 days',now()-interval '45 days',null,null);
    insert into public.crm_ticket_assignments values ('${id(6)}','${manager}',null),('${id(6)}','${employee}',null);
    insert into public.crm_ticket_stage_history (ticket_id,new_stage_slug,changed_at)
      select id,stage,stage_entered_at from public.crm_tickets;
    insert into public.crm_ticket_sales (ticket_id,deal_value,currency,updated_by_user_id) values
      ('${id(1)}',null,'LKR','${leader}'),('${id(2)}',100,'LKR','${leader}'),
      ('${id(3)}',300,'LKR','${leader}'),('${id(6)}',200,'USD','${manager}'),('${id(9)}',500,'USD','${leader}');
    insert into public.crm_follow_up_occurrences (ticket_id,status,scheduled_at,completed_at) values
      ('${id(1)}','PENDING',now()-interval '3 days',null),('${id(1)}','PENDING',now()-interval '2 days',null),
      ('${id(1)}','PENDING',now()+interval '3 days',null),('${id(3)}','PENDING',now()-interval '3 days',null),
      ('${id(6)}','COMPLETED',now()-interval '40 days',now()-interval '2 days'),
      ('${id(6)}','COMPLETED',now()-interval '2 days',now()-interval '40 days');
  `)
})

after(async () => db.close())

test('dashboard distinguishes snapshot workload, actual closes, selected-period wins, and sales currencies', async () => {
  await actor(leader)
  const data = await dashboard()
  assert.deepEqual(data.metrics, {
    totalTickets: 7, pendingTickets: 2, newTickets: 2, closedTickets: 1, wonTickets: 2, lostTickets: 1,
    currentWonTickets: 3, currentLostTickets: 1, winRate: 66.7,
    overdueFollowUps: 2, dueTodayFollowUps: 0, upcomingFollowUps: 1, completedFollowUps: 1,
    staleTickets: 1, unassignedTickets: 1,
  })
  assert.equal(data.pipeline.reduce((total, stage) => total + stage.count, 0), data.metrics.totalTickets)
  assert.equal(data.pipeline.find((stage) => stage.category === 'won').count, 3)
  assert.equal(data.pipeline.find((stage) => stage.category === 'lost').count, 1)
  assert.equal(data.pipeline.find((stage) => stage.stage === 'empty').count, 0)
  assert.equal(data.sales.find((sale) => sale.currency === 'LKR').wonValue, 100)
  assert.equal(data.sales.find((sale) => sale.currency === 'USD').wonValue, null)
  assert.equal(data.sales.find((sale) => sale.currency === 'USD').pipelineValue, 200)
  assert.equal(data.sales.find((sale) => sale.currency === 'USD').weightedPipelineValue, 100)
  assert.deepEqual(data.salesCoverage, { wonTickets: 2, wonWithValue: 1, wonMissingValue: 1, pipelineTickets: 2, pipelineWithValue: 1, pipelineMissingValue: 1 })
  assert.equal(data.salesTrend.filter((point) => point.currency === 'LKR').reduce((total, point) => total + (point.wonValue ?? 0), 0), 100)
  assert.equal(data.followUps.length, 3)
  assert.ok(data.followUps.every((followUp) => followUp.ticketId === id(1)))
  assert.equal(data.team.reduce((sum, team) => sum + team.total, 0), 7, 'multiple assignees must not duplicate team totals')
})

test('dashboard drill-down totals match cards, overdue lists distinct tickets, and pagination is stable', async () => {
  await actor(leader)
  for (const [kind, expected] of [['total',7],['new',2],['pending',2],['closed',1],['won',2],['lost',1],['overdue',1],['stale',1],['unassigned',1]]) {
    const result = await records(kind)
    assert.equal(result.total, expected, kind)
    assert.equal(result.records.length, expected, kind)
  }
  const data = await dashboard()
  for (const stage of data.pipeline) {
    assert.equal((await records('stage', { stage: stage.stage })).total, stage.count, `stage ${stage.stage}`)
  }
  assert.equal((await records('stage', { stage: 'new' })).total, 3)
  assert.equal((await records('all', { department: 'delivery' })).total, 1)
  const first = await records('total', { page: 1, pageSize: 3 })
  const second = await records('total', { page: 2, pageSize: 3 })
  assert.equal(first.total, 7)
  assert.equal(new Set([...first.records, ...second.records].map((record) => record.id)).size, 6)
})

test('current workload stays fixed when selecting a historical period and filter scopes stay aligned', async () => {
  await actor(leader)
  const past = new Date(`${from}T00:00:00Z`)
  past.setUTCDate(past.getUTCDate() - 40)
  const historical = await dashboard({ start: past.toISOString().slice(0, 10), end: from })
  assert.equal(historical.metrics.pendingTickets, 2)
  assert.equal(historical.metrics.totalTickets, 7)
  assert.equal(historical.metrics.wonTickets, 1)
  const filtered = await dashboard({ department: 'delivery', owner: manager })
  assert.equal(filtered.metrics.totalTickets, 1)
  assert.equal(filtered.sales.find((row) => row.currency === 'USD').pipelineValue, 200)
})

test('authorized dashboard scope, anonymous denial, raw RLS, and no direct writes are enforced in PostgreSQL', async () => {
  await actor(manager)
  assert.equal((await dashboard()).metrics.totalTickets, 1)
  assert.equal((await records('total')).total, 1)
  const ownRows = await db.query('select ticket_id from public.crm_ticket_sales')
  assert.deepEqual(ownRows.rows.map((row) => row.ticket_id), [id(6)])
  await assert.rejects(db.query('update public.crm_ticket_sales set deal_value = 999'), /permission denied/)
  await assert.rejects(db.query('select public.crm_dashboard_ticket_scope(now(),null,null,null)'), /permission denied/)
  await assert.rejects(db.query('select public.get_crm_ticket_sales($1::uuid)', [id(2)]), /access denied/)
  await assert.rejects(db.query('select public.update_crm_ticket_sales($1::uuid,100,\'LKR\')', [id(2)]), /access denied/)
  await actor(outsider)
  assert.equal((await dashboard()).metrics.totalTickets, 0)
  await actor(employee)
  await assert.rejects(dashboard(), /Permission denied/)
  await actor('', 'anon')
  await assert.rejects(dashboard(), /permission denied/)
})

test('all manager roles receive scoped dashboard access independently of reports and filter owners stay scoped', async () => {
  await db.exec('reset role')
  const grants = await db.query(`select r.slug, rp.access_scope from public.role_permissions rp
    join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
    where p.slug = 'dashboards.read' order by r.slug`)
  assert.deepEqual(Object.fromEntries(grants.rows.map((row) => [row.slug, row.access_scope])), {
    delivery_manager: 'assigned', leadership: 'company', marketing_manager: 'assigned', sales_manager: 'assigned',
  })
  await actor(manager)
  const result = await db.query('select public.get_crm_dashboard_filter_options() data')
  assert.deepEqual(result.rows[0].data.owners.map((row) => row.id).sort(), [manager, employee].sort())
  assert.equal((await dashboard()).metrics.totalTickets, 1)
  await actor(employee)
  await assert.rejects(db.query('select public.get_crm_dashboard_filter_options()'), /Permission denied/)
})

test('only active users with one of the four allowed roles can use every dashboard RPC', async () => {
  for (const user of [leader, manager, outsider, delivery, mixedRoles]) {
    await actor(user)
    const summary = await dashboard()
    assert.ok(summary.metrics)
    assert.equal((await records('total')).total, summary.metrics.totalTickets)
    const filters = await db.query('select public.get_crm_dashboard_filter_options() data')
    assert.ok(Array.isArray(filters.rows[0].data.owners))
  }
  for (const user of [employee, administrator, viewer, marketingExecutive, deliveryExecutive, disabledProfile, disabledMembership, '']) {
    await actor(user)
    await assert.rejects(dashboard(), /Permission denied/)
    await assert.rejects(records('total'), /Permission denied/)
    await assert.rejects(db.query('select public.get_crm_dashboard_filter_options()'), /Permission denied/)
    await assert.rejects(db.query('select public.crm_can_view_dashboard()'), /permission denied/)
  }
  await actor('', 'anon')
  await assert.rejects(records('total'), /permission denied/)
  await assert.rejects(db.query('select public.get_crm_dashboard_filter_options()'), /permission denied/)
})

test('dashboard permission is required in addition to an allowed role', async () => {
  await db.exec('reset role; begin')
  try {
    await db.exec(`delete from public.role_permissions rp using public.roles r, public.permissions p
      where rp.role_id = r.id and rp.permission_id = p.id and r.slug = 'sales_manager' and p.slug = 'dashboards.read'`)
    await actor(manager)
    await expectDeniedInTransaction(() => dashboard())
    await expectDeniedInTransaction(() => records('total'))
    await expectDeniedInTransaction(() => db.query('select public.get_crm_dashboard_filter_options()'))
  } finally {
    await db.exec('rollback; reset role')
  }
})

test('later permission grants and a universal admin permission helper cannot bypass the allowed-role gate', async () => {
  await db.exec('reset role; begin')
  try {
    // Exercise the role guard even if another workflow later grants dashboard
    // permission to executives, viewers, or administrators.
    await db.exec(`insert into public.role_permissions (role_id,permission_id,access_scope)
      select r.id,p.id,'company' from public.roles r cross join public.permissions p
      where p.slug = 'dashboards.read' and r.slug in ('sales_executive','marketing_executive','delivery_executive','viewer','system_admin')`)
    for (const user of [employee, administrator, viewer, marketingExecutive, deliveryExecutive]) {
      await actor(user)
      const allowedPermission = await db.query("select public.current_user_has_permission('dashboards.read') allowed")
      assert.equal(allowedPermission.rows[0].allowed, true)
      await expectDeniedInTransaction(() => dashboard())
      await expectDeniedInTransaction(() => records('total'))
      await expectDeniedInTransaction(() => db.query('select public.get_crm_dashboard_filter_options()'))
    }
    await db.exec('reset role')
    await db.exec(`create or replace function public.current_user_has_permission(p_permission text)
      returns boolean language sql stable security definer set search_path = '' as $$
        select public.crm_user_has_role(auth.uid(),array['system_admin'])
          or public.current_user_permission_scope(p_permission) is not null;
      $$;
      delete from public.role_permissions rp using public.roles r, public.permissions p
      where rp.role_id = r.id and rp.permission_id = p.id and r.slug = 'system_admin' and p.slug = 'dashboards.read';`)
    await actor(administrator)
    assert.equal((await db.query("select public.current_user_has_permission('dashboards.read') allowed")).rows[0].allowed, true)
    await expectDeniedInTransaction(() => dashboard())
    await expectDeniedInTransaction(() => records('total'))
    await expectDeniedInTransaction(() => db.query('select public.get_crm_dashboard_filter_options()'))
    // A second allowed role works only while that membership remains active.
    await actor(mixedRoles)
    assert.ok((await dashboard()).metrics)
    await db.exec('reset role')
    await db.query(`update public.user_roles set status = 'disabled'
      where user_id = $1::uuid and role_id = (select id from public.roles where slug = 'delivery_manager')`, [mixedRoles])
    await actor(mixedRoles)
    await expectDeniedInTransaction(() => dashboard())
    await expectDeniedInTransaction(() => records('total'))
    await expectDeniedInTransaction(() => db.query('select public.get_crm_dashboard_filter_options()'))
  } finally {
    await db.exec('rollback; reset role')
  }
})

test('finance defaults unknown amounts, updates closed tickets, validates money, and audits changes', async () => {
  await actor(leader)
  const absent = await db.query('select public.get_crm_ticket_sales($1::uuid) data', [id(5)])
  assert.equal(absent.rows[0].data.dealValue, null)
  assert.equal(absent.rows[0].data.currency, 'LKR')
  for (const amount of [-1, 0.001, 1000000000000, 'NaN', 'Infinity']) {
    await assert.rejects(db.query('select public.update_crm_ticket_sales($1::uuid,$2::numeric,\'LKR\')', [id(3), amount]), /Deal value must/)
  }
  await assert.rejects(db.query('select public.update_crm_ticket_sales($1::uuid,100,\'XYZ\')', [id(3)]), /supported currency/)
  await assert.rejects(db.query('select public.update_crm_ticket_sales($1::uuid,100,\'LKR\')', [id(7)]), /access denied/)
  const updated = await db.query('select public.update_crm_ticket_sales($1::uuid,250.25,\'usd\') data', [id(3)])
  assert.equal(updated.rows[0].data.dealValue, 250.25)
  assert.equal(updated.rows[0].data.currency, 'USD')
  await db.exec('reset role')
  const audit = await db.query("select details from public.crm_ticket_activity where ticket_id=$1::uuid and action='TICKET_SALES_UPDATED'", [id(3)])
  assert.equal(audit.rows.length, 1)
  assert.equal(audit.rows[0].details.previousDealValue, 300)
  assert.equal(audit.rows[0].details.dealValue, 250.25)
})

test('invalid date ranges, departments, views, and missing stage filters are rejected', async () => {
  await actor(leader)
  await assert.rejects(dashboard({ start: to, end: from }), /valid report date range/)
  await assert.rejects(dashboard({ department: 'does_not_exist' }), /valid department/)
  await assert.rejects(records('not_a_view'), /valid dashboard view/)
  await assert.rejects(records('stage'), /valid stage/)
  await assert.rejects(records('stage', { stage: 'not_a_stage' }), /valid stage/)
})

test('recorded zero is valid and differs from unknown; incomplete currency months stay null', async () => {
  await db.exec('reset role; begin')
  try {
    await actor(leader)
    await db.query('select public.update_crm_ticket_sales($1::uuid,0,\'LKR\')', [id(5)])
    let data = await dashboard()
    assert.equal(data.salesCoverage.wonWithValue, 2)
    assert.equal(data.salesCoverage.wonMissingValue, 0)
    assert.equal(data.sales.find((row) => row.currency === 'LKR').wonValue, 100)
    await db.query('select public.update_crm_ticket_sales($1::uuid,null,\'LKR\')', [id(2)])
    await db.query('select public.update_crm_ticket_sales($1::uuid,null,\'LKR\')', [id(5)])
    data = await dashboard()
    assert.equal(data.sales.find((row) => row.currency === 'LKR').wonValue, null)
    assert.equal(data.salesCoverage.wonMissingValue, 2)
    assert.equal(data.salesTrend.find((row) => row.currency === 'LKR' && row.wonCount === 2).wonValue, null)
  } finally {
    await db.exec('rollback; reset role')
  }
})

test('selected event periods include Colombo midnight boundaries without admitting the previous day', async () => {
  await db.exec('reset role; begin')
  try {
    const dates = await db.query("select ((now() at time zone 'Asia/Colombo')::date - 5)::text finish")
    const end = dates.rows[0].finish
    await db.query("update public.crm_ticket_stage_history set changed_at = $1::date::timestamp at time zone 'Asia/Colombo' where ticket_id = $2::uuid", [from, id(2)])
    await db.query("update public.crm_ticket_stage_history set changed_at = ($1::date::timestamp at time zone 'Asia/Colombo') - interval '1 second' where ticket_id = $2::uuid", [from, id(5)])
    await db.query("update public.crm_ticket_stage_history set changed_at = (($1::date + 1)::timestamp at time zone 'Asia/Colombo') - interval '1 second' where ticket_id = $2::uuid", [end, id(9)])
    await actor(leader)
    const data = await dashboard({ start: from, end })
    assert.equal(data.metrics.wonTickets, 2)
    assert.equal(data.sales.find((row) => row.currency === 'LKR').wonValue, 100)
    assert.equal(data.sales.find((row) => row.currency === 'USD').wonValue, 500)
    assert.equal(data.salesCoverage.wonMissingValue, 0)
  } finally {
    await db.exec('rollback; reset role')
  }
})

test('pipeline distribution keeps occupied inactive stages and pipelines with matching scoped drill-downs', async () => {
  await db.exec('reset role; begin')
  try {
    await db.query("insert into public.crm_pipelines values ($1::uuid,'Old pipeline','inactive')", [id(202)])
    await db.query("insert into public.crm_ticket_stages (slug,name,pipeline_id,semantic_category,is_active) values ('old_stage','Old stage',$1::uuid,'open',false)", [id(202)])
    await db.query("update public.crm_tickets set stage='old_stage', stage_entered_at=now()-interval '1 hour' where id=$1::uuid", [id(6)])
    await db.query("insert into public.crm_ticket_stage_history (ticket_id,new_stage_slug,changed_at) values ($1::uuid,'old_stage',now()-interval '1 hour')", [id(6)])
    await actor(leader)
    const data = await dashboard()
    assert.equal(data.pipeline.reduce((sum, stage) => sum + stage.count, 0), data.metrics.totalTickets)
    const oldStage = data.pipeline.find((stage) => stage.stage === 'old_stage')
    assert.equal(oldStage.count, 1)
    assert.equal(oldStage.pipelineName, 'Old pipeline')
    const rows = await records('stage', { stage: 'old_stage' })
    assert.equal(rows.total, oldStage.count)
    assert.equal(rows.records[0].id, id(6))
    await actor(outsider)
    assert.equal((await records('stage', { stage: 'old_stage' })).total, 0)
    assert.equal((await dashboard()).pipeline.some((stage) => stage.stage === 'old_stage'), false)
  } finally {
    await db.exec('rollback; reset role')
  }
})

test('deployment verification checks every fixture account without writing data', async () => {
  await db.exec('reset role')
  const verification = await readFile(new URL('./dashboard-role-access.sql', import.meta.url), 'utf8')
  await db.exec(verification)
})
