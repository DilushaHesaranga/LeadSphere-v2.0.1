import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

test('system administrator is team-only and delivery manager receives assigned stage movement', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      create type public.data_access_scope as enum ('own','assigned','team','company');
      create table public.roles(id text primary key, slug text unique not null);
      create table public.permissions(id text primary key, slug text unique not null);
      create table public.role_permissions(
        role_id text references public.roles(id),
        permission_id text references public.permissions(id),
        access_scope public.data_access_scope not null,
        primary key(role_id, permission_id)
      );
      insert into public.roles values ('admin','system_admin'),('delivery','delivery_manager');
      insert into public.permissions values
        ('console','console.access'),
        ('team-read','team.members.read'),
        ('team-invite','team.members.invite'),
        ('team-role','team.members.assign_role'),
        ('team-status','team.members.change_status'),
        ('team-admin','team.members.assign_system_admin'),
        ('teams-read','teams.read'),
        ('teams-manage','teams.manage'),
        ('roles-read','roles.read'),
        ('ticket-read','tickets.read'),
        ('ticket-update','tickets.update'),
        ('pipeline-read','pipeline.read'),
        ('move-stage','deals.move_stage');
      insert into public.role_permissions
      select 'admin', id, 'company'::public.data_access_scope from public.permissions;
    `)
    await db.exec(await readFile(new URL('../migrations/20260922000200_system_admin_team_only_and_delivery_stage.sql', import.meta.url), 'utf8'))

    const adminPermissions = await db.query(`
      select permission.slug, role_permission.access_scope
      from public.role_permissions role_permission
      join public.roles role on role.id = role_permission.role_id
      join public.permissions permission on permission.id = role_permission.permission_id
      where role.slug = 'system_admin'
      order by permission.slug
    `)
    assert.deepEqual(adminPermissions.rows.map((row) => row.slug), [
      'console.access', 'roles.read', 'team.members.assign_role',
      'team.members.assign_system_admin', 'team.members.change_status',
      'team.members.invite', 'team.members.read', 'teams.manage', 'teams.read',
    ])
    assert.ok(adminPermissions.rows.every((row) => row.access_scope === 'company'))

    const delivery = await db.query(`
      select role_permission.access_scope from public.role_permissions role_permission
      join public.roles role on role.id = role_permission.role_id
      join public.permissions permission on permission.id = role_permission.permission_id
      where role.slug = 'delivery_manager' and permission.slug = 'deals.move_stage'
    `)
    assert.deepEqual(delivery.rows, [{ access_scope: 'assigned' }])
  } finally { await db.close() }
})
