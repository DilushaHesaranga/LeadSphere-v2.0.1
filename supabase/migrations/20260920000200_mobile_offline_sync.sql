-- Atomic receipt + business operation: retries cannot repeat side effects.
create table public.crm_mobile_mutations (
  user_id uuid not null references auth.users(id) on delete cascade,
  mutation_id uuid not null,
  request jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id, mutation_id)
);
alter table public.crm_mobile_mutations enable row level security;
revoke all on public.crm_mobile_mutations from public, anon, authenticated;

create or replace function public.sync_crm_mobile_mutation(
  p_mutation_id uuid, p_operation text, p_payload jsonb,
  p_expected_updated_at timestamptz default null,
  p_expected_series_updated_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  req jsonb := jsonb_build_object('operation',p_operation,'payload',p_payload,'version',p_expected_updated_at,'seriesVersion',p_expected_series_updated_at);
  receipt public.crm_mobile_mutations%rowtype;
  occurrence public.crm_follow_up_occurrences%rowtype;
  series public.crm_follow_up_series%rowtype;
  result jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not exists(select 1 from public.profiles where id=actor and status='active') then raise exception 'Permission denied: account is disabled'; end if;
  if p_mutation_id is null then raise exception 'Mutation identifier required'; end if;
  if octet_length(p_payload::text) > 20000 then raise exception 'Payload too large'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':mobile:' || p_mutation_id::text,0));
  select * into receipt from public.crm_mobile_mutations where user_id=actor and mutation_id=p_mutation_id;
  if found then
    if receipt.request <> req then raise exception 'CONFLICT: Mutation identifier already used for different data'; end if;
    return receipt.response;
  end if;
  if p_operation in ('update_crm_follow_up','complete_crm_follow_up','cancel_crm_follow_up') then
    select * into occurrence from public.crm_follow_up_occurrences where id=(p_payload->>'p_follow_up_id')::uuid for update;
    if occurrence.id is null then raise exception 'Follow Up not found'; end if;
    if not public.crm_can_access_ticket(occurrence.ticket_id,'tickets.notes.create') then raise exception 'Permission denied'; end if;
    if p_expected_updated_at is null or occurrence.updated_at <> p_expected_updated_at then
      raise exception 'CONFLICT: Follow Up changed on the server. Your local change has been preserved.';
    end if;
    if occurrence.series_id is not null then
      select * into series from public.crm_follow_up_series where id=occurrence.series_id for update;
      if p_expected_series_updated_at is null or series.updated_at <> p_expected_series_updated_at then
        raise exception 'CONFLICT: Recurring series changed on the server. Your local change has been preserved.';
      end if;
    end if;
  end if;
  case p_operation
    when 'create_crm_follow_up' then
      result := public.create_crm_follow_up((p_payload->>'p_ticket_id')::uuid,(p_payload->>'p_scheduled_at')::timestamptz,p_payload->>'p_type',p_payload->>'p_purpose',coalesce((p_payload->>'p_recurring')::boolean,false),p_payload->>'p_frequency',p_mutation_id);
    when 'add_crm_ticket_note' then
      result := public.add_crm_ticket_note((p_payload->>'p_ticket_id')::uuid,p_payload->>'p_content');
    when 'update_crm_follow_up' then
      result := public.update_crm_follow_up(occurrence.id,(p_payload->>'p_scheduled_at')::timestamptz,p_payload->>'p_type',p_payload->>'p_purpose',p_payload->>'p_frequency');
    when 'complete_crm_follow_up' then result := public.complete_crm_follow_up(occurrence.id);
    when 'cancel_crm_follow_up' then result := public.cancel_crm_follow_up(occurrence.id);
    when 'stop_crm_follow_up_series' then
      select * into series from public.crm_follow_up_series where id=(p_payload->>'p_series_id')::uuid for update;
      if series.id is null then raise exception 'Recurring Follow Up not found'; end if;
      if not public.crm_can_access_ticket(series.ticket_id,'tickets.notes.create') then raise exception 'Permission denied'; end if;
      if p_expected_series_updated_at is null or series.updated_at <> p_expected_series_updated_at then
        raise exception 'CONFLICT: Recurring series changed on the server. Your local change has been preserved.';
      end if;
      result := public.stop_crm_follow_up_series(series.id);
    when 'move_crm_ticket_stage' then
      if p_payload->>'p_expected_version' is null then raise exception 'Ticket version required'; end if;
      result := public.move_crm_ticket_stage((p_payload->>'p_ticket_id')::uuid,(p_payload->>'p_pipeline_id')::uuid,p_payload->>'p_stage_slug',(p_payload->>'p_expected_version')::integer,'MOBILE',p_mutation_id);
    else raise exception 'Unsupported mobile operation';
  end case;
  insert into public.crm_mobile_mutations(user_id,mutation_id,request,response) values(actor,p_mutation_id,req,result);
  return result;
end;
$$;
revoke all on function public.sync_crm_mobile_mutation(uuid,text,jsonb,timestamptz,timestamptz) from public,anon;
grant execute on function public.sync_crm_mobile_mutation(uuid,text,jsonb,timestamptz,timestamptz) to authenticated;
