-- LeadSphere Reports & Insights
--
-- Reporting uses the existing Ticket opportunity model, pipeline history,
-- activities, assignments, and Follow Ups. The application does not currently
-- store monetary amounts, currencies, lead sources, or campaigns, so this
-- migration intentionally exposes no revenue or source metrics.

create index if not exists crm_tickets_created_reporting_idx
  on public.crm_tickets (created_at desc)
  where deleted_at is null;

create or replace function public.crm_validate_report_query(
  p_from date,
  p_to date,
  p_pipeline_id uuid default null,
  p_stage text default null,
  p_owner_id uuid default null
) returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  local_today date := (clock_timestamp() at time zone report_timezone)::date;
begin
  if (select auth.uid()) is null or not public.current_user_has_permission('reports.read') then
    raise exception 'Permission denied';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Select a valid report date range';
  end if;
  if p_to - p_from > 730 then
    raise exception 'Report date ranges are limited to 731 days';
  end if;
  if p_to > local_today then
    raise exception 'Report end date cannot be in the future';
  end if;
  if p_pipeline_id is not null and not exists (
    select 1 from public.crm_pipelines pipeline
    where pipeline.id = p_pipeline_id and pipeline.status = 'active'
  ) then
    raise exception 'Select a valid pipeline';
  end if;
  if p_stage is not null and not exists (
    select 1 from public.crm_ticket_stages stage
    where stage.slug = p_stage
      and stage.is_active
      and (p_pipeline_id is null or stage.pipeline_id = p_pipeline_id)
  ) then
    raise exception 'Select a valid stage';
  end if;
  if p_owner_id is not null and not exists (
    select 1 from public.profiles profile
    where profile.id = p_owner_id and profile.status = 'active'
  ) then
    raise exception 'Select a valid owner or assignee';
  end if;
end;
$$;

create or replace function public.crm_report_ticket_scope(
  p_as_of timestamptz,
  p_pipeline_id uuid default null,
  p_stage text default null,
  p_owner_id uuid default null
) returns table (
  ticket_id uuid,
  case_id uuid,
  company_name text,
  project_title text,
  pipeline_id uuid,
  pipeline_name text,
  stage_slug text,
  stage_name text,
  stage_category text,
  business_area text,
  probability numeric,
  ticket_status text,
  responsible_manager_id uuid,
  responsible_manager_name text,
  created_at timestamptz,
  updated_at timestamptz,
  stage_entered_at timestamptz,
  stage_age_seconds bigint,
  converted_at timestamptz,
  outcome_at timestamptz,
  assignee_ids uuid[],
  assignee_names text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ticket.id,
    crm_case.id,
    crm_case.company_name,
    ticket.project_title,
    stage.pipeline_id,
    pipeline.name,
    stage.slug,
    stage.name,
    stage.semantic_category,
    stage.business_area,
    stage.probability,
    ticket.status,
    ticket.responsible_manager_id,
    coalesce(manager.display_name, manager.email::text),
    ticket.created_at,
    ticket.updated_at,
    coalesce(snapshot.changed_at, ticket.stage_entered_at, ticket.created_at),
    greatest(0, extract(epoch from (p_as_of - coalesce(snapshot.changed_at, ticket.stage_entered_at, ticket.created_at)))::bigint),
    conversion.converted_at,
    case when stage.semantic_category in ('won', 'lost') then outcome.outcome_at end,
    coalesce(assignees.user_ids, array[]::uuid[]),
    coalesce(assignees.user_names, array[]::text[])
  from public.crm_tickets ticket
  join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
  left join lateral (
    select history.new_stage_slug, history.changed_at
    from public.crm_ticket_stage_history history
    where history.ticket_id = ticket.id and history.changed_at < p_as_of
    order by history.changed_at desc, history.id desc
    limit 1
  ) snapshot on true
  join public.crm_ticket_stages stage on stage.slug = coalesce(snapshot.new_stage_slug, ticket.stage)
  join public.crm_pipelines pipeline on pipeline.id = stage.pipeline_id
  join public.profiles manager on manager.id = ticket.responsible_manager_id
  left join lateral (
    select
      array_agg(assignment.user_id order by coalesce(profile.display_name, profile.email::text)) user_ids,
      array_agg(coalesce(profile.display_name, profile.email::text) order by coalesce(profile.display_name, profile.email::text)) user_names
    from public.crm_ticket_assignments assignment
    join public.profiles profile on profile.id = assignment.user_id and profile.status = 'active'
    where assignment.ticket_id = ticket.id and assignment.removed_at is null
  ) assignees on true
  left join lateral (
    select min(history.changed_at) converted_at
    from public.crm_ticket_stage_history history
    join public.crm_ticket_stages converted_stage on converted_stage.slug = history.new_stage_slug
    where history.ticket_id = ticket.id
      and history.changed_at < p_as_of
      and converted_stage.business_area = 'customers'
  ) conversion on true
  left join lateral (
    select max(history.changed_at) outcome_at
    from public.crm_ticket_stage_history history
    join public.crm_ticket_stages outcome_stage on outcome_stage.slug = history.new_stage_slug
    where history.ticket_id = ticket.id
      and history.changed_at < p_as_of
      and outcome_stage.semantic_category = stage.semantic_category
  ) outcome on true
  where ticket.deleted_at is null
    and ticket.created_at < p_as_of
    and public.crm_can_access_ticket(ticket.id, 'reports.read')
    and (p_pipeline_id is null or stage.pipeline_id = p_pipeline_id)
    and (p_stage is null or stage.slug = p_stage)
    and (
      p_owner_id is null
      or ticket.responsible_manager_id = p_owner_id
      or p_owner_id = any(coalesce(assignees.user_ids, array[]::uuid[]))
    );
$$;

create or replace function public.get_crm_report_filter_options()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  as_of timestamptz := ((clock_timestamp() at time zone report_timezone)::date + 1)::timestamp at time zone report_timezone;
begin
  if (select auth.uid()) is null or not public.current_user_has_permission('reports.read') then
    raise exception 'Permission denied';
  end if;
  return jsonb_build_object(
    'timezone', report_timezone,
    'pipelines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pipeline.id,
        'name', pipeline.name,
        'isDefault', pipeline.is_default
      ) order by pipeline.is_default desc, pipeline.name), '[]'::jsonb)
      from public.crm_pipelines pipeline where pipeline.status = 'active'
    ),
    'stages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', stage.slug,
        'name', stage.name,
        'pipelineId', stage.pipeline_id,
        'category', stage.semantic_category,
        'businessArea', stage.business_area,
        'sortOrder', stage.sort_order
      ) order by pipeline.name, stage.sort_order), '[]'::jsonb)
      from public.crm_ticket_stages stage
      join public.crm_pipelines pipeline on pipeline.id = stage.pipeline_id and pipeline.status = 'active'
      where stage.is_active
    ),
    'owners', (
      select coalesce(jsonb_agg(jsonb_build_object('id', owner.id, 'name', owner.name) order by owner.name), '[]'::jsonb)
      from (
        select distinct profile.id, coalesce(profile.display_name, profile.email::text) name
        from public.crm_report_ticket_scope(as_of, null, null, null) scoped
        cross join lateral unnest(array_append(scoped.assignee_ids, scoped.responsible_manager_id)) as owner_ids(owner_id)
        join public.profiles profile on profile.id = owner_ids.owner_id and profile.status = 'active'
      ) owner
    )
  );
end;
$$;

create or replace function public.get_crm_reports_overview(
  p_from date,
  p_to date,
  p_pipeline_id uuid default null,
  p_stage text default null,
  p_owner_id uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  from_utc timestamptz;
  to_utc timestamptz;
  previous_from date;
  previous_to date;
  previous_from_utc timestamptz;
  previous_to_utc timestamptz;
  period_days integer := p_to - p_from + 1;
  bucket_unit text;
  step interval;
  current_new bigint := 0;
  previous_new bigint := 0;
  current_converted bigint := 0;
  previous_converted bigint := 0;
  current_won bigint := 0;
  previous_won bigint := 0;
  current_lost bigint := 0;
  previous_lost bigint := 0;
  active_pipeline bigint := 0;
  previous_active_pipeline bigint := 0;
  lead_tickets bigint := 0;
  customer_tickets bigint := 0;
  current_activities bigint := 0;
  previous_activities bigint := 0;
  current_completed_followups bigint := 0;
  previous_completed_followups bigint := 0;
  current_overdue_followups bigint := 0;
  average_cycle_days numeric;
  previous_average_cycle_days numeric;
  volume_series jsonb := '[]'::jsonb;
  stage_series jsonb := '[]'::jsonb;
  outcome_series jsonb := '[]'::jsonb;
  followup_series jsonb := '[]'::jsonb;
  team_series jsonb := '[]'::jsonb;
  insights jsonb := '[]'::jsonb;
  bottleneck record;
begin
  perform public.crm_validate_report_query(p_from, p_to, p_pipeline_id, p_stage, p_owner_id);
  from_utc := p_from::timestamp at time zone report_timezone;
  to_utc := (p_to + 1)::timestamp at time zone report_timezone;
  previous_to := p_from - 1;
  previous_from := previous_to - period_days + 1;
  previous_from_utc := previous_from::timestamp at time zone report_timezone;
  previous_to_utc := (previous_to + 1)::timestamp at time zone report_timezone;
  bucket_unit := case when period_days <= 31 then 'day' when period_days <= 180 then 'week' else 'month' end;
  step := case bucket_unit when 'day' then interval '1 day' when 'week' then interval '1 week' else interval '1 month' end;

  with current_scope as materialized (
    select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  ), previous_scope as materialized (
    select * from public.crm_report_ticket_scope(previous_to_utc, p_pipeline_id, p_stage, p_owner_id)
  )
  select
    count(*) filter (where current_scope.created_at >= from_utc and current_scope.created_at < to_utc),
    count(*) filter (where current_scope.created_at >= from_utc and current_scope.created_at < to_utc
      and current_scope.converted_at is not null),
    count(*) filter (where current_scope.stage_category = 'won' and current_scope.outcome_at >= from_utc and current_scope.outcome_at < to_utc),
    count(*) filter (where current_scope.stage_category = 'lost' and current_scope.outcome_at >= from_utc and current_scope.outcome_at < to_utc),
    count(*) filter (where current_scope.ticket_status = 'active' and current_scope.stage_category = 'open'),
    count(*) filter (where current_scope.ticket_status = 'active' and current_scope.business_area = 'leads'),
    count(*) filter (where current_scope.ticket_status = 'active' and current_scope.business_area = 'customers'),
    round(avg(extract(epoch from (current_scope.outcome_at - current_scope.created_at)) / 86400.0)
      filter (where current_scope.outcome_at >= from_utc and current_scope.outcome_at < to_utc), 1),
    (select count(*) from previous_scope where created_at >= previous_from_utc and created_at < previous_to_utc),
    (select count(*) from previous_scope where created_at >= previous_from_utc and created_at < previous_to_utc
      and converted_at is not null),
    (select count(*) from previous_scope where stage_category = 'won' and outcome_at >= previous_from_utc and outcome_at < previous_to_utc),
    (select count(*) from previous_scope where stage_category = 'lost' and outcome_at >= previous_from_utc and outcome_at < previous_to_utc),
    (select count(*) from previous_scope where ticket_status = 'active' and stage_category = 'open'),
    (select round(avg(extract(epoch from (outcome_at - created_at)) / 86400.0), 1)
      from previous_scope where outcome_at >= previous_from_utc and outcome_at < previous_to_utc)
  into current_new, current_converted, current_won, current_lost, active_pipeline,
    lead_tickets, customer_tickets, average_cycle_days,
    previous_new, previous_converted, previous_won, previous_lost,
    previous_active_pipeline, previous_average_cycle_days
  from current_scope;

  with current_scope as materialized (
    select ticket_id from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  ), previous_scope as materialized (
    select ticket_id from public.crm_report_ticket_scope(previous_to_utc, p_pipeline_id, p_stage, p_owner_id)
  )
  select
    (select count(*) from public.crm_ticket_activity activity join current_scope on current_scope.ticket_id = activity.ticket_id
      where activity.created_at >= from_utc and activity.created_at < to_utc),
    (select count(*) from public.crm_ticket_activity activity join previous_scope on previous_scope.ticket_id = activity.ticket_id
      where activity.created_at >= previous_from_utc and activity.created_at < previous_to_utc),
    (select count(*) from public.crm_follow_up_occurrences occurrence join current_scope on current_scope.ticket_id = occurrence.ticket_id
      where occurrence.status = 'COMPLETED' and occurrence.scheduled_at >= from_utc and occurrence.scheduled_at < to_utc),
    (select count(*) from public.crm_follow_up_occurrences occurrence join previous_scope on previous_scope.ticket_id = occurrence.ticket_id
      where occurrence.status = 'COMPLETED' and occurrence.scheduled_at >= previous_from_utc and occurrence.scheduled_at < previous_to_utc),
    (select count(*) from public.crm_follow_up_occurrences occurrence join current_scope on current_scope.ticket_id = occurrence.ticket_id
      where occurrence.status = 'PENDING' and occurrence.scheduled_at < clock_timestamp()
        and occurrence.scheduled_at >= from_utc and occurrence.scheduled_at < to_utc)
  into current_activities, previous_activities, current_completed_followups,
    previous_completed_followups, current_overdue_followups;

  with buckets as (
    select generate_series(
      date_trunc(bucket_unit, p_from::timestamp),
      date_trunc(bucket_unit, p_to::timestamp),
      step
    ) bucket
  ), current_scope as materialized (
    select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'from', bucket::date,
    'to', least(p_to, (bucket + step - interval '1 day')::date),
    'tickets', (select count(*) from current_scope scoped
      where scoped.created_at >= bucket at time zone report_timezone
        and scoped.created_at < (bucket + step) at time zone report_timezone)
  ) order by bucket), '[]'::jsonb)
  into volume_series from buckets;

  with current_scope as materialized (
    select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'pipelineId', grouped.pipeline_id,
    'pipelineName', grouped.pipeline_name,
    'stage', grouped.stage_slug,
    'label', grouped.stage_name,
    'category', grouped.stage_category,
    'probability', grouped.probability,
    'count', grouped.total,
    'averageAgeDays', grouped.average_age_days
  ) order by grouped.pipeline_name, grouped.sort_order), '[]'::jsonb)
  into stage_series
  from (
    select stage.pipeline_id, pipeline.name pipeline_name, stage.slug stage_slug,
      stage.name stage_name, stage.semantic_category stage_category, stage.probability,
      stage.sort_order, count(scoped.ticket_id) total,
      round(coalesce(avg(scoped.stage_age_seconds), 0) / 86400.0, 1) average_age_days
    from public.crm_ticket_stages stage
    join public.crm_pipelines pipeline on pipeline.id = stage.pipeline_id and pipeline.status = 'active'
    left join current_scope scoped on scoped.stage_slug = stage.slug and scoped.ticket_status = 'active'
    where stage.is_active
      and (p_pipeline_id is null or stage.pipeline_id = p_pipeline_id)
      and (p_stage is null or stage.slug = p_stage)
    group by stage.pipeline_id, pipeline.name, stage.slug, stage.name,
      stage.semantic_category, stage.probability, stage.sort_order
  ) grouped;

  with buckets as (
    select generate_series(date_trunc(bucket_unit, p_from::timestamp), date_trunc(bucket_unit, p_to::timestamp), step) bucket
  ), current_scope as materialized (
    select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'from', bucket::date,
    'to', least(p_to, (bucket + step - interval '1 day')::date),
    'won', (select count(*) from current_scope scoped where scoped.stage_category = 'won'
      and scoped.outcome_at >= bucket at time zone report_timezone and scoped.outcome_at < (bucket + step) at time zone report_timezone),
    'lost', (select count(*) from current_scope scoped where scoped.stage_category = 'lost'
      and scoped.outcome_at >= bucket at time zone report_timezone and scoped.outcome_at < (bucket + step) at time zone report_timezone)
  ) order by bucket), '[]'::jsonb)
  into outcome_series from buckets;

  with current_scope as materialized (
    select ticket_id from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  ), statuses as (
    select unnest(array['PENDING','COMPLETED','CANCELLED','OVERDUE']) status
  )
  select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', case status
    when 'OVERDUE' then (select count(*) from public.crm_follow_up_occurrences occurrence join current_scope on current_scope.ticket_id = occurrence.ticket_id
      where occurrence.status = 'PENDING' and occurrence.scheduled_at < clock_timestamp()
        and occurrence.scheduled_at >= from_utc and occurrence.scheduled_at < to_utc)
    else (select count(*) from public.crm_follow_up_occurrences occurrence join current_scope on current_scope.ticket_id = occurrence.ticket_id
      where occurrence.status = status and occurrence.scheduled_at >= from_utc and occurrence.scheduled_at < to_utc)
    end) order by status), '[]'::jsonb)
  into followup_series from statuses;

  with current_scope as materialized (
    select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  ), user_tickets as (
    select scoped.*, assignee_id
    from current_scope scoped cross join lateral unnest(scoped.assignee_ids) as member(assignee_id)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', performance.user_id,
    'name', performance.user_name,
    'newTickets', performance.new_tickets,
    'converted', performance.converted,
    'won', performance.won,
    'lost', performance.lost,
    'winRate', case when performance.won + performance.lost = 0 then null
      else round(performance.won * 100.0 / (performance.won + performance.lost), 1) end
  ) order by performance.won desc, performance.converted desc, performance.new_tickets desc, performance.user_name), '[]'::jsonb)
  into team_series
  from (
    select profile.id user_id, coalesce(profile.display_name, profile.email::text) user_name,
      count(*) filter (where scoped.created_at >= from_utc and scoped.created_at < to_utc) new_tickets,
      count(*) filter (where scoped.created_at >= from_utc and scoped.created_at < to_utc
        and scoped.converted_at is not null) converted,
      count(*) filter (where scoped.stage_category = 'won' and scoped.outcome_at >= from_utc and scoped.outcome_at < to_utc) won,
      count(*) filter (where scoped.stage_category = 'lost' and scoped.outcome_at >= from_utc and scoped.outcome_at < to_utc) lost
    from user_tickets scoped
    join public.profiles profile on profile.id = scoped.assignee_id
    group by profile.id, profile.display_name, profile.email
    order by won desc, converted desc, new_tickets desc
    limit 8
  ) performance;

  with current_scope as materialized (
    select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
  )
  select stage_slug, stage_name, count(*) total, round(avg(stage_age_seconds) / 86400.0, 1) average_days
  into bottleneck
  from current_scope
  where ticket_status = 'active' and stage_category = 'open'
  group by stage_slug, stage_name
  order by count(*) desc, avg(stage_age_seconds) desc
  limit 1;

  select coalesce(jsonb_agg(insight), '[]'::jsonb) into insights
  from (values
    (case when current_new + previous_new = 0 then null else jsonb_build_object(
      'tone', case when current_new >= previous_new then 'positive' else 'warning' end,
      'title', case when current_new >= previous_new then 'Ticket creation is holding or improving' else 'Ticket creation declined' end,
      'message', current_new || ' Tickets were created from ' || p_from || ' to ' || p_to ||
        ', compared with ' || previous_new || ' in the previous equivalent period.',
      'reportKey', 'ticket-volume'
    ) end),
    (case when current_overdue_followups = 0 then jsonb_build_object(
      'tone', 'positive', 'title', 'No overdue Follow Ups',
      'message', 'No pending Follow Ups scheduled in the selected period are overdue.',
      'reportKey', 'follow-up-health'
    ) else jsonb_build_object(
      'tone', 'danger', 'title', current_overdue_followups || ' overdue Follow Ups need attention',
      'message', 'These pending Follow Ups were scheduled during the selected period and are now overdue.',
      'reportKey', 'follow-up-health'
    ) end),
    (case when bottleneck.stage_name is null then null else jsonb_build_object(
      'tone', case when bottleneck.average_days >= 14 then 'warning' else 'neutral' end,
      'title', bottleneck.stage_name || ' has the largest active workload',
      'message', bottleneck.total || ' active Tickets are in this stage, averaging ' || bottleneck.average_days || ' days there.',
      'reportKey', 'pipeline-health', 'stage', bottleneck.stage_slug
    ) end),
    (case when current_won + current_lost < 3 then jsonb_build_object(
      'tone', 'neutral', 'title', 'More outcomes are needed for a reliable win-rate trend',
      'message', 'Only ' || (current_won + current_lost) || ' concluded Tickets fall in the selected period.',
      'reportKey', 'outcomes'
    ) else jsonb_build_object(
      'tone', case when current_won >= current_lost then 'positive' else 'warning' end,
      'title', 'Win rate is ' || round(current_won * 100.0 / nullif(current_won + current_lost, 0), 1) || '%',
      'message', current_won || ' Tickets were won and ' || current_lost || ' were lost in the selected period.',
      'reportKey', 'outcomes'
    ) end)
  ) generated(insight)
  where insight is not null;

  return jsonb_build_object(
    'timezone', report_timezone,
    'period', jsonb_build_object('from', p_from, 'to', p_to, 'days', period_days, 'grouping', bucket_unit),
    'comparisonPeriod', jsonb_build_object('from', previous_from, 'to', previous_to, 'days', period_days),
    'metrics', jsonb_build_object(
      'newTickets', jsonb_build_object('value', current_new, 'previous', previous_new),
      'convertedTickets', jsonb_build_object('value', current_converted, 'previous', previous_converted),
      'conversionRate', jsonb_build_object(
        'value', case when current_new = 0 then null else round(current_converted * 100.0 / current_new, 1) end,
        'previous', case when previous_new = 0 then null else round(previous_converted * 100.0 / previous_new, 1) end
      ),
      'activePipeline', jsonb_build_object('value', active_pipeline, 'previous', previous_active_pipeline),
      'wonTickets', jsonb_build_object('value', current_won, 'previous', previous_won),
      'winRate', jsonb_build_object(
        'value', case when current_won + current_lost = 0 then null else round(current_won * 100.0 / (current_won + current_lost), 1) end,
        'previous', case when previous_won + previous_lost = 0 then null else round(previous_won * 100.0 / (previous_won + previous_lost), 1) end
      ),
      'averageSalesCycleDays', jsonb_build_object('value', average_cycle_days, 'previous', previous_average_cycle_days),
      'activitiesRecorded', jsonb_build_object('value', current_activities, 'previous', previous_activities),
      'completedFollowUps', jsonb_build_object('value', current_completed_followups, 'previous', previous_completed_followups),
      'overdueFollowUps', jsonb_build_object('value', current_overdue_followups, 'previous', null),
      'leadTickets', jsonb_build_object('value', lead_tickets, 'previous', null),
      'customerTickets', jsonb_build_object('value', customer_tickets, 'previous', null)
    ),
    'charts', jsonb_build_object(
      'ticketVolume', volume_series,
      'pipelineStages', stage_series,
      'outcomes', outcome_series,
      'followUps', followup_series,
      'teamPerformance', team_series
    ),
    'insights', insights,
    'definitions', jsonb_build_array(
      jsonb_build_object('key', 'newTickets', 'label', 'New Tickets', 'description', 'Tickets created during the selected local-date period.'),
      jsonb_build_object('key', 'convertedTickets', 'label', 'Converted Tickets', 'description', 'Tickets created during the selected period that reached a Customer stage by the period end.'),
      jsonb_build_object('key', 'conversionRate', 'label', 'Conversion Rate', 'description', 'Converted Tickets from the selected-period creation cohort divided by all Tickets created in that period.'),
      jsonb_build_object('key', 'activePipeline', 'label', 'Active Pipeline', 'description', 'Active Tickets in an open pipeline stage as of the end of the selected period.'),
      jsonb_build_object('key', 'winRate', 'label', 'Win Rate', 'description', 'Won Tickets divided by Won plus Lost Tickets concluded during the selected period.'),
      jsonb_build_object('key', 'averageSalesCycleDays', 'label', 'Average Sales Cycle', 'description', 'Average days from Ticket creation to its current Won or Lost outcome in the selected period.'),
      jsonb_build_object('key', 'completedFollowUps', 'label', 'Completed Follow Ups', 'description', 'Follow Ups scheduled during the selected period whose current status is Completed.'),
      jsonb_build_object('key', 'overdueFollowUps', 'label', 'Overdue Follow Ups', 'description', 'Pending Follow Ups scheduled during the selected period whose scheduled time has passed.')
    )
  );
end;
$$;

create or replace function public.list_crm_report_records(
  p_report_key text,
  p_from date,
  p_to date,
  p_pipeline_id uuid default null,
  p_stage text default null,
  p_owner_id uuid default null,
  p_sort text default 'recent',
  p_direction text default 'desc',
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report_timezone text := public.crm_timeline_timezone();
  from_utc timestamptz;
  to_utc timestamptz;
  report_key text := lower(trim(coalesce(p_report_key, '')));
  sort_key text := lower(trim(coalesce(p_sort, 'recent')));
  sort_direction text := lower(trim(coalesce(p_direction, 'desc')));
  page_number integer := greatest(coalesce(p_page, 1), 1);
  page_size integer := least(greatest(coalesce(p_page_size, 25), 1), 200);
  total_count bigint := 0;
  records jsonb := '[]'::jsonb;
  columns jsonb := '[]'::jsonb;
begin
  perform public.crm_validate_report_query(p_from, p_to, p_pipeline_id, p_stage, p_owner_id);
  if report_key <> all(array['ticket-volume','conversion','pipeline-health','outcomes','follow-up-health','team-performance','activity-summary']) then
    raise exception 'Select a valid standard report';
  end if;
  if sort_key <> all(array['recent','oldest','company','stage']) then raise exception 'Select a valid report sort'; end if;
  if sort_direction <> all(array['asc','desc']) then raise exception 'Select a valid sort direction'; end if;
  from_utc := p_from::timestamp at time zone report_timezone;
  to_utc := (p_to + 1)::timestamp at time zone report_timezone;

  if report_key in ('ticket-volume','conversion','pipeline-health','outcomes','team-performance') then
    columns := jsonb_build_array(
      jsonb_build_object('key','ticketNumber','label','Ticket','format','text'),
      jsonb_build_object('key','projectTitle','label','Project','format','text'),
      jsonb_build_object('key','companyName','label','Company','format','text'),
      jsonb_build_object('key','stageName','label','Stage','format','text'),
      jsonb_build_object('key','managerName','label','Responsible manager','format','text'),
      jsonb_build_object('key','assigneeNames','label','Assigned people','format','list'),
      jsonb_build_object('key','eventAt','label','Relevant date','format','datetime')
    );
    with scoped as materialized (
      select *, case report_key
        when 'ticket-volume' then created_at
        when 'conversion' then converted_at
        when 'outcomes' then outcome_at
        when 'pipeline-health' then stage_entered_at
        else created_at
      end event_at
      from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
    ), filtered as (
      select * from scoped where case report_key
        when 'ticket-volume' then created_at >= from_utc and created_at < to_utc
        when 'conversion' then created_at >= from_utc and created_at < to_utc and converted_at is not null
        when 'pipeline-health' then ticket_status = 'active' and stage_category = 'open'
        when 'outcomes' then outcome_at >= from_utc and outcome_at < to_utc and stage_category in ('won','lost')
        when 'team-performance' then created_at < to_utc and array_length(assignee_ids, 1) is not null
        else false end
    )
    select count(*) into total_count from filtered;

    with scoped as materialized (
      select *, case report_key
        when 'ticket-volume' then created_at
        when 'conversion' then converted_at
        when 'outcomes' then outcome_at
        when 'pipeline-health' then stage_entered_at
        else created_at
      end event_at
      from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
    ), filtered as (
      select * from scoped where case report_key
        when 'ticket-volume' then created_at >= from_utc and created_at < to_utc
        when 'conversion' then created_at >= from_utc and created_at < to_utc and converted_at is not null
        when 'pipeline-health' then ticket_status = 'active' and stage_category = 'open'
        when 'outcomes' then outcome_at >= from_utc and outcome_at < to_utc and stage_category in ('won','lost')
        when 'team-performance' then created_at < to_utc and array_length(assignee_ids, 1) is not null
        else false end
    )
    select coalesce(jsonb_agg(item), '[]'::jsonb) into records from (
      select jsonb_build_object(
        'recordType','ticket','id',ticket_id,'ticketId',ticket_id,'ticketNumber',upper(substr(replace(ticket_id::text, '-', ''), 1, 8)),
        'caseId',case_id,'companyName',company_name,'projectTitle',project_title,
        'pipelineName',pipeline_name,'stageName',stage_name,'stageCategory',stage_category,
        'status',ticket_status,'managerName',responsible_manager_name,
        'assigneeNames',to_jsonb(assignee_names),'eventAt',event_at,'createdAt',created_at
      ) item
      from filtered
      order by
        case when sort_key = 'company' and sort_direction = 'asc' then company_name end asc,
        case when sort_key = 'company' and sort_direction = 'desc' then company_name end desc,
        case when sort_key = 'stage' and sort_direction = 'asc' then stage_name end asc,
        case when sort_key = 'stage' and sort_direction = 'desc' then stage_name end desc,
        case when sort_key in ('recent','oldest') and sort_direction = 'asc' then event_at end asc nulls last,
        case when sort_key in ('recent','oldest') and sort_direction = 'desc' then event_at end desc nulls last,
        ticket_id
      offset (page_number - 1) * page_size limit page_size
    ) page_rows;
  elsif report_key = 'follow-up-health' then
    columns := jsonb_build_array(
      jsonb_build_object('key','ticketNumber','label','Ticket','format','text'),
      jsonb_build_object('key','projectTitle','label','Project','format','text'),
      jsonb_build_object('key','companyName','label','Company','format','text'),
      jsonb_build_object('key','followUpType','label','Type','format','text'),
      jsonb_build_object('key','purpose','label','Purpose','format','text'),
      jsonb_build_object('key','status','label','Status','format','status'),
      jsonb_build_object('key','eventAt','label','Scheduled','format','datetime')
    );
    with scoped as materialized (
      select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
    ), filtered as (
      select occurrence.*, scoped.case_id, scoped.company_name, scoped.project_title
      from public.crm_follow_up_occurrences occurrence
      join scoped on scoped.ticket_id = occurrence.ticket_id
      where occurrence.scheduled_at >= from_utc and occurrence.scheduled_at < to_utc
    ) select count(*) into total_count from filtered;

    with scoped as materialized (
      select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
    ), filtered as (
      select occurrence.*, scoped.case_id, scoped.company_name, scoped.project_title,
        case when occurrence.status = 'PENDING' and occurrence.scheduled_at < clock_timestamp() then 'OVERDUE' else occurrence.status end display_status
      from public.crm_follow_up_occurrences occurrence
      join scoped on scoped.ticket_id = occurrence.ticket_id
      where occurrence.scheduled_at >= from_utc and occurrence.scheduled_at < to_utc
    )
    select coalesce(jsonb_agg(item), '[]'::jsonb) into records from (
      select jsonb_build_object(
        'recordType','followup','id',id,'ticketId',ticket_id,'ticketNumber',upper(substr(replace(ticket_id::text, '-', ''), 1, 8)),
        'caseId',case_id,'companyName',company_name,'projectTitle',project_title,
        'followUpType',follow_up_type,'purpose',purpose,'status',display_status,'eventAt',scheduled_at
      ) item
      from filtered
      order by
        case when sort_direction = 'asc' then scheduled_at end asc,
        case when sort_direction = 'desc' then scheduled_at end desc,
        id
      offset (page_number - 1) * page_size limit page_size
    ) page_rows;
  else
    columns := jsonb_build_array(
      jsonb_build_object('key','ticketNumber','label','Ticket','format','text'),
      jsonb_build_object('key','projectTitle','label','Project','format','text'),
      jsonb_build_object('key','companyName','label','Company','format','text'),
      jsonb_build_object('key','action','label','Activity','format','activity'),
      jsonb_build_object('key','actorName','label','Recorded by','format','text'),
      jsonb_build_object('key','eventAt','label','Recorded','format','datetime')
    );
    with scoped as materialized (
      select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
    ), filtered as (
      select activity.*, scoped.case_id, scoped.company_name, scoped.project_title,
        coalesce(profile.display_name, profile.email::text, 'System') actor_name
      from public.crm_ticket_activity activity
      join scoped on scoped.ticket_id = activity.ticket_id
      left join public.profiles profile on profile.id = activity.actor_user_id
      where activity.created_at >= from_utc and activity.created_at < to_utc
    ) select count(*) into total_count from filtered;

    with scoped as materialized (
      select * from public.crm_report_ticket_scope(to_utc, p_pipeline_id, p_stage, p_owner_id)
    ), filtered as (
      select activity.*, scoped.case_id, scoped.company_name, scoped.project_title,
        coalesce(profile.display_name, profile.email::text, 'System') actor_name
      from public.crm_ticket_activity activity
      join scoped on scoped.ticket_id = activity.ticket_id
      left join public.profiles profile on profile.id = activity.actor_user_id
      where activity.created_at >= from_utc and activity.created_at < to_utc
    )
    select coalesce(jsonb_agg(item), '[]'::jsonb) into records from (
      select jsonb_build_object(
        'recordType','activity','id',id,'ticketId',ticket_id,'ticketNumber',upper(substr(replace(ticket_id::text, '-', ''), 1, 8)),
        'caseId',case_id,'companyName',company_name,'projectTitle',project_title,
        'action',action,'actorName',actor_name,'eventAt',created_at
      ) item
      from filtered
      order by
        case when sort_direction = 'asc' then created_at end asc,
        case when sort_direction = 'desc' then created_at end desc,
        id
      offset (page_number - 1) * page_size limit page_size
    ) page_rows;
  end if;

  return jsonb_build_object(
    'reportKey', report_key,
    'timezone', report_timezone,
    'columns', columns,
    'items', records,
    'total', total_count,
    'page', page_number,
    'pageSize', page_size,
    'pageCount', case when total_count = 0 then 0 else ceil(total_count::numeric / page_size)::integer end
  );
end;
$$;

revoke all on function public.crm_validate_report_query(date,date,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.crm_report_ticket_scope(timestamptz,uuid,text,uuid) from public, anon, authenticated;
revoke all on function public.get_crm_report_filter_options() from public, anon;
revoke all on function public.get_crm_reports_overview(date,date,uuid,text,uuid) from public, anon;
revoke all on function public.list_crm_report_records(text,date,date,uuid,text,uuid,text,text,integer,integer) from public, anon;

grant execute on function public.get_crm_report_filter_options() to authenticated;
grant execute on function public.get_crm_reports_overview(date,date,uuid,text,uuid) to authenticated;
grant execute on function public.list_crm_report_records(text,date,date,uuid,text,uuid,text,text,integer,integer) to authenticated;
