create extension if not exists citext with schema extensions;

do $$ begin
  create type public.profile_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.membership_status as enum ('active', 'disabled');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.invitation_status as enum ('pending', 'accepted', 'expired', 'revoked', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  display_name text,
  status public.profile_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (display_name is null or char_length(trim(display_name)) between 2 and 80)
);

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null unique,
  description text not null default '',
  is_assignable boolean not null default true,
  created_at timestamptz not null default now(),
  constraint roles_slug_format check (slug ~ '^[a-z][a-z0-9_]*$')
);

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  description text not null default '',
  created_at timestamptz not null default now(),
  constraint permissions_slug_format check (slug ~ '^[a-z][a-z0-9_.]*$')
);

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  status public.membership_status not null default 'active',
  primary key (user_id, role_id)
);

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext not null,
  role_id uuid not null references public.roles(id) on delete restrict,
  invited_by uuid not null references auth.users(id) on delete restrict,
  provider_user_id uuid references auth.users(id) on delete set null,
  status public.invitation_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invitations_email_not_blank check (char_length(trim(email::text)) > 3),
  constraint invitations_acceptance_consistency check (
    (status = 'accepted' and accepted_by is not null and accepted_at is not null)
    or status <> 'accepted'
  )
);

create unique index if not exists invitations_one_pending_per_email
  on public.invitations (lower(email::text))
  where status = 'pending';

create index if not exists user_roles_user_status_idx on public.user_roles (user_id, status);
create index if not exists invitations_status_created_idx on public.invitations (status, created_at desc);
create index if not exists invitations_role_idx on public.invitations (role_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists invitations_set_updated_at on public.invitations;
create trigger invitations_set_updated_at before update on public.invitations
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of email on auth.users
for each row execute function public.handle_new_auth_user();

insert into public.profiles (id, email, display_name)
select id, email, nullif(trim(coalesce(raw_user_meta_data ->> 'display_name', '')), '')
from auth.users
where email is not null
on conflict (id) do update set email = excluded.email;

insert into public.permissions (slug, description) values
  ('console.access', 'Access the LeadSphere console'),
  ('team.read', 'View team members and invitations'),
  ('team.invite', 'Invite new team members'),
  ('team.manage', 'Manage memberships and roles'),
  ('leads.read', 'View permitted leads'),
  ('leads.manage', 'Create and update leads'),
  ('pipeline.team', 'View the team pipeline'),
  ('pipeline.company', 'View the company-wide pipeline'),
  ('customers.read', 'View customer context'),
  ('reports.company', 'View company-wide reporting')
on conflict (slug) do update set description = excluded.description;

insert into public.roles (slug, name, description, is_assignable) values
  ('system_admin', 'System Admin', 'LeadSphere platform administrator with full access.', false),
  ('marketing_executive', 'Marketing Executive', 'Creates and tracks marketing leads.', true),
  ('marketing_manager', 'Marketing Manager', 'Oversees marketing lead generation.', true),
  ('sales_executive', 'Sales Executive', 'Owns accounts, logs activity, and moves deals.', true),
  ('sales_manager', 'Sales Manager', 'Assigns accounts and oversees sales performance.', true),
  ('delivery_manager', 'Delivery Manager', 'Reads customer context required for delivery.', true),
  ('leadership', 'Leadership', 'Views company-wide pipeline, conversion, and revenue.', true),
  ('viewer', 'Viewer', 'Has read-only access to permitted CRM information.', true)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  is_assignable = excluded.is_assignable;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.slug = 'system_admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.slug = any (array['console.access','leads.read','leads.manage'])
where r.slug in ('marketing_executive', 'sales_executive')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.slug = any (array['console.access','leads.read','leads.manage','pipeline.team'])
where r.slug in ('marketing_manager', 'sales_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.slug = any (array['console.access','customers.read'])
where r.slug = 'delivery_manager'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.slug = any (array['console.access','leads.read','customers.read','pipeline.company','reports.company'])
where r.slug = 'leadership'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.slug = any (array['console.access','leads.read','customers.read'])
where r.slug = 'viewer'
on conflict do nothing;

create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles profile
    join public.user_roles membership on membership.user_id = profile.id
    join public.role_permissions rp on rp.role_id = membership.role_id
    join public.permissions permission on permission.id = rp.permission_id
    where profile.id = p_user_id
      and profile.status = 'active'
      and membership.status = 'active'
      and permission.slug = p_permission
  );
$$;

revoke all on function public.user_has_permission(uuid, text) from public, anon, authenticated;
grant execute on function public.user_has_permission(uuid, text) to service_role;

create or replace function public.current_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.user_has_permission((select auth.uid()), p_permission);
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
  if (select auth.uid()) is not null and not public.current_user_has_permission('team.manage') then
    if new.id <> old.id or new.email <> old.email or new.status <> old.status then
      raise exception 'Protected profile fields cannot be changed';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_security_fields on public.profiles;
create trigger profiles_protect_security_fields before update on public.profiles
for each row execute function public.protect_profile_security_fields();

create or replace function public.accept_invitation(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_record public.invitations%rowtype;
  role_record public.roles%rowtype;
  user_email text;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  if char_length(trim(coalesce(p_display_name, ''))) not between 2 and 80 then
    raise exception 'Display name must be between 2 and 80 characters';
  end if;

  user_email := lower(coalesce((select auth.jwt() ->> 'email'), ''));
  if user_email = '' then
    raise exception 'A verified email address is required';
  end if;

  update public.invitations
    set status = 'expired'
    where status = 'pending' and expires_at <= now();

  select * into invitation_record
  from public.invitations
  where lower(email::text) = user_email
    and status = 'pending'
    and expires_at > now()
  order by created_at desc
  limit 1
  for update;

  if invitation_record.id is null then
    raise exception 'No valid pending invitation was found for this account';
  end if;

  select * into role_record from public.roles where id = invitation_record.role_id;

  insert into public.profiles (id, email, display_name, status)
  values ((select auth.uid()), user_email, trim(p_display_name), 'active')
  on conflict (id) do update set display_name = excluded.display_name, status = 'active';

  insert into public.user_roles (user_id, role_id, assigned_by, status)
  values ((select auth.uid()), invitation_record.role_id, invitation_record.invited_by, 'active')
  on conflict (user_id, role_id) do update set status = 'active', assigned_by = excluded.assigned_by, assigned_at = now();

  update public.invitations set
    status = 'accepted',
    accepted_by = (select auth.uid()),
    accepted_at = now(),
    provider_user_id = coalesce(provider_user_id, (select auth.uid()))
  where id = invitation_record.id;

  return jsonb_build_object('role', role_record.slug, 'roleName', role_record.name);
end;
$$;

revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.invitations enable row level security;

drop policy if exists profiles_select_policy on public.profiles;
create policy profiles_select_policy on public.profiles for select to authenticated
using (id = (select auth.uid()) or public.current_user_has_permission('team.read'));

drop policy if exists profiles_update_own_policy on public.profiles;
create policy profiles_update_own_policy on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy if exists roles_read_policy on public.roles;
create policy roles_read_policy on public.roles for select to authenticated using (true);

drop policy if exists permissions_read_policy on public.permissions;
create policy permissions_read_policy on public.permissions for select to authenticated using (true);

drop policy if exists role_permissions_read_policy on public.role_permissions;
create policy role_permissions_read_policy on public.role_permissions for select to authenticated using (true);

drop policy if exists user_roles_read_policy on public.user_roles;
create policy user_roles_read_policy on public.user_roles for select to authenticated
using (user_id = (select auth.uid()) or public.current_user_has_permission('team.read'));

drop policy if exists user_roles_manage_policy on public.user_roles;
create policy user_roles_manage_policy on public.user_roles for all to authenticated
using (public.current_user_has_permission('team.manage'))
with check (public.current_user_has_permission('team.manage'));

drop policy if exists invitations_admin_policy on public.invitations;
create policy invitations_admin_policy on public.invitations for all to authenticated
using (public.current_user_has_permission('team.invite'))
with check (public.current_user_has_permission('team.invite'));

grant select, update on public.profiles to authenticated;
grant select on public.roles, public.permissions, public.role_permissions to authenticated;
grant select on public.user_roles to authenticated;
revoke all on public.invitations from anon, authenticated;

