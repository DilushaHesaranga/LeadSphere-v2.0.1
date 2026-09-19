-- Run as the database owner after applying the dashboard access migration.
-- This checks existing profiles by setting transaction-local auth claims only.
-- It does not create sessions, change accounts, or modify application data.
begin transaction read only;

do $verify$
declare
  account record;
  expected boolean;
  request_sql text;
  today date := (clock_timestamp() at time zone public.crm_timeline_timezone())::date;
  allowed_count integer := 0;
  denied_count integer := 0;
begin
  if exists (
    select 1 from public.role_permissions rp
    join public.roles role on role.id = rp.role_id
    join public.permissions permission on permission.id = rp.permission_id
    where permission.slug = 'dashboards.read'
      and role.slug not in ('marketing_manager','sales_manager','delivery_manager','leadership')
  ) then
    raise exception 'Unexpected role retains a dashboard permission grant';
  end if;

  if has_function_privilege('authenticated', 'public.crm_can_view_dashboard()', 'EXECUTE')
    or has_function_privilege('anon', 'public.crm_can_view_dashboard()', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_crm_dashboard_filter_options()', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_crm_dashboard(date,date,uuid,uuid,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.get_crm_dashboard_records(date,date,uuid,uuid,text,text,text,integer,integer)', 'EXECUTE') then
    raise exception 'Dashboard function privileges are too broad';
  end if;

  for account in select id from public.profiles union all select null::uuid loop
    perform set_config('request.jwt.claim.sub', coalesce(account.id::text, ''), true);
    perform set_config('request.jwt.claims', jsonb_build_object('sub', account.id, 'role', 'authenticated')::text, true);
    expected := exists (
      select 1 from public.user_roles membership
      join public.roles role on role.id = membership.role_id
      join public.profiles profile on profile.id = membership.user_id
      where profile.id = account.id and profile.status = 'active' and membership.status = 'active'
        and role.slug in ('marketing_manager','sales_manager','delivery_manager','leadership')
    ) and public.current_user_has_permission('dashboards.read');

    foreach request_sql in array array[
      'select public.get_crm_dashboard($1::date,$2::date)',
      'select public.get_crm_dashboard_records($1::date,$2::date)',
      'select public.get_crm_dashboard_filter_options()'
    ] loop
      begin
        execute request_sql using today - 29, today;
        if not expected then
          raise exception 'A disallowed account was able to use a dashboard RPC';
        end if;
      exception when insufficient_privilege then
        if expected then
          raise exception 'An allowed dashboard account was denied';
        end if;
      end;
    end loop;

    if expected then allowed_count := allowed_count + 1;
    else denied_count := denied_count + 1; end if;
  end loop;
  raise notice 'Dashboard access verified: % allowed and % denied accounts (including anonymous), all three RPCs.', allowed_count, denied_count;
end;
$verify$;

select role.slug, rp.access_scope
from public.role_permissions rp
join public.roles role on role.id = rp.role_id
join public.permissions permission on permission.id = rp.permission_id
where permission.slug = 'dashboards.read'
order by role.slug;

rollback;
