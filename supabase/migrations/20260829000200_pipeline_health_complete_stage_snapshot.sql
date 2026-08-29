-- Pipeline Health is a complete current-stage snapshot. Open stages contribute
-- to active workload and ageing attention; Won/Lost stages provide outcome
-- context without being treated as overdue open work.

create or replace function public.get_crm_pipeline_health(
  p_as_of date,
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
  as_of_utc timestamptz;
  stage_series jsonb := '[]'::jsonb;
  visible_total bigint := 0;
  open_total bigint := 0;
  outcome_total bigint := 0;
  occupied_total bigint := 0;
  attention_total bigint := 0;
begin
  perform public.crm_validate_report_query(p_as_of, p_as_of, p_pipeline_id, p_stage, p_owner_id);
  as_of_utc := (p_as_of + 1)::timestamp at time zone report_timezone;

  with current_scope as materialized (
    select *
    from public.crm_report_ticket_scope(as_of_utc, p_pipeline_id, p_stage, p_owner_id)
  ), grouped as (
    select
      stage.pipeline_id,
      pipeline.name pipeline_name,
      stage.slug stage_slug,
      stage.name stage_name,
      stage.semantic_category stage_category,
      stage.probability,
      stage.sort_order,
      count(scoped.ticket_id) total,
      round(coalesce(avg(scoped.stage_age_seconds), 0) / 86400.0, 1) average_age_days
    from public.crm_ticket_stages stage
    join public.crm_pipelines pipeline
      on pipeline.id = stage.pipeline_id and pipeline.status = 'active'
    left join current_scope scoped
      on scoped.stage_slug = stage.slug
      and scoped.ticket_status = 'active'
    where stage.is_active
      and (p_pipeline_id is null or stage.pipeline_id = p_pipeline_id)
      and (p_stage is null or stage.slug = p_stage)
    group by stage.pipeline_id, pipeline.name, stage.slug, stage.name,
      stage.semantic_category, stage.probability, stage.sort_order
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'pipelineId', grouped.pipeline_id,
      'pipelineName', grouped.pipeline_name,
      'stage', grouped.stage_slug,
      'label', grouped.stage_name,
      'category', grouped.stage_category,
      'probability', grouped.probability,
      'count', grouped.total,
      'averageAgeDays', grouped.average_age_days
    ) order by grouped.pipeline_name, grouped.sort_order), '[]'::jsonb),
    coalesce(sum(grouped.total), 0),
    coalesce(sum(grouped.total) filter (where grouped.stage_category = 'open'), 0),
    coalesce(sum(grouped.total) filter (where grouped.stage_category in ('won', 'lost')), 0),
    count(*) filter (where grouped.total > 0),
    count(*) filter (
      where grouped.stage_category = 'open'
        and grouped.total > 0
        and grouped.average_age_days >= 14
    )
  into stage_series, visible_total, open_total, outcome_total, occupied_total, attention_total
  from grouped;

  return jsonb_build_object(
    'asOf', p_as_of,
    'total', visible_total,
    'activeTotal', open_total,
    'outcomeTotal', outcome_total,
    'occupiedStages', occupied_total,
    'attentionStages', attention_total,
    'stages', stage_series
  );
end;
$$;

revoke all on function public.get_crm_pipeline_health(date,uuid,text,uuid) from public, anon;
grant execute on function public.get_crm_pipeline_health(date,uuid,text,uuid) to authenticated;
