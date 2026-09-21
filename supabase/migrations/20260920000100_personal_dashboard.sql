begin;

insert into public.role_permissions(role_id, permission_id, access_scope)
select r.id, p.id, 'assigned'::public.data_access_scope
from public.roles r cross join public.permissions p
where r.slug in ('marketing_executive','sales_executive') and p.slug = 'dashboards.read'
on conflict(role_id, permission_id) do nothing;

create or replace function public.crm_can_view_personal_dashboard()
returns boolean language sql stable security definer set search_path = '' as $$
  select public.crm_user_has_role((select auth.uid()), array[
    'marketing_executive','sales_executive','marketing_manager','sales_manager','delivery_manager','leadership'])
    and public.current_user_has_permission('dashboards.read')
    and public.current_user_has_permission('tickets.read');
$$;

-- Company/team permissions never override the current ownership requirement.
create or replace function public.crm_is_personal_ticket(p_ticket_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.crm_can_view_personal_dashboard() and exists (
    select 1 from public.crm_tickets t join public.crm_cases c on c.id=t.case_id
    where t.id=p_ticket_id and t.deleted_at is null and c.deleted_at is null
      and t.status <> 'archived' and public.crm_can_access_ticket(t.id,'tickets.read')
      and (t.responsible_manager_id=(select auth.uid()) or c.account_owner_id=(select auth.uid())
        or exists(select 1 from public.crm_ticket_assignments a where a.ticket_id=t.id
          and a.user_id=(select auth.uid()) and a.removed_at is null))
  );
$$;

create or replace function public.get_crm_personal_dashboard()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; snapshot_at timestamptz := statement_timestamp();
begin
  if not public.crm_can_view_personal_dashboard() then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  with scoped as materialized (
    select t.*, c.company_name, s.name stage_name, s.semantic_category category,
      s.probability stage_probability, v.deal_value, v.currency, v.updated_at value_updated_at,
      (select max(h.changed_at) from public.crm_ticket_stage_history h
        where h.ticket_id=t.id and h.new_stage_slug=t.stage and h.changed_at <= snapshot_at) outcome_at
    from public.crm_tickets t join public.crm_cases c on c.id=t.case_id
    join public.crm_ticket_stages s on s.slug=t.stage
    left join public.crm_ticket_sales v on v.ticket_id=t.id
    where public.crm_is_personal_ticket(t.id)
  ), features as materialized (
    select s.*, greatest(0, extract(epoch from (coalesce(case when category in ('won','lost') then outcome_at end,snapshot_at)-created_at))/86400) age_days,
      (select count(*) from public.crm_follow_up_occurrences f where f.ticket_id=s.id
        and f.status='COMPLETED' and f.completed_at <= coalesce(case when category in ('won','lost') then outcome_at end,snapshot_at)) interactions,
      (select count(*) from public.crm_follow_up_occurrences f where f.ticket_id=s.id
        and f.status='PENDING' and f.scheduled_at < snapshot_at) overdue
    from scoped s
  )
  select jsonb_build_object(
    'asOf',snapshot_at,
    'metrics',jsonb_build_object('totalTickets',(select count(*) from scoped),
      'activeTickets',(select count(*) from scoped where status='active' and category='open'),
      'wonTickets',(select count(*) from scoped where category='won'),
      'lostTickets',(select count(*) from scoped where category='lost'),
      'closedTickets',(select count(*) from scoped where status='closed')),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',id,'caseId',case_id,
      'projectTitle',project_title,'companyName',company_name,'stageName',stage_name,
      'stageProbability',stage_probability,'dealValue',deal_value,'currency',currency,
      'ageDays',age_days,'interactions',interactions,'overdueFollowUps',overdue,
      'contacts',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'value',c.phone_number) order by c.name,c.id)
        from public.crm_ticket_contacts c where c.ticket_id=features.id
        and c.phone_number ~ '^\+?[0-9() -]{7,30}$'),'[]'::jsonb)
    ) order by created_at,id) from features where status='active' and category='open'),'[]'::jsonb),
    'history',coalesce((select jsonb_agg(jsonb_build_object('outcome',category,'ageDays',age_days,
      'interactions',interactions,'currency',currency,
      -- Do not train on values recorded after the outcome. No historical value is invented.
      'dealValue',case when value_updated_at <= outcome_at then deal_value end))
      from (select * from features where category in ('won','lost') and outcome_at is not null
        order by outcome_at desc,id limit 500) training),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

create or replace function public.prepare_crm_personal_call(p_ticket_id uuid,p_contact_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare recipient text;
begin
  if not public.crm_is_personal_ticket(p_ticket_id) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.crm_tickets t join public.crm_ticket_stages s on s.slug=t.stage
    where t.id=p_ticket_id and t.status='active' and s.semantic_category='open') then
    raise exception 'This ticket is no longer active';
  end if;
  select phone_number into recipient from public.crm_ticket_contacts
    where id=p_contact_id and ticket_id=p_ticket_id and phone_number ~ '^\+?[0-9() -]{7,30}$';
  if recipient is null then raise exception 'No valid phone number is available'; end if;
  perform public.record_crm_communication_launch(p_ticket_id,'CALL',p_contact_id,recipient,p_request_id);
  return jsonb_build_object('phone',recipient);
end;
$$;

revoke all on function public.crm_can_view_personal_dashboard() from public,anon,authenticated;
revoke all on function public.crm_is_personal_ticket(uuid) from public,anon,authenticated;
revoke all on function public.get_crm_personal_dashboard() from public,anon;
revoke all on function public.prepare_crm_personal_call(uuid,uuid,uuid) from public,anon;
grant execute on function public.get_crm_personal_dashboard() to authenticated;
grant execute on function public.prepare_crm_personal_call(uuid,uuid,uuid) to authenticated;
commit;
