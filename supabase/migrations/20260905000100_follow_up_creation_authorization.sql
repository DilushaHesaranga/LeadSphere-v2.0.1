-- Restrict Follow Up creation to the Ticket's responsible manager or an active
-- assignee, and to the four business roles that perform customer follow-ups.

create or replace function public.create_crm_follow_up(
  p_ticket_id uuid,
  p_scheduled_at timestamptz,
  p_type text,
  p_purpose text default null,
  p_recurring boolean default false,
  p_frequency text default null,
  p_client_request_id uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  series_id uuid;
  occurrence_id uuid;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  select * into ticket_record
  from public.crm_tickets
  where id = p_ticket_id and deleted_at is null
  for update;

  if ticket_record.id is null then
    raise exception 'Ticket not found';
  end if;

  if actor <> ticket_record.responsible_manager_id
     and not exists (
       select 1
       from public.crm_ticket_assignments assignment
       where assignment.ticket_id = ticket_record.id
         and assignment.user_id = actor
         and assignment.removed_at is null
     ) then
    raise exception 'You are not assigned to this ticket.';
  end if;

  if not public.crm_user_has_role(actor, array[
    'sales_executive',
    'marketing_executive',
    'sales_manager',
    'delivery_manager'
  ]) then
    raise exception 'Your role does not support this action.';
  end if;

  if ticket_record.status <> 'active' then
    raise exception 'Only active Tickets accept Follow Ups';
  end if;
  if p_client_request_id is null then
    raise exception 'A request identifier is required';
  end if;
  perform public.crm_validate_follow_up_input(
    p_scheduled_at,
    p_type,
    p_purpose,
    p_recurring,
    p_frequency
  );

  perform pg_advisory_xact_lock(
    hashtextextended(actor::text || ':' || p_client_request_id::text, 0)
  );
  select occurrence.id into occurrence_id
  from public.crm_follow_up_occurrences occurrence
  where occurrence.created_by_user_id = actor
    and occurrence.client_request_id = p_client_request_id;

  if occurrence_id is not null then
    return jsonb_build_object('id', occurrence_id, 'duplicate', true);
  end if;

  if coalesce(p_recurring, false) then
    insert into public.crm_follow_up_series (
      ticket_id,
      follow_up_type,
      purpose,
      start_at,
      recurrence_frequency,
      created_by_user_id
    ) values (
      p_ticket_id,
      upper(p_type),
      nullif(trim(p_purpose), ''),
      p_scheduled_at,
      upper(p_frequency),
      actor
    ) returning id into series_id;
  end if;

  insert into public.crm_follow_up_occurrences (
    ticket_id,
    series_id,
    scheduled_at,
    follow_up_type,
    purpose,
    created_by_user_id,
    client_request_id
  ) values (
    p_ticket_id,
    series_id,
    p_scheduled_at,
    upper(p_type),
    nullif(trim(p_purpose), ''),
    actor,
    p_client_request_id
  ) returning id into occurrence_id;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (
    p_ticket_id,
    'FOLLOW_UP_CREATED',
    actor,
    jsonb_build_object('followUpId', occurrence_id, 'seriesId', series_id)
  );

  return jsonb_build_object(
    'id', occurrence_id,
    'seriesId', series_id,
    'duplicate', false
  );
end;
$$;

create or replace function public.search_crm_follow_up_tickets(
  p_search text default '',
  p_limit integer default 30
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  if actor is null then
    raise exception 'Authentication required';
  end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into result
  from (
    select jsonb_build_object(
      'id', ticket.id,
      'number', left(ticket.id::text, 8),
      'title', ticket.project_title,
      'companyName', crm_case.company_name,
      'department', ticket.current_department,
      'stage', ticket.stage
    ) item
    from public.crm_tickets ticket
    join public.crm_cases crm_case
      on crm_case.id = ticket.case_id
      and crm_case.deleted_at is null
    where ticket.deleted_at is null
      and ticket.status = 'active'
      and public.crm_user_has_role(actor, array[
        'sales_executive',
        'marketing_executive',
        'sales_manager',
        'delivery_manager'
      ])
      and (
        ticket.responsible_manager_id = actor
        or exists (
          select 1
          from public.crm_ticket_assignments assignment
          where assignment.ticket_id = ticket.id
            and assignment.user_id = actor
            and assignment.removed_at is null
        )
      )
      and (
        trim(coalesce(p_search, '')) = ''
        or ticket.project_title ilike '%' || trim(p_search) || '%'
        or crm_case.company_name ilike '%' || trim(p_search) || '%'
        or ticket.id::text ilike trim(p_search) || '%'
      )
    order by ticket.updated_at desc
    limit least(greatest(p_limit, 1), 50)
  ) tickets;

  return result;
end;
$$;

revoke all on function public.create_crm_follow_up(uuid, timestamptz, text, text, boolean, text, uuid)
  from public, anon;
revoke all on function public.search_crm_follow_up_tickets(text, integer)
  from public, anon;

grant execute on function public.create_crm_follow_up(uuid, timestamptz, text, text, boolean, text, uuid)
  to authenticated;
grant execute on function public.search_crm_follow_up_tickets(text, integer)
  to authenticated;
