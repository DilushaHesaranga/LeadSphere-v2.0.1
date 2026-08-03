-- Tickets may have multiple active assignees. Managers can select the initial
-- assignees while creating a Ticket; later self-assignment requests continue to
-- add people without replacing existing assignments.

insert into public.role_permissions (role_id, permission_id, access_scope)
select role.id, permission.id, 'team'::public.data_access_scope
from public.roles role
join public.permissions permission
  on permission.slug = any (array['cases.create', 'tickets.create'])
where role.slug = 'delivery_manager'
on conflict (role_id, permission_id) do update
set access_scope = excluded.access_scope;

create or replace function public.crm_set_initial_ticket_assignees(
  p_ticket_id uuid,
  p_assignee_ids uuid[],
  p_actor uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  selected_ids uuid[] := coalesce(p_assignee_ids, array[]::uuid[]);
  distinct_ids uuid[];
begin
  select coalesce(array_agg(selected.user_id order by selected.user_id), array[]::uuid[])
  into distinct_ids
  from (
    select distinct value as user_id
    from unnest(selected_ids) as value
  ) selected;

  if cardinality(distinct_ids) = 0 then return; end if;
  if cardinality(distinct_ids) > 25 then raise exception 'A Ticket can have at most 25 assignees'; end if;
  if p_actor is null or not public.current_user_has_permission('tickets.requests.review') then
    raise exception 'Only a manager can select initial Ticket assignees';
  end if;
  if exists (select 1 from unnest(distinct_ids) as selected(user_id) where selected.user_id is null) then
    raise exception 'Select valid Ticket assignees';
  end if;
  if exists (
    select 1
    from unnest(distinct_ids) as selected(user_id)
    left join public.profiles profile on profile.id = selected.user_id
    where profile.id is null
      or profile.status <> 'active'
      or not public.crm_user_has_role(selected.user_id, array[
        'marketing_executive', 'sales_executive', 'marketing_manager',
        'sales_manager', 'delivery_manager', 'leadership'
      ])
  ) then
    raise exception 'One or more selected users cannot be assigned to Tickets';
  end if;

  insert into public.crm_ticket_assignments (
    ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at
  )
  select p_ticket_id, selected.user_id, p_actor, now(), null
  from unnest(distinct_ids) as selected(user_id)
  on conflict (ticket_id, user_id) do update
  set assigned_by_user_id = excluded.assigned_by_user_id,
      assigned_at = excluded.assigned_at,
      removed_at = null;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (
    p_ticket_id,
    'INITIAL_ASSIGNEES_ADDED',
    p_actor,
    jsonb_build_object('assigneeIds', to_jsonb(distinct_ids))
  );
end;
$$;

create or replace function public.create_crm_case_and_ticket_with_assignees(
  p_company_name text,
  p_project_title text,
  p_department text,
  p_stage text,
  p_responsible_manager_id uuid,
  p_contacts jsonb,
  p_assignee_ids uuid[] default array[]::uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  result := public.create_crm_case_and_ticket(
    p_company_name,
    p_project_title,
    p_department,
    p_stage,
    p_responsible_manager_id,
    p_contacts
  );
  perform public.crm_set_initial_ticket_assignees(
    (result ->> 'ticketId')::uuid,
    p_assignee_ids,
    actor
  );
  return result;
end;
$$;

create or replace function public.create_crm_ticket_with_assignees(
  p_case_id uuid,
  p_project_title text,
  p_department text,
  p_stage text,
  p_responsible_manager_id uuid,
  p_contacts jsonb,
  p_assignee_ids uuid[] default array[]::uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  result := public.create_crm_ticket(
    p_case_id,
    p_project_title,
    p_department,
    p_stage,
    p_responsible_manager_id,
    p_contacts
  );
  perform public.crm_set_initial_ticket_assignees(
    (result ->> 'ticketId')::uuid,
    p_assignee_ids,
    actor
  );
  return result;
end;
$$;

revoke all on function public.crm_set_initial_ticket_assignees(uuid, uuid[], uuid)
from public, anon, authenticated;
revoke all on function public.create_crm_case_and_ticket_with_assignees(text, text, text, text, uuid, jsonb, uuid[])
from public, anon;
revoke all on function public.create_crm_ticket_with_assignees(uuid, text, text, text, uuid, jsonb, uuid[])
from public, anon;

grant execute on function public.create_crm_case_and_ticket_with_assignees(text, text, text, text, uuid, jsonb, uuid[])
to authenticated;
grant execute on function public.create_crm_ticket_with_assignees(uuid, text, text, text, uuid, jsonb, uuid[])
to authenticated;
