begin;

-- Dashboard access is independent of the more detailed Reports & Insights.
-- Preserve any existing custom scope for these roles.
insert into public.permissions (slug, description)
values ('dashboards.read', 'Read authorized dashboard information')
on conflict (slug) do nothing;
insert into public.role_permissions (role_id, permission_id, access_scope)
select role.id, permission.id, matrix.scope::public.data_access_scope
from (values
  ('marketing_manager', 'team'),
  ('sales_manager', 'team'),
  ('delivery_manager', 'assigned'),
  ('leadership', 'company'),
  ('system_admin', 'company')
) matrix(role_slug, scope)
join public.roles role on role.slug = matrix.role_slug
join public.permissions permission on permission.slug = 'dashboards.read'
on conflict (role_id, permission_id) do nothing;

-- Optional deal values are separate from ticket workflow and do not represent
-- invoices, payments, or the customer's own annual revenue.
create table if not exists public.crm_ticket_sales (
  ticket_id uuid primary key references public.crm_tickets(id) on delete cascade,
  deal_value numeric(14,2),
  currency text not null default 'LKR',
  updated_at timestamptz not null default now(),
  updated_by_user_id uuid not null references auth.users(id) on delete restrict,
  constraint crm_ticket_sales_value_check check (deal_value is null or (deal_value >= 0 and deal_value <= 999999999999.99)),
  constraint crm_ticket_sales_currency_check check (currency in ('LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD'))
);
alter table public.crm_ticket_sales enable row level security;
create policy crm_ticket_sales_read on public.crm_ticket_sales for select to authenticated
  using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
revoke all on public.crm_ticket_sales from public, anon, authenticated;
grant select on public.crm_ticket_sales to authenticated;

create or replace function public.get_crm_ticket_sales(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if (select auth.uid()) is null or not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then
    raise exception 'Ticket not found or access denied' using errcode = '42501';
  end if;
  select jsonb_build_object('ticketId', p_ticket_id, 'dealValue', sales.deal_value,
    'currency', sales.currency, 'updatedAt', sales.updated_at)
  into result from public.crm_ticket_sales sales where sales.ticket_id = p_ticket_id;
  return coalesce(result, jsonb_build_object('ticketId', p_ticket_id, 'dealValue', null,
    'currency', 'LKR', 'updatedAt', null));
end;
$$;

create or replace function public.update_crm_ticket_sales(p_ticket_id uuid, p_deal_value numeric, p_currency text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  previous_value public.crm_ticket_sales%rowtype;
  safe_currency text := upper(trim(coalesce(p_currency, '')));
begin
  if actor is null or not public.crm_can_access_ticket(p_ticket_id, 'tickets.update')
    or not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then
    raise exception 'Ticket not found or access denied' using errcode = '42501';
  end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id for update;
  if ticket_record.id is null or ticket_record.deleted_at is not null or ticket_record.status = 'archived' then
    raise exception 'Ticket not found or access denied' using errcode = '42501';
  end if;
  if safe_currency not in ('LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD') then
    raise exception 'Select a supported currency';
  end if;
  if p_deal_value is not null and (p_deal_value < 0 or p_deal_value > 999999999999.99
    or p_deal_value <> round(p_deal_value, 2) or p_deal_value::text in ('NaN', 'Infinity', '-Infinity')) then
    raise exception 'Deal value must be between 0 and 999999999999.99 with at most two decimal places';
  end if;
  select * into previous_value from public.crm_ticket_sales where ticket_id = p_ticket_id;
  insert into public.crm_ticket_sales (ticket_id, deal_value, currency, updated_at, updated_by_user_id)
  values (p_ticket_id, p_deal_value, safe_currency, now(), actor)
  on conflict (ticket_id) do update set deal_value = excluded.deal_value, currency = excluded.currency,
    updated_at = excluded.updated_at, updated_by_user_id = excluded.updated_by_user_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (p_ticket_id, 'TICKET_SALES_UPDATED', actor, jsonb_build_object(
    'previousDealValue', previous_value.deal_value, 'previousCurrency', previous_value.currency,
    'dealValue', p_deal_value, 'currency', safe_currency));
  return public.get_crm_ticket_sales(p_ticket_id);
end;
$$;

-- All dashboard consumers share the dashboard permission and its ticket scope.
-- Snapshot workload uses the present; the selected period applies to events.
create or replace function public.crm_validate_dashboard_query(
  p_from date, p_to date, p_pipeline_id uuid, p_owner_id uuid, p_department text
) returns void language plpgsql stable security definer set search_path = '' as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  local_today date := (clock_timestamp() at time zone report_timezone)::date;
begin
  if (select auth.uid()) is null or not public.current_user_has_permission('dashboards.read') then
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

create or replace function public.crm_dashboard_ticket_scope(
  p_now timestamptz, p_pipeline_id uuid, p_owner_id uuid, p_department text
) returns table (
  ticket_id uuid, case_id uuid, company_name text, project_title text,
  pipeline_id uuid, pipeline_name text, stage_slug text, stage_name text,
  stage_category text, probability numeric, ticket_status text,
  department text, department_name text, responsible_manager_id uuid,
  responsible_manager_name text, created_at timestamptz, closed_at timestamptz,
  outcome_at timestamptz, stage_age_days numeric, assignee_count integer, assignee_ids uuid[],
  deal_value numeric, currency text
) language sql stable security definer set search_path = '' as $$
  select ticket.id, crm_case.id, crm_case.company_name, ticket.project_title,
    stage.pipeline_id, pipeline.name, stage.slug, stage.name,
    stage.semantic_category, stage.probability, ticket.status,
    ticket.current_department, department.name, ticket.responsible_manager_id,
    coalesce(manager.display_name, manager.email::text), ticket.created_at,
    coalesce(ticket.closed_at, close_event.closed_at),
    case when stage.semantic_category in ('won','lost') then outcome.outcome_at end,
    greatest(0, extract(epoch from (p_now - coalesce(stage_entry.changed_at, ticket.stage_entered_at, ticket.created_at)))) / 86400.0,
    coalesce(array_length(assignees.user_ids, 1), 0), coalesce(assignees.user_ids, array[]::uuid[]),
    sales.deal_value, sales.currency
  from public.crm_tickets ticket
  join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
  join public.crm_ticket_stages stage on stage.slug = ticket.stage
  join public.crm_pipelines pipeline on pipeline.id = stage.pipeline_id
  join public.profiles manager on manager.id = ticket.responsible_manager_id
  join public.crm_departments department on department.slug = ticket.current_department
  left join public.crm_ticket_sales sales on sales.ticket_id = ticket.id
  left join lateral (
    select array_agg(assignment.user_id) user_ids
    from public.crm_ticket_assignments assignment
    join public.profiles profile on profile.id = assignment.user_id and profile.status = 'active'
    where assignment.ticket_id = ticket.id and assignment.removed_at is null
  ) assignees on true
  left join lateral (
    select max(history.changed_at) changed_at from public.crm_ticket_stage_history history
    where history.ticket_id = ticket.id and history.new_stage_slug = ticket.stage and history.changed_at < p_now
  ) stage_entry on true
  left join lateral (
    select max(history.changed_at) outcome_at
    from public.crm_ticket_stage_history history
    join public.crm_ticket_stages outcome_stage on outcome_stage.slug = history.new_stage_slug
    where history.ticket_id = ticket.id and history.changed_at < p_now
      and outcome_stage.semantic_category = stage.semantic_category
  ) outcome on true
  left join lateral (
    select max(activity.created_at) closed_at from public.crm_ticket_activity activity
    where activity.ticket_id = ticket.id and activity.action = 'TICKET_CLOSED'
  ) close_event on true
  where ticket.deleted_at is null and ticket.status <> 'archived' and ticket.created_at < p_now
    and public.crm_can_access_ticket(ticket.id, 'dashboards.read')
    and (p_pipeline_id is null or stage.pipeline_id = p_pipeline_id)
    and (p_department is null or ticket.current_department = p_department)
    and (p_owner_id is null or ticket.responsible_manager_id = p_owner_id
      or p_owner_id = any(coalesce(assignees.user_ids, array[]::uuid[])));
$$;

create or replace function public.get_crm_dashboard_filter_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  snapshot_at timestamptz := clock_timestamp();
  result jsonb;
begin
  if (select auth.uid()) is null or not public.current_user_has_permission('dashboards.read') then
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

create or replace function public.get_crm_dashboard(
  p_from date, p_to date, p_pipeline_id uuid default null,
  p_owner_id uuid default null, p_department text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  snapshot_at timestamptz := clock_timestamp();
  from_utc timestamptz;
  to_utc timestamptz;
  today_start timestamptz;
  tomorrow_start timestamptz;
  result jsonb;
begin
  perform public.crm_validate_dashboard_query(p_from, p_to, p_pipeline_id, p_owner_id, p_department);
  from_utc := p_from::timestamp at time zone report_timezone;
  to_utc := (p_to + 1)::timestamp at time zone report_timezone;
  today_start := (snapshot_at at time zone report_timezone)::date::timestamp at time zone report_timezone;
  tomorrow_start := ((snapshot_at at time zone report_timezone)::date + 1)::timestamp at time zone report_timezone;

  with scoped as materialized (
    select *, (ticket_status = 'active' and stage_category = 'open') is_pending,
      (stage_category = 'won' and outcome_at >= from_utc and outcome_at < to_utc) won_in_period,
      (stage_category = 'lost' and outcome_at >= from_utc and outcome_at < to_utc) lost_in_period,
      (ticket_status = 'closed' and closed_at >= from_utc and closed_at < to_utc) closed_in_period
    from public.crm_dashboard_ticket_scope(snapshot_at, p_pipeline_id, p_owner_id, p_department)
  ), occurrences as materialized (
    select occurrence.*, scoped.project_title, scoped.company_name, scoped.ticket_status
    from public.crm_follow_up_occurrences occurrence
    join scoped on scoped.ticket_id = occurrence.ticket_id
  ), counts as (
    select count(*) total, count(*) filter (where is_pending) pending,
      count(*) filter (where created_at >= from_utc and created_at < to_utc) created,
      count(*) filter (where closed_in_period) closed,
      count(*) filter (where won_in_period) won, count(*) filter (where lost_in_period) lost,
      count(*) filter (where stage_category = 'won') current_won,
      count(*) filter (where stage_category = 'lost') current_lost,
      count(*) filter (where is_pending and stage_age_days >= 14) stale,
      count(*) filter (where is_pending and assignee_count = 0) unassigned,
      count(*) filter (where won_in_period and deal_value is not null) won_with_value,
      count(*) filter (where won_in_period and deal_value is null) won_missing_value,
      count(*) filter (where is_pending and deal_value is not null) pipeline_with_value,
      count(*) filter (where is_pending and deal_value is null) pipeline_missing_value
    from scoped
  ), followup_counts as (
    select count(*) filter (where status = 'PENDING' and ticket_status = 'active' and scheduled_at < snapshot_at) overdue,
      count(*) filter (where status = 'PENDING' and ticket_status = 'active' and scheduled_at >= today_start and scheduled_at < tomorrow_start) due_today,
      count(*) filter (where status = 'PENDING' and ticket_status = 'active' and scheduled_at >= tomorrow_start) upcoming,
      count(*) filter (where status = 'COMPLETED' and completed_at >= from_utc and completed_at < to_utc) completed
    from occurrences
  ), supported_currencies as (
    select unnest(array['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD']) currency
  ), currency_totals as (
    select currencies.currency,
      sum(scoped.deal_value) filter (where scoped.won_in_period) won_value,
      sum(scoped.deal_value) filter (where scoped.is_pending) pipeline_value,
      round(sum(scoped.deal_value * scoped.probability / 100) filter (where scoped.is_pending), 2) weighted_value,
      count(scoped.ticket_id) filter (where scoped.won_in_period and scoped.deal_value is not null) won_with_value,
      count(scoped.ticket_id) filter (where scoped.won_in_period and scoped.deal_value is null) won_missing_value,
      count(scoped.ticket_id) filter (where scoped.is_pending and scoped.deal_value is not null) pipeline_with_value,
      count(scoped.ticket_id) filter (where scoped.is_pending and scoped.deal_value is null) pipeline_missing_value
    from supported_currencies currencies left join scoped on scoped.currency = currencies.currency
    group by currencies.currency
  ), months as (
    select generate_series(date_trunc('month', p_from::timestamp), date_trunc('month', p_to::timestamp), interval '1 month')::date month_start
  ), trend as (
    select months.month_start, currencies.currency,
      sum(scoped.deal_value) won_value, count(scoped.ticket_id) won_count,
      count(scoped.ticket_id) filter (where scoped.deal_value is not null) with_value,
      count(scoped.ticket_id) filter (where scoped.deal_value is null) missing_value
    from months cross join supported_currencies currencies
    left join scoped on scoped.currency = currencies.currency and scoped.won_in_period
      and (scoped.outcome_at at time zone report_timezone)::date >= months.month_start
      and (scoped.outcome_at at time zone report_timezone)::date < (months.month_start + interval '1 month')::date
    group by months.month_start, currencies.currency
  ), stage_counts as (
    select stage.pipeline_id, pipeline.name pipeline_name, stage.slug stage, stage.name stage_name,
      stage.semantic_category category, stage.sort_order,
      count(scoped.ticket_id) count, round(coalesce(avg(scoped.stage_age_days), 0), 1) average_age_days
    from public.crm_ticket_stages stage
    join public.crm_pipelines pipeline on pipeline.id = stage.pipeline_id
    left join scoped on scoped.stage_slug = stage.slug
    where (p_pipeline_id is null or stage.pipeline_id = p_pipeline_id)
      and ((stage.is_active and pipeline.status = 'active') or scoped.ticket_id is not null)
    group by stage.pipeline_id, pipeline.name, stage.slug, stage.name, stage.semantic_category, stage.sort_order
  ), teams as (
    select responsible_manager_id, responsible_manager_name,
      count(*) total, count(*) filter (where is_pending) pending,
      count(*) filter (where won_in_period) won, count(*) filter (where lost_in_period) lost,
      count(*) filter (where closed_in_period) closed
    from scoped group by responsible_manager_id, responsible_manager_name
  ), department_counts as (
    select department, department_name, count(*) total,
      count(*) filter (where is_pending) pending,
      count(*) filter (where won_in_period) won, count(*) filter (where lost_in_period) lost
    from scoped group by department, department_name
  )
  select jsonb_build_object(
    'timezone', report_timezone, 'period', jsonb_build_object('from', p_from, 'to', p_to), 'asOf', snapshot_at,
    'metrics', jsonb_build_object(
      'totalTickets', counts.total, 'pendingTickets', counts.pending, 'newTickets', counts.created,
      'closedTickets', counts.closed, 'wonTickets', counts.won, 'lostTickets', counts.lost,
      'currentWonTickets', counts.current_won, 'currentLostTickets', counts.current_lost,
      'winRate', case when counts.won + counts.lost = 0 then null else round(counts.won * 100.0 / (counts.won + counts.lost), 1) end,
      'overdueFollowUps', followup_counts.overdue, 'dueTodayFollowUps', followup_counts.due_today,
      'upcomingFollowUps', followup_counts.upcoming, 'completedFollowUps', followup_counts.completed,
      'staleTickets', counts.stale, 'unassignedTickets', counts.unassigned
    ),
    'pipeline', coalesce((select jsonb_agg(jsonb_build_object(
      'pipelineId', pipeline_id, 'pipelineName', pipeline_name, 'stage', stage,
      'stageName', stage_name, 'category', category, 'count', count, 'averageAgeDays', average_age_days
    ) order by pipeline_name, sort_order) from stage_counts), '[]'::jsonb),
    'sales', (select jsonb_agg(jsonb_build_object('currency', currency,
      'wonValue', won_value, 'pipelineValue', pipeline_value, 'weightedPipelineValue', weighted_value,
      'wonWithValue', won_with_value, 'wonMissingValue', won_missing_value,
      'pipelineWithValue', pipeline_with_value, 'pipelineMissingValue', pipeline_missing_value
    ) order by array_position(array['LKR', 'USD', 'EUR', 'GBP', 'INR', 'AUD'], currency)) from currency_totals),
    'salesCoverage', jsonb_build_object('wonTickets', counts.won, 'wonWithValue', counts.won_with_value,
      'wonMissingValue', counts.won_missing_value, 'pipelineTickets', counts.pending,
      'pipelineWithValue', counts.pipeline_with_value, 'pipelineMissingValue', counts.pipeline_missing_value),
    'salesTrend', (select jsonb_agg(jsonb_build_object('month', month_start, 'currency', currency,
      'wonValue', case when won_count = 0 then 0 else won_value end,
      'wonCount', won_count, 'withValue', with_value, 'missingValue', missing_value
    ) order by month_start, currency) from trend),
    'team', coalesce((select jsonb_agg(jsonb_build_object('managerId', responsible_manager_id,
      'managerName', responsible_manager_name, 'total', total, 'pending', pending, 'won', won, 'lost', lost, 'closed', closed
    ) order by won desc, pending desc, responsible_manager_name) from teams), '[]'::jsonb),
    'departments', coalesce((select jsonb_agg(jsonb_build_object('department', department,
      'label', department_name, 'total', total, 'pending', pending, 'won', won, 'lost', lost
    ) order by department_name) from department_counts), '[]'::jsonb),
    'followUps', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'ticketId', ticket_id,
      'projectTitle', project_title, 'companyName', company_name, 'type', follow_up_type,
      'purpose', purpose, 'scheduledAt', scheduled_at, 'status', status) order by scheduled_at, id)
      from (select * from occurrences where status = 'PENDING' and ticket_status = 'active'
        order by scheduled_at, id limit 6) next_followups), '[]'::jsonb),
    'attention', jsonb_build_array(jsonb_build_object('kind', 'stale', 'count', counts.stale),
      jsonb_build_object('kind', 'unassigned', 'count', counts.unassigned),
      jsonb_build_object('kind', 'overdue', 'count', followup_counts.overdue))
  ) into result from counts cross join followup_counts;
  return result;
end;
$$;

create or replace function public.get_crm_dashboard_records(
  p_from date, p_to date, p_pipeline_id uuid default null, p_owner_id uuid default null,
  p_department text default null, p_kind text default 'all', p_stage text default null,
  p_page integer default 1, p_page_size integer default 10
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  snapshot_at timestamptz := clock_timestamp();
  from_utc timestamptz;
  to_utc timestamptz;
  safe_kind text := lower(trim(coalesce(p_kind, 'all')));
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 10), 1), 100);
  result jsonb;
begin
  perform public.crm_validate_dashboard_query(p_from, p_to, p_pipeline_id, p_owner_id, p_department);
  if safe_kind not in ('all','total','new','pending','closed','won','lost','overdue','stage','stale','unassigned','department') then
    raise exception 'Select a valid dashboard view';
  end if;
  if p_stage is not null and not exists (select 1 from public.crm_ticket_stages
    where slug = p_stage and (p_pipeline_id is null or pipeline_id = p_pipeline_id)) then
    raise exception 'Select a valid stage';
  end if;
  if safe_kind = 'stage' and p_stage is null then raise exception 'Select a valid stage'; end if;
  from_utc := p_from::timestamp at time zone report_timezone;
  to_utc := (p_to + 1)::timestamp at time zone report_timezone;
  with scoped as materialized (
    select * from public.crm_dashboard_ticket_scope(snapshot_at, p_pipeline_id, p_owner_id, p_department)
  ), filtered as materialized (
    select * from scoped where (p_stage is null or stage_slug = p_stage) and case safe_kind
      when 'new' then created_at >= from_utc and created_at < to_utc
      when 'pending' then ticket_status = 'active' and stage_category = 'open'
      when 'closed' then ticket_status = 'closed' and closed_at >= from_utc and closed_at < to_utc
      when 'won' then stage_category = 'won' and outcome_at >= from_utc and outcome_at < to_utc
      when 'lost' then stage_category = 'lost' and outcome_at >= from_utc and outcome_at < to_utc
      when 'stage' then true
      when 'stale' then ticket_status = 'active' and stage_category = 'open' and stage_age_days >= 14
      when 'unassigned' then ticket_status = 'active' and stage_category = 'open' and assignee_count = 0
      when 'overdue' then ticket_status = 'active' and exists (
        select 1 from public.crm_follow_up_occurrences occurrence where occurrence.ticket_id = scoped.ticket_id
          and occurrence.status = 'PENDING' and occurrence.scheduled_at < snapshot_at
      )
      else true end
  ), page_rows as (
    select * from filtered
    order by case when safe_kind in ('stale','stage') then stage_age_days end desc nulls last,
      created_at desc, ticket_id
    offset (page_number::bigint - 1) * page_size limit page_size
  )
  select jsonb_build_object('total', (select count(*) from filtered), 'page', page_number, 'pageSize', page_size,
    'records', coalesce((select jsonb_agg(jsonb_build_object('id', ticket_id, 'ticketId', ticket_id,
      'caseId', case_id, 'projectTitle', project_title, 'companyName', company_name,
      'stage', stage_slug, 'stageName', stage_name, 'stageCategory', stage_category,
      'status', ticket_status, 'department', department, 'managerName', responsible_manager_name,
      'stageAgeDays', round(stage_age_days, 1), 'dealValue', deal_value, 'currency', currency)
      order by case when safe_kind in ('stale','stage') then stage_age_days end desc nulls last,
        created_at desc, ticket_id) from page_rows), '[]'::jsonb)) into result;
  return result;
end;
$$;

revoke all on function public.crm_validate_dashboard_query(date,date,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.crm_dashboard_ticket_scope(timestamptz,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.get_crm_ticket_sales(uuid) from public, anon;
revoke all on function public.update_crm_ticket_sales(uuid,numeric,text) from public, anon;
revoke all on function public.get_crm_dashboard_filter_options() from public, anon;
revoke all on function public.get_crm_dashboard(date,date,uuid,uuid,text) from public, anon;
revoke all on function public.get_crm_dashboard_records(date,date,uuid,uuid,text,text,text,integer,integer) from public, anon;
grant execute on function public.get_crm_ticket_sales(uuid) to authenticated;
grant execute on function public.update_crm_ticket_sales(uuid,numeric,text) to authenticated;
grant execute on function public.get_crm_dashboard_filter_options() to authenticated;
grant execute on function public.get_crm_dashboard(date,date,uuid,uuid,text) to authenticated;
grant execute on function public.get_crm_dashboard_records(date,date,uuid,uuid,text,text,text,integer,integer) to authenticated;

commit;
