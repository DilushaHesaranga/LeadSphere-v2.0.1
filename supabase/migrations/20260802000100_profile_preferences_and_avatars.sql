alter table public.profiles
  add column if not exists avatar_path text,
  add column if not exists banner_color text not null default '#16734b',
  add column if not exists theme_mode text not null default 'system';

do $$ begin
  alter table public.profiles add constraint profiles_avatar_path_format
    check (avatar_path is null or avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_banner_color_format
    check (banner_color ~ '^#[0-9a-fA-F]{6}$');
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.profiles add constraint profiles_theme_mode_allowed
    check (theme_mode in ('light', 'dark', 'system'));
exception when duplicate_object then null;
end $$;

drop policy if exists profiles_update_own_policy on public.profiles;
create policy profiles_update_own_policy on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (
  id = (select auth.uid())
  and (avatar_path is null or split_part(avatar_path, '/', 1) = (select auth.uid())::text)
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-avatars',
  'profile-avatars',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists profile_avatars_select_own on storage.objects;
create policy profile_avatars_select_own on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists profile_avatars_insert_own on storage.objects;
create policy profile_avatars_insert_own on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and lower(storage.extension(name)) in ('jpg', 'png', 'webp')
);

drop policy if exists profile_avatars_delete_own on storage.objects;
create policy profile_avatars_delete_own on storage.objects for delete to authenticated
using (
  bucket_id = 'profile-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

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
    'status', p.status,
    'avatar_path', p.avatar_path,
    'banner_color', p.banner_color,
    'theme_mode', p.theme_mode
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
  where tm.user_id = p_user_id and tm.status = 'active' and t.status = 'active';

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
