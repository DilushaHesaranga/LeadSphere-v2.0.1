do $$ begin
  create type public.data_access_scope as enum ('own', 'assigned', 'team', 'company');
exception when duplicate_object then null;
end $$;

alter table public.role_permissions
  add column if not exists access_scope public.data_access_scope not null default 'company';

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  status public.membership_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teams_name_length check (char_length(trim(name)) between 2 and 80)
);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  team_role text not null default 'member',
  status public.membership_status not null default 'active',
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (team_id, user_id),
  constraint team_members_role check (team_role in ('member', 'manager'))
);

create index if not exists team_members_user_status_idx
  on public.team_members (user_id, status);

drop trigger if exists teams_set_updated_at on public.teams;
create trigger teams_set_updated_at before update on public.teams
for each row execute function public.set_updated_at();

insert into public.permissions (slug, description) values
  ('console.access', 'Access the LeadSphere console'),
  ('team.members.read', 'View team members and pending invitations'),
  ('team.members.invite', 'Invite a business-role member'),
  ('team.members.assign_role', 'Assign or change business roles'),
  ('team.members.change_status', 'Activate or deactivate business memberships'),
  ('team.members.assign_system_admin', 'Assign the protected System Admin role'),
  ('teams.read', 'View team definitions and membership'),
  ('teams.manage', 'Create and manage teams'),
  ('roles.read', 'View role and permission definitions'),
  ('roles.manage', 'Manage authorization definitions'),
  ('authorization.read', 'View authorization configuration'),
  ('authorization.manage', 'Manage authorization configuration'),
  ('leads.create', 'Create leads'),
  ('leads.read', 'Read leads'),
  ('leads.update', 'Update lead information'),
  ('leads.assign', 'Assign or reassign leads'),
  ('leads.change_status', 'Change lead status'),
  ('leads.monitor_conversion', 'Monitor lead conversion'),
  ('lead_sources.read', 'Read lead source definitions'),
  ('accounts.read', 'Read customer accounts'),
  ('accounts.update', 'Update customer accounts'),
  ('accounts.assign', 'Assign or reassign customer accounts'),
  ('contacts.read', 'Read contacts'),
  ('contacts.update', 'Update contacts'),
  ('activities.read', 'Read activities'),
  ('activities.create', 'Create activities'),
  ('activities.update', 'Update activities'),
  ('deals.read', 'Read deals'),
  ('deals.update', 'Update deal information'),
  ('deals.move_stage', 'Move deals through permitted stages'),
  ('deals.assign', 'Assign or reassign deals'),
  ('pipeline.read', 'Read pipeline information'),
  ('followups.read', 'Read follow-up actions'),
  ('followups.update', 'Update follow-up actions'),
  ('reminders.read', 'Read work reminders'),
  ('reminders.update', 'Update work reminders'),
  ('performance.read', 'Read sales performance information'),
  ('dashboards.read', 'Read authorized dashboard information'),
  ('reports.read', 'Read authorized reports'),
  ('revenue.read', 'Read revenue information'),
  ('revenue.forecast.read', 'Read revenue forecasts'),
  ('customer_context.read', 'Read delivery-stage customer context')
on conflict (slug) do update set description = excluded.description;

insert into public.roles (slug, name, description, is_assignable) values
  ('system_admin', 'System Admin', 'Administrative superuser for membership, roles, permissions, and existing full-access behavior.', false),
  ('marketing_executive', 'Marketing Executive', 'Creates and manages own or assigned marketing leads.', true),
  ('sales_executive', 'Sales Executive', 'Manages assigned accounts, activities, and deals.', true),
  ('sales_manager', 'Sales Manager', 'Oversees and assigns team sales work.', true),
  ('delivery_manager', 'Delivery Manager', 'Reads assigned delivery-stage customer context.', true),
  ('leadership', 'Leadership', 'Reads company-wide business performance without system administration.', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_assignable = excluded.is_assignable;

update public.roles
set is_assignable = false,
    description = concat(description, case when description like '%Legacy role%' then '' else ' Legacy role retained for compatibility.' end)
where slug in ('marketing_manager', 'viewer');

delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.slug in (
    'system_admin', 'marketing_executive', 'sales_executive',
    'sales_manager', 'delivery_manager', 'leadership'
  );

insert into public.role_permissions (role_id, permission_id, access_scope)
select r.id, p.id, matrix.scope::public.data_access_scope
from (values
  ('marketing_executive', 'console.access', 'company'),
  ('marketing_executive', 'leads.create', 'own'),
  ('marketing_executive', 'leads.read', 'assigned'),
  ('marketing_executive', 'leads.update', 'assigned'),
  ('marketing_executive', 'leads.change_status', 'assigned'),
  ('marketing_executive', 'leads.monitor_conversion', 'assigned'),
  ('marketing_executive', 'lead_sources.read', 'company'),
  ('marketing_executive', 'pipeline.read', 'assigned'),

  ('sales_executive', 'console.access', 'company'),
  ('sales_executive', 'leads.read', 'assigned'),
  ('sales_executive', 'accounts.read', 'assigned'),
  ('sales_executive', 'accounts.update', 'assigned'),
  ('sales_executive', 'contacts.read', 'assigned'),
  ('sales_executive', 'contacts.update', 'assigned'),
  ('sales_executive', 'activities.read', 'assigned'),
  ('sales_executive', 'activities.create', 'assigned'),
  ('sales_executive', 'activities.update', 'assigned'),
  ('sales_executive', 'deals.read', 'assigned'),
  ('sales_executive', 'deals.update', 'assigned'),
  ('sales_executive', 'deals.move_stage', 'assigned'),
  ('sales_executive', 'pipeline.read', 'assigned'),
  ('sales_executive', 'followups.read', 'assigned'),
  ('sales_executive', 'followups.update', 'assigned'),
  ('sales_executive', 'reminders.read', 'assigned'),
  ('sales_executive', 'reminders.update', 'assigned'),

  ('sales_manager', 'console.access', 'company'),
  ('sales_manager', 'leads.read', 'team'),
  ('sales_manager', 'leads.update', 'team'),
  ('sales_manager', 'leads.assign', 'team'),
  ('sales_manager', 'accounts.read', 'team'),
  ('sales_manager', 'accounts.update', 'team'),
  ('sales_manager', 'accounts.assign', 'team'),
  ('sales_manager', 'contacts.read', 'team'),
  ('sales_manager', 'activities.read', 'team'),
  ('sales_manager', 'deals.read', 'team'),
  ('sales_manager', 'deals.update', 'team'),
  ('sales_manager', 'deals.move_stage', 'team'),
  ('sales_manager', 'deals.assign', 'team'),
  ('sales_manager', 'pipeline.read', 'team'),
  ('sales_manager', 'followups.read', 'team'),
  ('sales_manager', 'reminders.read', 'team'),
  ('sales_manager', 'performance.read', 'team'),
  ('sales_manager', 'dashboards.read', 'team'),
  ('sales_manager', 'reports.read', 'team'),

  ('delivery_manager', 'console.access', 'company'),
  ('delivery_manager', 'accounts.read', 'assigned'),
  ('delivery_manager', 'contacts.read', 'assigned'),
  ('delivery_manager', 'activities.read', 'assigned'),
  ('delivery_manager', 'deals.read', 'assigned'),
  ('delivery_manager', 'customer_context.read', 'assigned'),

  ('leadership', 'console.access', 'company'),
  ('leadership', 'deals.read', 'company'),
  ('leadership', 'pipeline.read', 'company'),
  ('leadership', 'performance.read', 'company'),
  ('leadership', 'dashboards.read', 'company'),
  ('leadership', 'reports.read', 'company'),
  ('leadership', 'revenue.read', 'company'),
  ('leadership', 'revenue.forecast.read', 'company')
) as matrix(role_slug, permission_slug, scope)
join public.roles r on r.slug = matrix.role_slug
join public.permissions p on p.slug = matrix.permission_slug
on conflict (role_id, permission_id) do update
set access_scope = excluded.access_scope;

-- Preserve the existing deliberate System Admin superuser behavior. The normal
-- invitation flow still excludes this role via roles.is_assignable = false.
insert into public.role_permissions (role_id, permission_id, access_scope)
select r.id, p.id, 'company'::public.data_access_scope
from public.roles r
cross join public.permissions p
where r.slug = 'system_admin'
on conflict (role_id, permission_id) do update
set access_scope = excluded.access_scope;

create or replace function public.scope_rank(p_scope public.data_access_scope)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_scope
    when 'own' then 1
    when 'assigned' then 2
    when 'team' then 3
    when 'company' then 4
  end;
$$;

create or replace function public.user_permission_scope(p_user_id uuid, p_permission text)
returns public.data_access_scope
language sql
stable
security definer
set search_path = ''
as $$
  select rp.access_scope
  from public.profiles profile
  join public.user_roles membership on membership.user_id = profile.id
  join public.role_permissions rp on rp.role_id = membership.role_id
  join public.permissions permission on permission.id = rp.permission_id
  where profile.id = p_user_id
    and profile.status = 'active'
    and membership.status = 'active'
    and permission.slug = p_permission
  order by public.scope_rank(rp.access_scope) desc
  limit 1;
$$;

revoke all on function public.user_permission_scope(uuid, text) from public, anon, authenticated;
grant execute on function public.user_permission_scope(uuid, text) to service_role;

create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_permission_scope(p_user_id, p_permission) is not null;
$$;

revoke all on function public.user_has_permission(uuid, text) from public, anon, authenticated;
grant execute on function public.user_has_permission(uuid, text) to service_role;

create or replace function public.current_user_permission_scope(p_permission text)
returns public.data_access_scope
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_permission_scope((select auth.uid()), p_permission);
$$;

revoke all on function public.current_user_permission_scope(text) from public, anon;
grant execute on function public.current_user_permission_scope(text) to authenticated;

create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_user_permission_scope(p_permission) is not null;
$$;

revoke all on function public.current_user_has_permission(text) from public, anon;
grant execute on function public.current_user_has_permission(text) to authenticated;

create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and not public.current_user_has_permission('team.members.change_status') then
    if new.id <> old.id or new.email <> old.email or new.status <> old.status then
      raise exception 'Protected profile fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.current_user_in_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.team_id = p_team_id
      and tm.user_id = (select auth.uid())
      and tm.status = 'active'
      and t.status = 'active'
  );
$$;

revoke all on function public.current_user_in_team(uuid) from public, anon;
grant execute on function public.current_user_in_team(uuid) to authenticated;

create or replace function public.can_access_record(
  p_permission text,
  p_owner_id uuid default null,
  p_assigned_user_id uuid default null,
  p_team_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  access_scope public.data_access_scope;
  current_user_id uuid := (select auth.uid());
begin
  access_scope := public.user_permission_scope(current_user_id, p_permission);
  return case access_scope
    when 'company' then true
    when 'team' then p_team_id is not null and public.current_user_in_team(p_team_id)
    when 'assigned' then current_user_id = p_assigned_user_id or current_user_id = p_owner_id
    when 'own' then current_user_id = p_owner_id
    else false
  end;
end;
$$;

revoke all on function public.can_access_record(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.can_access_record(text, uuid, uuid, uuid) to authenticated;

create or replace function public.get_user_authorization(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile_json jsonb;
  roles_json jsonb;
  teams_json jsonb;
  permissions_json jsonb;
begin
  select jsonb_build_object(
    'id', p.id,
    'email', p.email,
    'display_name', p.display_name,
    'status', p.status
  ) into profile_json
  from public.profiles p
  where p.id = p_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id,
    'slug', r.slug,
    'name', r.name
  ) order by r.name), '[]'::jsonb)
  into roles_json
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id and ur.status = 'active';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'teamRole', tm.team_role
  ) order by t.name), '[]'::jsonb)
  into teams_json
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = p_user_id
    and tm.status = 'active'
    and t.status = 'active';

  select coalesce(jsonb_object_agg(scoped.slug, scoped.access_scope), '{}'::jsonb)
  into permissions_json
  from (
    select distinct on (p.slug) p.slug, rp.access_scope
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_user_id and ur.status = 'active'
    order by p.slug, public.scope_rank(rp.access_scope) desc
  ) scoped;

  if coalesce(profile_json ->> 'status', 'disabled') <> 'active' then
    roles_json := '[]'::jsonb;
    teams_json := '[]'::jsonb;
    permissions_json := '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'profile', profile_json,
    'roles', roles_json,
    'teams', teams_json,
    'permissions', permissions_json
  );
end;
$$;

revoke all on function public.get_user_authorization(uuid) from public, anon, authenticated;
grant execute on function public.get_user_authorization(uuid) to service_role;

create or replace function public.current_user_authorization()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select public.get_user_authorization((select auth.uid()));
$$;

revoke all on function public.current_user_authorization() from public, anon;
grant execute on function public.current_user_authorization() to authenticated;

create or replace function public.assign_business_role(
  p_actor_id uuid,
  p_user_id uuid,
  p_role_slug text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_role public.roles%rowtype;
begin
  if not public.user_has_permission(p_actor_id, 'team.members.assign_role') then
    raise exception 'Permission denied';
  end if;
  if p_actor_id = p_user_id then
    raise exception 'Users cannot change their own role';
  end if;
  if exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and ur.status = 'active' and r.slug = 'system_admin'
  ) then
    raise exception 'System Admin membership requires a protected workflow';
  end if;

  select * into selected_role from public.roles
  where slug = p_role_slug and is_assignable = true and slug <> 'system_admin';
  if selected_role.id is null then
    raise exception 'Role is not assignable';
  end if;

  update public.user_roles ur set status = 'disabled'
  where ur.user_id = p_user_id
    and ur.role_id in (select id from public.roles where slug <> 'system_admin');

  insert into public.user_roles (user_id, role_id, assigned_by, assigned_at, status)
  values (p_user_id, selected_role.id, p_actor_id, now(), 'active')
  on conflict (user_id, role_id) do update set
    assigned_by = excluded.assigned_by,
    assigned_at = excluded.assigned_at,
    status = 'active';
end;
$$;

revoke all on function public.assign_business_role(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_business_role(uuid, uuid, text) to service_role;

create or replace function public.set_business_membership_status(
  p_actor_id uuid,
  p_user_id uuid,
  p_status public.membership_status
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.user_has_permission(p_actor_id, 'team.members.change_status') then
    raise exception 'Permission denied';
  end if;
  if p_actor_id = p_user_id then
    raise exception 'Users cannot change their own membership status';
  end if;
  if exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = p_user_id and r.slug = 'system_admin'
  ) then
    raise exception 'System Admin membership requires a protected workflow';
  end if;

  if p_status = 'disabled' then
    update public.user_roles ur set status = 'disabled'
    where ur.user_id = p_user_id
      and ur.role_id in (select id from public.roles where slug <> 'system_admin');
  else
    update public.user_roles ur set status = 'disabled'
    where ur.user_id = p_user_id
      and ur.role_id in (select id from public.roles where slug <> 'system_admin');

    update public.user_roles ur set status = 'active'
    where ur.user_id = p_user_id
      and ur.role_id = (
        select latest.role_id
        from public.user_roles latest
        join public.roles role on role.id = latest.role_id
        where latest.user_id = p_user_id and role.slug <> 'system_admin'
        order by latest.assigned_at desc
        limit 1
      );
  end if;
end;
$$;

revoke all on function public.set_business_membership_status(uuid, uuid, public.membership_status) from public, anon, authenticated;
grant execute on function public.set_business_membership_status(uuid, uuid, public.membership_status) to service_role;

alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.current_user_has_permission('team.members.read'));

drop policy if exists roles_read_policy on public.roles;
create policy roles_read_policy on public.roles for select to authenticated
using (
  public.current_user_has_permission('roles.read')
  or exists (
    select 1 from public.user_roles ur
    where ur.user_id = (select auth.uid()) and ur.role_id = roles.id and ur.status = 'active'
  )
);

drop policy if exists permissions_read_policy on public.permissions;
create policy permissions_read_policy on public.permissions for select to authenticated
using (
  public.current_user_has_permission('roles.read')
  or exists (
    select 1 from public.role_permissions rp
    join public.user_roles ur on ur.role_id = rp.role_id
    where rp.permission_id = permissions.id
      and ur.user_id = (select auth.uid())
      and ur.status = 'active'
  )
);

drop policy if exists role_permissions_read_policy on public.role_permissions;
create policy role_permissions_read_policy on public.role_permissions for select to authenticated
using (
  public.current_user_has_permission('roles.read')
  or exists (
    select 1 from public.user_roles ur
    where ur.role_id = role_permissions.role_id
      and ur.user_id = (select auth.uid())
      and ur.status = 'active'
  )
);

drop policy if exists user_roles_read_policy on public.user_roles;
create policy user_roles_read_policy on public.user_roles for select to authenticated
using (
  user_id = (select auth.uid())
  or public.current_user_has_permission('team.members.read')
);

drop policy if exists user_roles_manage_policy on public.user_roles;

drop policy if exists invitations_admin_policy on public.invitations;
create policy invitations_admin_policy on public.invitations for all to authenticated
using (public.current_user_has_permission('team.members.invite'))
with check (public.current_user_has_permission('team.members.invite'));

drop policy if exists teams_read_policy on public.teams;
create policy teams_read_policy on public.teams for select to authenticated
using (
  public.current_user_has_permission('teams.read')
  or public.current_user_in_team(id)
);

drop policy if exists team_members_read_policy on public.team_members;
create policy team_members_read_policy on public.team_members for select to authenticated
using (
  user_id = (select auth.uid())
  or public.current_user_has_permission('teams.read')
  or public.current_user_in_team(team_id)
);

grant select on public.teams, public.team_members to authenticated;
revoke insert, update, delete on public.roles, public.permissions, public.role_permissions,
  public.user_roles, public.teams, public.team_members, public.invitations from authenticated;
