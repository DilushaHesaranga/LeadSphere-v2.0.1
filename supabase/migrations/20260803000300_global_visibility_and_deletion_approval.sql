-- All active business roles can read all Cases and Tickets. Deletion becomes a
-- manager-approved request rather than a direct client action.

insert into public.permissions (slug, description) values
  ('cases.delete.request', 'Request manager approval to archive a Case'),
  ('tickets.delete.request', 'Request manager approval to archive a Ticket')
on conflict (slug) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, access_scope)
select role.id, permission.id, 'company'::public.data_access_scope
from public.roles role
join public.permissions permission on permission.slug = any(array['cases.read', 'tickets.read'])
where role.slug = any(array[
  'marketing_executive', 'sales_executive', 'marketing_manager', 'sales_manager',
  'delivery_manager', 'leadership', 'viewer', 'system_admin'
])
on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;

insert into public.role_permissions (role_id, permission_id, access_scope)
select role.id, permission.id, 'company'::public.data_access_scope
from public.roles role
join public.permissions permission on permission.slug = any(array['cases.delete.request', 'tickets.delete.request'])
where role.slug = any(array[
  'marketing_executive', 'sales_executive', 'marketing_manager', 'sales_manager',
  'delivery_manager', 'leadership', 'system_admin'
])
on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;

alter table public.crm_ticket_permission_requests
  add column if not exists case_id uuid references public.crm_cases(id) on delete cascade;

alter table public.crm_ticket_permission_requests alter column ticket_id drop not null;
alter table public.crm_ticket_permission_requests alter column current_department drop not null;
alter table public.crm_ticket_permission_requests drop constraint if exists crm_ticket_requests_type;
alter table public.crm_ticket_permission_requests drop constraint if exists crm_ticket_requests_shape;

alter table public.crm_ticket_permission_requests
  add constraint crm_ticket_requests_type check (
    request_type in ('ASSIGN_TO_ME', 'POST_TICKET', 'DELETE_TICKET', 'DELETE_CASE')
  );

alter table public.crm_ticket_permission_requests
  add constraint crm_ticket_requests_shape check (
    (
      request_type = 'ASSIGN_TO_ME' and ticket_id is not null and case_id is null
      and current_department is not null and requested_assignee_id is not null
      and requested_department is null
    ) or (
      request_type = 'POST_TICKET' and ticket_id is not null and case_id is null
      and current_department is not null and requested_department is not null
      and requested_department <> current_department and requested_assignee_id is null
    ) or (
      request_type = 'DELETE_TICKET' and ticket_id is not null and case_id is null
      and current_department is not null and requested_department is null
      and requested_assignee_id is null
    ) or (
      request_type = 'DELETE_CASE' and ticket_id is null and case_id is not null
      and requested_department is null and requested_assignee_id is null
    )
  );

create index if not exists crm_ticket_requests_case_idx
  on public.crm_ticket_permission_requests (case_id, created_at desc)
  where case_id is not null;
create unique index if not exists crm_ticket_requests_one_pending_ticket_delete
  on public.crm_ticket_permission_requests (ticket_id)
  where request_type = 'DELETE_TICKET' and status = 'PENDING';
create unique index if not exists crm_ticket_requests_one_pending_case_delete
  on public.crm_ticket_permission_requests (case_id)
  where request_type = 'DELETE_CASE' and status = 'PENDING';

create or replace function public.request_crm_ticket_deletion(
  p_ticket_id uuid,
  p_request_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  request_id uuid;
begin
  if actor is null
     or not public.current_user_has_permission('tickets.delete.request')
     or not public.crm_can_access_ticket(p_ticket_id, 'tickets.read')
  then raise exception 'Permission denied'; end if;

  select * into ticket_record
  from public.crm_tickets
  where id = p_ticket_id and deleted_at is null
  for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if exists (
    select 1 from public.crm_ticket_permission_requests
    where ticket_id = p_ticket_id and request_type = 'DELETE_TICKET' and status = 'PENDING'
  ) then raise exception 'A Delete Ticket request is already pending'; end if;

  insert into public.crm_ticket_permission_requests (
    ticket_id, request_type, requested_by_user_id, assigned_manager_id,
    current_department, request_note
  ) values (
    p_ticket_id, 'DELETE_TICKET', actor, ticket_record.responsible_manager_id,
    ticket_record.current_department, nullif(trim(p_request_note), '')
  ) returning id into request_id;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (p_ticket_id, 'TICKET_DELETE_REQUESTED', actor, jsonb_build_object('requestId', request_id));
  return jsonb_build_object('id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.request_crm_case_deletion(
  p_case_id uuid,
  p_assigned_manager_id uuid,
  p_request_note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  request_id uuid;
  case_record public.crm_cases%rowtype;
begin
  if actor is null
     or not public.current_user_has_permission('cases.delete.request')
     or not public.crm_can_access_case(p_case_id, 'cases.read')
  then raise exception 'Permission denied'; end if;

  select * into case_record from public.crm_cases
  where id = p_case_id and deleted_at is null for update;
  if case_record.id is null then raise exception 'Case not found'; end if;
  if exists (select 1 from public.crm_tickets where case_id = p_case_id and deleted_at is null) then
    raise exception 'Archive every Ticket through manager approval before requesting Case deletion';
  end if;
  if p_assigned_manager_id is null
     or not public.crm_user_has_role(p_assigned_manager_id, array[
       'marketing_manager', 'sales_manager', 'delivery_manager', 'leadership', 'system_admin'
     ])
  then raise exception 'Select an authorised manager to review this Case deletion'; end if;
  if exists (
    select 1 from public.crm_ticket_permission_requests
    where case_id = p_case_id and request_type = 'DELETE_CASE' and status = 'PENDING'
  ) then raise exception 'A Delete Case request is already pending'; end if;

  insert into public.crm_ticket_permission_requests (
    case_id, request_type, requested_by_user_id, assigned_manager_id, request_note
  ) values (
    p_case_id, 'DELETE_CASE', actor, p_assigned_manager_id, nullif(trim(p_request_note), '')
  ) returning id into request_id;

  insert into public.crm_case_activity (case_id, action, actor_user_id, details)
  values (p_case_id, 'CASE_DELETE_REQUESTED', actor, jsonb_build_object('requestId', request_id));
  return jsonb_build_object('id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.list_crm_ticket_requests(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); scope public.data_access_scope;
begin
  scope := public.current_user_permission_scope('tickets.requests.review');
  if scope is null then raise exception 'Permission denied'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', request.id,
      'ticketId', request.ticket_id,
      'ticketTitle', case when request.request_type = 'DELETE_CASE' then company.company_name || ' Case' else ticket.project_title end,
      'caseId', company.id,
      'companyName', company.company_name,
      'requestType', request.request_type,
      'requesterName', coalesce(requester.display_name, requester.email::text),
      'requestedByUserId', request.requested_by_user_id,
      'assignedManagerId', request.assigned_manager_id,
      'responsibleManagerName', coalesce(manager.display_name, manager.email::text),
      'currentDepartment', request.current_department,
      'requestedDepartment', request.requested_department,
      'requestedAssigneeId', request.requested_assignee_id,
      'requestedAssigneeName', coalesce(assignee.display_name, assignee.email::text),
      'requestNote', request.request_note,
      'status', request.status,
      'managerComment', request.manager_comment,
      'managerModifiedData', request.manager_modified_data,
      'createdAt', request.created_at,
      'reviewedAt', request.reviewed_at
    ) order by request.created_at desc), '[]'::jsonb)
    from public.crm_ticket_permission_requests request
    left join public.crm_tickets ticket on ticket.id = request.ticket_id
    join public.crm_cases company on company.id = coalesce(request.case_id, ticket.case_id)
    join public.profiles requester on requester.id = request.requested_by_user_id
    join public.profiles manager on manager.id = request.assigned_manager_id
    left join public.profiles assignee on assignee.id = request.requested_assignee_id
    where (p_status is null or p_status = '' or upper(p_status) = 'ALL' or request.status = upper(p_status))
      and (scope = 'company' or request.assigned_manager_id = actor)
  );
end;
$$;

create or replace function public.review_crm_ticket_request(
  p_request_id uuid, p_decision text, p_manager_comment text default null,
  p_modified_assignee_id uuid default null, p_modified_department text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  scope public.data_access_scope;
  request_record public.crm_ticket_permission_requests%rowtype;
  decision text := upper(p_decision);
  modified_data jsonb := '{}'::jsonb;
  applied_assignee uuid;
  applied_department text;
  activity_action text;
begin
  scope := public.current_user_permission_scope('tickets.requests.review');
  if scope is null then raise exception 'Permission denied'; end if;
  if decision not in ('APPROVED','REJECTED','MODIFIED') then raise exception 'Select Accept, Reject, or Modify'; end if;

  select * into request_record
  from public.crm_ticket_permission_requests where id = p_request_id for update;
  if request_record.id is null then raise exception 'Permission request not found'; end if;
  if request_record.status <> 'PENDING' then raise exception 'This request has already been reviewed'; end if;
  if scope <> 'company' and request_record.assigned_manager_id <> actor then
    raise exception 'This request is assigned to another manager';
  end if;
  if request_record.requested_by_user_id = actor
     and not public.crm_user_has_role(actor, array['marketing_manager','sales_manager','delivery_manager','leadership','system_admin'])
  then raise exception 'You cannot approve your own request'; end if;
  if request_record.request_type in ('DELETE_TICKET', 'DELETE_CASE') and decision = 'MODIFIED' then
    raise exception 'Deletion requests can only be accepted or rejected';
  end if;

  if decision = 'MODIFIED' then
    if request_record.request_type = 'ASSIGN_TO_ME' then
      applied_assignee := p_modified_assignee_id;
      if applied_assignee is null or not exists (
        select 1 from public.profiles where id = applied_assignee and status = 'active'
      ) then raise exception 'Select a valid modified assignee'; end if;
      modified_data := jsonb_build_object(
        'originalAssigneeId', request_record.requested_assignee_id,
        'approvedAssigneeId', applied_assignee
      );
    else
      applied_department := p_modified_department;
      if applied_department is null or applied_department = request_record.current_department
         or not exists (select 1 from public.crm_departments where slug = applied_department and is_active)
      then raise exception 'Select a valid modified destination department'; end if;
      modified_data := jsonb_build_object(
        'originalDepartment', request_record.requested_department,
        'approvedDepartment', applied_department
      );
    end if;
  elsif decision = 'APPROVED' then
    applied_assignee := request_record.requested_assignee_id;
    applied_department := request_record.requested_department;
  end if;

  if decision in ('APPROVED','MODIFIED') and request_record.request_type = 'ASSIGN_TO_ME' then
    insert into public.crm_ticket_assignments (
      ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at
    ) values (
      request_record.ticket_id, applied_assignee, actor, now(), null
    ) on conflict (ticket_id, user_id) do update set
      assigned_by_user_id = excluded.assigned_by_user_id,
      assigned_at = now(),
      removed_at = null;
  elsif decision in ('APPROVED','MODIFIED') and request_record.request_type = 'POST_TICKET' then
    update public.crm_tickets set current_department = applied_department
    where id = request_record.ticket_id;
  elsif decision = 'APPROVED' and request_record.request_type = 'DELETE_TICKET' then
    update public.crm_tickets set
      status = 'archived', deleted_at = now(), deleted_by_user_id = actor
    where id = request_record.ticket_id and deleted_at is null;
    if not found then raise exception 'Ticket has already been archived'; end if;
  elsif decision = 'APPROVED' and request_record.request_type = 'DELETE_CASE' then
    if exists (
      select 1 from public.crm_tickets
      where case_id = request_record.case_id and deleted_at is null
    ) then raise exception 'This Case still contains Tickets'; end if;
    update public.crm_cases set deleted_at = now(), deleted_by_user_id = actor
    where id = request_record.case_id and deleted_at is null;
    if not found then raise exception 'Case has already been archived'; end if;
  end if;

  update public.crm_ticket_permission_requests set
    status = decision,
    manager_comment = nullif(trim(p_manager_comment), ''),
    manager_modified_data = modified_data,
    reviewed_at = now(),
    reviewed_by_user_id = actor
  where id = p_request_id;

  if request_record.request_type = 'DELETE_CASE' then
    insert into public.crm_case_activity (case_id, action, actor_user_id, details)
    values (
      request_record.case_id,
      case when decision = 'APPROVED' then 'CASE_DELETE_APPROVED' else 'CASE_DELETE_REJECTED' end,
      actor,
      jsonb_build_object('requestId', p_request_id)
    );
  else
    activity_action := case request_record.request_type
      when 'ASSIGN_TO_ME' then 'ASSIGNMENT_' || decision
      when 'POST_TICKET' then 'TRANSFER_' || decision
      when 'DELETE_TICKET' then 'TICKET_DELETE_' || decision
    end;
    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (
      request_record.ticket_id,
      activity_action,
      actor,
      jsonb_build_object('requestId', p_request_id) || modified_data
    );
  end if;

  return jsonb_build_object(
    'id', p_request_id,
    'status', decision,
    'ticketId', request_record.ticket_id,
    'caseId', request_record.case_id
  );
end;
$$;

drop policy if exists crm_requests_read on public.crm_ticket_permission_requests;
create policy crm_requests_read on public.crm_ticket_permission_requests for select to authenticated using (
  requested_by_user_id = (select auth.uid())
  or (
    public.current_user_has_permission('tickets.requests.review')
    and (
      assigned_manager_id = (select auth.uid())
      or public.current_user_permission_scope('tickets.requests.review') = 'company'
    )
  )
);

revoke all on function public.request_crm_ticket_deletion(uuid, text) from public, anon;
revoke all on function public.request_crm_case_deletion(uuid, uuid, text) from public, anon;
grant execute on function public.request_crm_ticket_deletion(uuid, text) to authenticated;
grant execute on function public.request_crm_case_deletion(uuid, uuid, text) to authenticated;

-- Direct archive RPCs are retained for service-role maintenance but can no
-- longer be invoked by browser clients. Managers decide through review RPCs.
revoke execute on function public.archive_crm_ticket(uuid) from authenticated;
revoke execute on function public.archive_crm_case(uuid) from authenticated;
