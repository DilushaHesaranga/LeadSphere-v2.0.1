begin;

-- Only the four business roles may use the CRM dashboard. Preserve every
-- existing scope for those roles; a System Admin role alone is not sufficient.
delete from public.role_permissions role_permission
using public.roles role, public.permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and permission.slug = 'dashboards.read'
  and role.slug not in ('marketing_manager', 'sales_manager', 'delivery_manager', 'leadership');

create or replace function public.crm_can_view_dashboard()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and public.crm_user_has_role((select auth.uid()),
      array['marketing_manager', 'sales_manager', 'delivery_manager', 'leadership'])
    and public.current_user_has_permission('dashboards.read');
$$;

create or replace function public.crm_validate_dashboard_query(
  p_from date, p_to date, p_pipeline_id uuid, p_owner_id uuid, p_department text
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  local_today date := (clock_timestamp() at time zone report_timezone)::date;
begin
  if not public.crm_can_view_dashboard() then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Select a valid report date range';
  end if;
  if p_to - p_from > 730 then raise exception 'Report date ranges are limited to 731 days'; end if;
  if p_to > local_today then raise exception 'Report end date cannot be in the future'; end if;
  if p_pipeline_id is not null and not exists (
    select 1 from public.crm_pipelines where id = p_pipeline_id
  ) then raise exception 'Select a valid pipeline'; end if;
  if p_owner_id is not null and not exists (
    select 1 from public.profiles where id = p_owner_id and status = 'active'
  ) then raise exception 'Select a valid owner or assignee'; end if;
  if p_department is not null and not exists (
    select 1 from public.crm_departments where slug = p_department and is_active
  ) then raise exception 'Select a valid department'; end if;
end;
$$;

create or replace function public.get_crm_dashboard_filter_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  snapshot_at timestamptz := clock_timestamp();
  result jsonb;
begin
  if not public.crm_can_view_dashboard() then
    raise exception 'Permission denied' using errcode = '42501';
  end if;
  with scoped as materialized (
    select * from public.crm_dashboard_ticket_scope(snapshot_at, null, null, null)
  ), visible_pipelines as (
    select pipeline.* from public.crm_pipelines pipeline
    where pipeline.status = 'active' or exists (select 1 from scoped where pipeline_id = pipeline.id)
  ), owners as (
    select distinct profile.id, coalesce(profile.display_name, profile.email::text) name
    from scoped cross join lateral unnest(array_append(scoped.assignee_ids, scoped.responsible_manager_id)) owner_ids(owner_id)
    join public.profiles profile on profile.id = owner_ids.owner_id and profile.status = 'active'
  )
  select jsonb_build_object('timezone', report_timezone,
    'pipelines', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'isDefault', is_default)
      order by is_default desc, name) from visible_pipelines), '[]'::jsonb),
    'stages', coalesce((select jsonb_agg(jsonb_build_object('slug', stage.slug, 'name', stage.name,
      'pipelineId', stage.pipeline_id, 'category', stage.semantic_category, 'businessArea', stage.business_area,
      'sortOrder', stage.sort_order) order by pipeline.name, stage.sort_order)
      from public.crm_ticket_stages stage join visible_pipelines pipeline on pipeline.id = stage.pipeline_id
      where (stage.is_active and pipeline.status = 'active') or exists (select 1 from scoped where stage_slug = stage.slug)), '[]'::jsonb),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name) from owners), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by name)
      from public.crm_departments where is_active), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;

revoke all on function public.crm_can_view_dashboard() from public, anon, authenticated;
revoke all on function public.crm_validate_dashboard_query(date,date,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.get_crm_dashboard_filter_options() from public, anon;
grant execute on function public.get_crm_dashboard_filter_options() to authenticated;

commit;
