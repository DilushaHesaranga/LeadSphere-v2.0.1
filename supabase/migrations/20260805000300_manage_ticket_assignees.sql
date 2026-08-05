-- Managers may add or remove active Ticket assignees after creation. Changes
-- are permission checked, audited, limited to eligible users, and notified.

create or replace function public.update_crm_ticket_assignments(
  p_ticket_id uuid,
  p_add_user_ids uuid[] default array[]::uuid[],
  p_remove_user_ids uuid[] default array[]::uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  add_ids uuid[];
  remove_ids uuid[];
  active_count integer;
  added_activity_id uuid;
  removed_activity_id uuid;
begin
  if actor is null or not public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.review') then
    raise exception 'Permission denied';
  end if;

  select * into ticket_record
  from public.crm_tickets
  where id = p_ticket_id and deleted_at is null
  for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can change assignments'; end if;

  select coalesce(array_agg(distinct selected.user_id order by selected.user_id), array[]::uuid[])
  into add_ids from unnest(coalesce(p_add_user_ids, array[]::uuid[])) selected(user_id);
  select coalesce(array_agg(distinct selected.user_id order by selected.user_id), array[]::uuid[])
  into remove_ids from unnest(coalesce(p_remove_user_ids, array[]::uuid[])) selected(user_id);

  if cardinality(add_ids) = 0 and cardinality(remove_ids) = 0 then
    raise exception 'Select at least one assignment change';
  end if;
  if exists (select 1 from unnest(add_ids || remove_ids) selected(user_id) where selected.user_id is null) then
    raise exception 'Select valid Ticket assignees';
  end if;
  if add_ids && remove_ids then raise exception 'A user cannot be added and removed in the same change'; end if;

  if exists (
    select 1 from unnest(add_ids) selected(user_id)
    left join public.profiles profile on profile.id = selected.user_id
    where profile.id is null
      or profile.status <> 'active'
      or not public.crm_user_has_role(selected.user_id, array[
        'marketing_executive', 'sales_executive', 'marketing_manager',
        'sales_manager', 'delivery_manager', 'leadership'
      ])
  ) then raise exception 'One or more selected users cannot be assigned to Tickets'; end if;
  if exists (
    select 1 from unnest(remove_ids) selected(user_id)
    where not exists (
      select 1 from public.crm_ticket_assignments assignment
      where assignment.ticket_id = p_ticket_id
        and assignment.user_id = selected.user_id
        and assignment.removed_at is null
    )
  ) then raise exception 'One or more selected users are not assigned to this Ticket'; end if;

  select count(*) into active_count
  from public.crm_ticket_assignments assignment
  where assignment.ticket_id = p_ticket_id
    and assignment.removed_at is null
    and not (assignment.user_id = any(remove_ids));
  active_count := active_count + (
    select count(*) from unnest(add_ids) selected(user_id)
    where not exists (
      select 1 from public.crm_ticket_assignments assignment
      where assignment.ticket_id = p_ticket_id
        and assignment.user_id = selected.user_id
        and assignment.removed_at is null
    )
  );
  if active_count > 25 then raise exception 'A Ticket can have at most 25 assignees'; end if;

  if cardinality(remove_ids) > 0 then
    update public.crm_ticket_assignments set removed_at = now()
    where ticket_id = p_ticket_id and user_id = any(remove_ids) and removed_at is null;

    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (p_ticket_id, 'ASSIGNEES_REMOVED', actor, jsonb_build_object('assigneeIds', to_jsonb(remove_ids)))
    returning id into removed_activity_id;

    insert into public.user_notifications (user_id, kind, title, message, link, event_key)
    select selected.user_id, 'assignment_removed', 'Ticket assignment removed',
      'You were removed from ' || ticket_record.project_title || '.',
      '/console/tickets/' || p_ticket_id::text,
      'ticket-assignment-removed:' || removed_activity_id::text || ':' || selected.user_id::text
    from unnest(remove_ids) selected(user_id)
    join public.profiles profile on profile.id = selected.user_id and profile.status = 'active'
    where selected.user_id is distinct from actor
    on conflict (user_id, event_key) do nothing;
  end if;

  if cardinality(add_ids) > 0 then
    insert into public.crm_ticket_assignments
      (ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at)
    select p_ticket_id, selected.user_id, actor, now(), null
    from unnest(add_ids) selected(user_id)
    on conflict (ticket_id, user_id) do update set
      assigned_by_user_id = excluded.assigned_by_user_id,
      assigned_at = excluded.assigned_at,
      removed_at = null;

    insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
    values (p_ticket_id, 'ASSIGNEES_ADDED', actor, jsonb_build_object('assigneeIds', to_jsonb(add_ids)))
    returning id into added_activity_id;

    insert into public.user_notifications (user_id, kind, title, message, link, event_key)
    select selected.user_id, 'assignment_added', 'New Ticket assignment',
      'You were assigned to ' || ticket_record.project_title || '.',
      '/console/tickets/' || p_ticket_id::text,
      'ticket-assignment-added:' || added_activity_id::text || ':' || selected.user_id::text
    from unnest(add_ids) selected(user_id)
    join public.profiles profile on profile.id = selected.user_id and profile.status = 'active'
    where selected.user_id is distinct from actor
    on conflict (user_id, event_key) do nothing;
  end if;

  return jsonb_build_object(
    'ticketId', p_ticket_id,
    'addedUserIds', to_jsonb(add_ids),
    'removedUserIds', to_jsonb(remove_ids)
  );
end;
$$;

revoke all on function public.update_crm_ticket_assignments(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.update_crm_ticket_assignments(uuid, uuid[], uuid[]) to authenticated;
