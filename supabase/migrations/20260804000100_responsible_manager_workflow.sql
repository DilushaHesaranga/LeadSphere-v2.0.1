-- Restrict operational ownership to Sales and Delivery Managers, make manager
-- actions direct, and move approved Sales/Delivery transfers into Customers.

create or replace function public.crm_is_eligible_responsible_manager(
  p_user_id uuid,
  p_department text default null
) returns boolean language sql stable security definer set search_path = '' as $$
  select p_user_id is not null and exists (
    select 1
    from public.profiles profile
    join public.user_roles user_role on user_role.user_id = profile.id and user_role.status = 'active'
    join public.roles role on role.id = user_role.role_id
    where profile.id = p_user_id
      and profile.status = 'active'
      and role.slug = case
        when p_department = 'sales' then 'sales_manager'
        when p_department = 'delivery' then 'delivery_manager'
        else role.slug
      end
      and role.slug = any(array['sales_manager', 'delivery_manager'])
  );
$$;

create or replace function public.crm_resolve_manager(p_department text, p_requested uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  resolved uuid;
  candidate_count integer;
  expected_role text := case
    when p_department = 'sales' then 'Sales Manager'
    when p_department = 'delivery' then 'Delivery Manager'
    else 'Sales Manager or Delivery Manager'
  end;
begin
  if p_requested is not null then
    if not public.crm_is_eligible_responsible_manager(p_requested, p_department) then
      raise exception 'Select an active % as the responsible manager for the % department', expected_role, initcap(p_department);
    end if;
    return p_requested;
  end if;

  select department_manager.manager_user_id into resolved
  from public.crm_department_managers department_manager
  where department_manager.department_slug = p_department
    and public.crm_is_eligible_responsible_manager(department_manager.manager_user_id, p_department)
  order by department_manager.created_at
  limit 1;

  if resolved is not null then return resolved; end if;

  select min(profile.id::text)::uuid, count(distinct profile.id)
  into resolved, candidate_count
  from public.profiles profile
  where public.crm_is_eligible_responsible_manager(profile.id, p_department);

  if candidate_count = 1 then return resolved; end if;
  if candidate_count = 0 then
    raise exception 'No eligible % is configured for the % department', expected_role, initcap(p_department);
  end if;
  raise exception 'Select a responsible % for the % department', expected_role, initcap(p_department);
end;
$$;

-- Invalid mappings are never used. Removing them prevents stale configuration
-- from appearing in the creation form without rewriting historical Tickets.
delete from public.crm_department_managers mapping
where not public.crm_is_eligible_responsible_manager(mapping.manager_user_id, mapping.department_slug);

create or replace function public.crm_validate_ticket_responsible_manager()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Preserve readable legacy rows. Enforce eligibility whenever ownership is
  -- first assigned or the department/manager relationship is changed.
  if tg_op = 'INSERT' then
    if not public.crm_is_eligible_responsible_manager(new.responsible_manager_id, new.current_department) then
      raise exception 'The responsible manager must be an active manager eligible for the Ticket department';
    end if;
  elsif new.current_department is distinct from old.current_department
     or new.responsible_manager_id is distinct from old.responsible_manager_id
  then
    if not public.crm_is_eligible_responsible_manager(new.responsible_manager_id, new.current_department) then
      raise exception 'The responsible manager must be an active manager eligible for the Ticket department';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_tickets_validate_responsible_manager on public.crm_tickets;
create trigger crm_tickets_validate_responsible_manager
before insert or update on public.crm_tickets
for each row execute function public.crm_validate_ticket_responsible_manager();

create or replace function public.get_crm_reference_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return jsonb_build_object(
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by sort_order), '[]'::jsonb) from public.crm_departments where is_active),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'businessArea', business_area) order by sort_order), '[]'::jsonb) from public.crm_ticket_stages where is_active),
    'managers', (select coalesce(jsonb_agg(manager order by manager ->> 'name'), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', profile.id,
        'name', coalesce(profile.display_name, profile.email::text),
        'email', profile.email::text,
        'roleSlug', min(role.slug)
      ) manager
      from public.profiles profile
      join public.user_roles user_role on user_role.user_id = profile.id and user_role.status = 'active'
      join public.roles role on role.id = user_role.role_id
      where profile.status = 'active' and role.slug = any(array['sales_manager', 'delivery_manager'])
      group by profile.id, profile.display_name, profile.email
    ) eligible_managers),
    'assignees', case when public.current_user_has_permission('tickets.requests.review') then (
      select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb) from (
        select distinct jsonb_build_object('id', profile.id, 'name', coalesce(profile.display_name, profile.email::text)) item
        from public.profiles profile
        join public.user_roles user_role on user_role.user_id = profile.id
        join public.roles role on role.id = user_role.role_id
        where profile.status = 'active' and user_role.status = 'active'
          and role.slug = any(array['marketing_executive','sales_executive','marketing_manager','sales_manager','delivery_manager','leadership'])
      ) active_assignees
    ) else '[]'::jsonb end,
    'departmentManagers', (
      select coalesce(jsonb_agg(jsonb_build_object('department', department_slug, 'managerId', manager_user_id)), '[]'::jsonb)
      from public.crm_department_managers mapping
      where public.crm_is_eligible_responsible_manager(mapping.manager_user_id, mapping.department_slug)
    )
  );
end;
$$;

create or replace function public.crm_apply_ticket_transfer(
  p_ticket_id uuid,
  p_destination text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ticket_record public.crm_tickets%rowtype;
  destination_manager uuid;
  destination_stage text;
  destination_area text;
begin
  select * into ticket_record from public.crm_tickets
  where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can be posted'; end if;
  if p_destination = ticket_record.current_department then raise exception 'Select a different destination department'; end if;
  if not exists (select 1 from public.crm_departments where slug = p_destination and is_active) then
    raise exception 'Select a valid destination department';
  end if;

  destination_manager := case
    when public.crm_is_eligible_responsible_manager(ticket_record.responsible_manager_id, p_destination)
      then ticket_record.responsible_manager_id
    else public.crm_resolve_manager(p_destination, null)
  end;
  destination_stage := ticket_record.stage;
  select stage.business_area into destination_area
  from public.crm_ticket_stages stage where stage.slug = destination_stage;
  if p_destination in ('sales', 'delivery') and destination_area = 'leads' then
    destination_stage := 'qualified';
    destination_area := 'customers';
  end if;

  update public.crm_tickets set
    current_department = p_destination,
    responsible_manager_id = destination_manager,
    stage = destination_stage
  where id = p_ticket_id;

  return jsonb_build_object(
    'ticketId', p_ticket_id,
    'department', p_destination,
    'stage', destination_stage,
    'businessArea', destination_area,
    'responsibleManagerId', destination_manager
  );
end;
$$;

create or replace function public.request_crm_ticket_assignment(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype; request_id uuid;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.create') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets accept assignments'; end if;
  if exists (select 1 from public.crm_ticket_assignments where ticket_id = p_ticket_id and user_id = actor and removed_at is null) then raise exception 'You are already assigned to this Ticket'; end if;

  if public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.review') then
    insert into public.crm_ticket_assignments (ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at)
    values (p_ticket_id, actor, actor, now(), null)
    on conflict (ticket_id, user_id) do update set assigned_by_user_id = actor, assigned_at = now(), removed_at = null;
    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (p_ticket_id, 'ASSIGNMENT_DIRECT', actor, jsonb_build_object('assigneeId', actor));
    return jsonb_build_object('mode', 'direct', 'status', 'COMPLETED', 'ticketId', p_ticket_id);
  end if;

  if not public.crm_is_eligible_responsible_manager(ticket_record.responsible_manager_id, ticket_record.current_department) then
    raise exception 'This Ticket needs an eligible Sales Manager or Delivery Manager before an assignment can be requested';
  end if;
  if ticket_record.responsible_manager_id = actor then raise exception 'A request cannot be assigned to its requester'; end if;
  if exists (select 1 from public.crm_ticket_permission_requests where ticket_id = p_ticket_id and requested_by_user_id = actor and request_type = 'ASSIGN_TO_ME' and status = 'PENDING') then raise exception 'An Assign to Me request is already pending'; end if;
  insert into public.crm_ticket_permission_requests (ticket_id, request_type, requested_by_user_id, assigned_manager_id, current_department, requested_assignee_id)
  values (p_ticket_id, 'ASSIGN_TO_ME', actor, ticket_record.responsible_manager_id, ticket_record.current_department, actor) returning id into request_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values (p_ticket_id, 'ASSIGNMENT_REQUESTED', actor, jsonb_build_object('requestId', request_id));
  return jsonb_build_object('mode', 'requested', 'id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.request_crm_ticket_post(p_ticket_id uuid, p_requested_department text, p_request_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype; request_id uuid; transfer jsonb;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.create') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can be posted'; end if;
  if p_requested_department = ticket_record.current_department then raise exception 'Select a different destination department'; end if;
  if not exists (select 1 from public.crm_departments where slug = p_requested_department and is_active) then raise exception 'Select a valid destination department'; end if;
  if exists (select 1 from public.crm_ticket_permission_requests where ticket_id = p_ticket_id and request_type = 'POST_TICKET' and status = 'PENDING') then raise exception 'A Post Ticket request is already pending; review it before transferring the Ticket directly'; end if;

  if public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.review') then
    transfer := public.crm_apply_ticket_transfer(p_ticket_id, p_requested_department);
    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (p_ticket_id, 'TRANSFER_DIRECT', actor, transfer - 'ticketId');
    return jsonb_build_object('mode', 'direct', 'status', 'COMPLETED') || transfer;
  end if;

  if not public.crm_is_eligible_responsible_manager(ticket_record.responsible_manager_id, ticket_record.current_department) then
    raise exception 'This Ticket needs an eligible Sales Manager or Delivery Manager before a transfer can be requested';
  end if;
  if ticket_record.responsible_manager_id = actor then raise exception 'A request cannot be assigned to its requester'; end if;
  -- Validate the destination manager now so approval can never strand the Ticket.
  perform public.crm_resolve_manager(p_requested_department, null);
  insert into public.crm_ticket_permission_requests (ticket_id, request_type, requested_by_user_id, assigned_manager_id, current_department, requested_department, request_note)
  values (p_ticket_id, 'POST_TICKET', actor, ticket_record.responsible_manager_id, ticket_record.current_department, p_requested_department, nullif(trim(p_request_note), '')) returning id into request_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values (p_ticket_id, 'TRANSFER_REQUESTED', actor, jsonb_build_object('requestId', request_id, 'requestedDepartment', p_requested_department));
  return jsonb_build_object('mode', 'requested', 'id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.request_crm_ticket_deletion(p_ticket_id uuid, p_request_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype; request_id uuid;
begin
  if actor is null or not public.current_user_has_permission('tickets.delete.request') or not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if exists (select 1 from public.crm_ticket_permission_requests where ticket_id = p_ticket_id and request_type = 'DELETE_TICKET' and status = 'PENDING') then raise exception 'A Delete Ticket request is already pending; review it before deleting the Ticket directly'; end if;

  if public.crm_can_access_ticket(p_ticket_id, 'tickets.delete') then
    update public.crm_tickets set status = 'archived', deleted_at = now(), deleted_by_user_id = actor where id = p_ticket_id;
    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (p_ticket_id, 'TICKET_DELETE_DIRECT', actor, jsonb_build_object('reason', nullif(trim(p_request_note), '')));
    return jsonb_build_object('mode', 'direct', 'status', 'COMPLETED', 'ticketId', p_ticket_id, 'archived', true);
  end if;

  if not public.crm_is_eligible_responsible_manager(ticket_record.responsible_manager_id, ticket_record.current_department) then
    raise exception 'This Ticket needs an eligible Sales Manager or Delivery Manager before deletion can be requested';
  end if;
  if ticket_record.responsible_manager_id = actor then raise exception 'A request cannot be assigned to its requester'; end if;
  insert into public.crm_ticket_permission_requests (ticket_id, request_type, requested_by_user_id, assigned_manager_id, current_department, request_note)
  values (p_ticket_id, 'DELETE_TICKET', actor, ticket_record.responsible_manager_id, ticket_record.current_department, nullif(trim(p_request_note), '')) returning id into request_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (p_ticket_id, 'TICKET_DELETE_REQUESTED', actor, jsonb_build_object('requestId', request_id));
  return jsonb_build_object('mode', 'requested', 'id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.request_crm_case_deletion(p_case_id uuid, p_assigned_manager_id uuid, p_request_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); request_id uuid; case_record public.crm_cases%rowtype;
begin
  if actor is null or not public.current_user_has_permission('cases.delete.request') or not public.crm_can_access_case(p_case_id, 'cases.read') then raise exception 'Permission denied'; end if;
  select * into case_record from public.crm_cases where id = p_case_id and deleted_at is null for update;
  if case_record.id is null then raise exception 'Case not found'; end if;
  if exists (select 1 from public.crm_tickets where case_id = p_case_id and deleted_at is null) then raise exception 'Archive every Ticket through manager approval before requesting Case deletion'; end if;
  if not public.crm_is_eligible_responsible_manager(p_assigned_manager_id, null) then raise exception 'Select an active Sales Manager or Delivery Manager to review this Case deletion'; end if;
  if p_assigned_manager_id = actor then raise exception 'A request cannot be assigned to its requester'; end if;
  if exists (select 1 from public.crm_ticket_permission_requests where case_id = p_case_id and request_type = 'DELETE_CASE' and status = 'PENDING') then raise exception 'A Delete Case request is already pending'; end if;
  insert into public.crm_ticket_permission_requests (case_id, request_type, requested_by_user_id, assigned_manager_id, request_note)
  values (p_case_id, 'DELETE_CASE', actor, p_assigned_manager_id, nullif(trim(p_request_note), '')) returning id into request_id;
  insert into public.crm_case_activity (case_id, action, actor_user_id, details)
  values (p_case_id, 'CASE_DELETE_REQUESTED', actor, jsonb_build_object('requestId', request_id));
  return jsonb_build_object('mode', 'requested', 'id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.review_crm_ticket_request(
  p_request_id uuid, p_decision text, p_manager_comment text default null,
  p_modified_assignee_id uuid default null, p_modified_department text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid()); scope public.data_access_scope;
  request_record public.crm_ticket_permission_requests%rowtype;
  decision text := upper(p_decision); modified_data jsonb := '{}'::jsonb;
  applied_assignee uuid; applied_department text; activity_action text; transfer jsonb := '{}'::jsonb;
begin
  scope := public.current_user_permission_scope('tickets.requests.review');
  if scope is null then raise exception 'Permission denied'; end if;
  if decision not in ('APPROVED','REJECTED','MODIFIED') then raise exception 'Select Accept, Reject, or Modify'; end if;
  select * into request_record from public.crm_ticket_permission_requests where id = p_request_id for update;
  if request_record.id is null then raise exception 'Permission request not found'; end if;
  if request_record.status <> 'PENDING' then raise exception 'This request has already been reviewed'; end if;
  if scope <> 'company' and request_record.assigned_manager_id <> actor then raise exception 'This request is assigned to another manager'; end if;
  if request_record.requested_by_user_id = actor then raise exception 'You cannot review your own request'; end if;
  if request_record.request_type in ('DELETE_TICKET','DELETE_CASE') and decision = 'MODIFIED' then raise exception 'Deletion requests can only be accepted or rejected'; end if;

  if decision = 'MODIFIED' then
    if request_record.request_type = 'ASSIGN_TO_ME' then
      applied_assignee := p_modified_assignee_id;
      if applied_assignee is null or not exists (select 1 from public.profiles where id = applied_assignee and status = 'active') then raise exception 'Select a valid modified assignee'; end if;
      modified_data := jsonb_build_object('originalAssigneeId', request_record.requested_assignee_id, 'approvedAssigneeId', applied_assignee);
    else
      applied_department := p_modified_department;
      if applied_department is null or applied_department = request_record.current_department or not exists (select 1 from public.crm_departments where slug = applied_department and is_active) then raise exception 'Select a valid modified destination department'; end if;
      modified_data := jsonb_build_object('originalDepartment', request_record.requested_department, 'approvedDepartment', applied_department);
    end if;
  elsif decision = 'APPROVED' then
    applied_assignee := request_record.requested_assignee_id;
    applied_department := request_record.requested_department;
  end if;

  if decision in ('APPROVED','MODIFIED') and request_record.request_type = 'ASSIGN_TO_ME' then
    insert into public.crm_ticket_assignments (ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at)
    values (request_record.ticket_id, applied_assignee, actor, now(), null)
    on conflict (ticket_id, user_id) do update set assigned_by_user_id = actor, assigned_at = now(), removed_at = null;
  elsif decision in ('APPROVED','MODIFIED') and request_record.request_type = 'POST_TICKET' then
    transfer := public.crm_apply_ticket_transfer(request_record.ticket_id, applied_department);
    modified_data := modified_data || (transfer - 'ticketId');
  elsif decision = 'APPROVED' and request_record.request_type = 'DELETE_TICKET' then
    update public.crm_tickets set status = 'archived', deleted_at = now(), deleted_by_user_id = actor where id = request_record.ticket_id and deleted_at is null;
    if not found then raise exception 'Ticket has already been archived'; end if;
  elsif decision = 'APPROVED' and request_record.request_type = 'DELETE_CASE' then
    if exists (select 1 from public.crm_tickets where case_id = request_record.case_id and deleted_at is null) then raise exception 'This Case still contains Tickets'; end if;
    update public.crm_cases set deleted_at = now(), deleted_by_user_id = actor where id = request_record.case_id and deleted_at is null;
    if not found then raise exception 'Case has already been archived'; end if;
  end if;

  update public.crm_ticket_permission_requests set status = decision, manager_comment = nullif(trim(p_manager_comment), ''), manager_modified_data = modified_data, reviewed_at = now(), reviewed_by_user_id = actor where id = p_request_id;
  if request_record.request_type = 'DELETE_CASE' then
    insert into public.crm_case_activity (case_id, action, actor_user_id, details) values (request_record.case_id, case when decision = 'APPROVED' then 'CASE_DELETE_APPROVED' else 'CASE_DELETE_REJECTED' end, actor, jsonb_build_object('requestId', p_request_id));
  else
    activity_action := case request_record.request_type when 'ASSIGN_TO_ME' then 'ASSIGNMENT_' || decision when 'POST_TICKET' then 'TRANSFER_' || decision when 'DELETE_TICKET' then 'TICKET_DELETE_' || decision end;
    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values (request_record.ticket_id, activity_action, actor, jsonb_build_object('requestId', p_request_id) || modified_data);
  end if;
  return jsonb_build_object('id', p_request_id, 'status', decision, 'ticketId', request_record.ticket_id, 'caseId', request_record.case_id) || transfer;
end;
$$;

revoke all on function public.crm_is_eligible_responsible_manager(uuid, text) from public, anon, authenticated;
revoke all on function public.crm_apply_ticket_transfer(uuid, text) from public, anon, authenticated;
revoke all on function public.crm_validate_ticket_responsible_manager() from public, anon, authenticated;
grant execute on function public.get_crm_reference_data() to authenticated;
grant execute on function public.request_crm_ticket_assignment(uuid) to authenticated;
grant execute on function public.request_crm_ticket_post(uuid, text, text) to authenticated;
grant execute on function public.request_crm_ticket_deletion(uuid, text) to authenticated;
grant execute on function public.request_crm_case_deletion(uuid, uuid, text) to authenticated;
grant execute on function public.review_crm_ticket_request(uuid, text, text, uuid, text) to authenticated;
