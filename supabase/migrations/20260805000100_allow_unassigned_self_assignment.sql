-- Let every user who can view a Ticket request assignment to themselves.
-- Other Ticket actions continue to use their existing, narrower permissions.

create or replace function public.request_crm_ticket_assignment(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  request_id uuid;
begin
  if actor is null or not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then
    raise exception 'Permission denied';
  end if;

  select * into ticket_record
  from public.crm_tickets
  where id = p_ticket_id and deleted_at is null
  for update;

  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets accept assignments'; end if;
  if exists (
    select 1 from public.crm_ticket_assignments
    where ticket_id = p_ticket_id and user_id = actor and removed_at is null
  ) then raise exception 'You are already assigned to this Ticket'; end if;

  if public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.review') then
    insert into public.crm_ticket_assignments
      (ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at)
    values (p_ticket_id, actor, actor, now(), null)
    on conflict (ticket_id, user_id) do update set
      assigned_by_user_id = actor,
      assigned_at = now(),
      removed_at = null;

    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (p_ticket_id, 'ASSIGNMENT_DIRECT', actor, jsonb_build_object('assigneeId', actor));

    return jsonb_build_object('mode', 'direct', 'status', 'COMPLETED', 'ticketId', p_ticket_id);
  end if;

  if not public.crm_is_eligible_responsible_manager(
    ticket_record.responsible_manager_id,
    ticket_record.current_department
  ) then
    raise exception 'This Ticket needs an eligible Sales Manager or Delivery Manager before an assignment can be requested';
  end if;
  if ticket_record.responsible_manager_id = actor then
    raise exception 'A request cannot be assigned to its requester';
  end if;
  if exists (
    select 1 from public.crm_ticket_permission_requests
    where ticket_id = p_ticket_id
      and requested_by_user_id = actor
      and request_type = 'ASSIGN_TO_ME'
      and status = 'PENDING'
  ) then raise exception 'An Assign to Me request is already pending'; end if;

  insert into public.crm_ticket_permission_requests
    (ticket_id, request_type, requested_by_user_id, assigned_manager_id, current_department, requested_assignee_id)
  values
    (p_ticket_id, 'ASSIGN_TO_ME', actor, ticket_record.responsible_manager_id, ticket_record.current_department, actor)
  returning id into request_id;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (p_ticket_id, 'ASSIGNMENT_REQUESTED', actor, jsonb_build_object('requestId', request_id));

  return jsonb_build_object('mode', 'requested', 'id', request_id, 'status', 'PENDING');
end;
$$;

revoke all on function public.request_crm_ticket_assignment(uuid) from public, anon;
grant execute on function public.request_crm_ticket_assignment(uuid) to authenticated;
