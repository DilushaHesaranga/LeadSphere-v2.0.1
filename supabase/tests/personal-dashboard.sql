-- Run within a transaction as the database owner. Uses claims without issuing sessions.
do $verify$
declare account record; allowed boolean; payload jsonb; entry jsonb; expected bigint; denied boolean;
begin
  if has_function_privilege('anon','public.get_crm_personal_dashboard()','EXECUTE')
    or has_function_privilege('authenticated','public.crm_is_personal_ticket(uuid)','EXECUTE')
    or has_function_privilege('anon','public.prepare_crm_personal_call(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'Personal dashboard privileges are too broad';
  end if;
  for account in select id from public.profiles union all select null::uuid loop
    perform set_config('request.jwt.claim.sub',coalesce(account.id::text,''),true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',account.id,'role','authenticated')::text,true);
    allowed := public.crm_user_has_role(account.id,array['marketing_executive','sales_executive','marketing_manager','sales_manager','delivery_manager','leadership'])
      and public.current_user_has_permission('dashboards.read') and public.current_user_has_permission('tickets.read');
    begin
      payload := public.get_crm_personal_dashboard();
      if not allowed then raise exception 'Unauthorized dashboard access'; end if;
      select count(*) into expected from public.crm_tickets t join public.crm_cases c on c.id=t.case_id
      where t.deleted_at is null and c.deleted_at is null and t.status<>'archived'
        and public.crm_can_access_ticket(t.id,'tickets.read')
        and (t.responsible_manager_id=account.id or c.account_owner_id=account.id or exists(
          select 1 from public.crm_ticket_assignments a where a.ticket_id=t.id and a.user_id=account.id and a.removed_at is null));
      if (payload->'metrics'->>'totalTickets')::bigint <> expected then raise exception 'Personal totals mismatch'; end if;
      if jsonb_array_length(payload->'tickets') <> (payload->'metrics'->>'activeTickets')::int then raise exception 'Active totals mismatch'; end if;
      for entry in select value from jsonb_array_elements(payload->'tickets') loop
        if not exists(select 1 from public.crm_tickets t join public.crm_cases c on c.id=t.case_id where t.id=(entry->>'id')::uuid
          and (t.responsible_manager_id=account.id or c.account_owner_id=account.id or exists(select 1 from public.crm_ticket_assignments a
            where a.ticket_id=t.id and a.user_id=account.id and a.removed_at is null))) then raise exception 'Another owner ticket leaked'; end if;
      end loop;
    exception when insufficient_privilege then
      if allowed then raise exception 'Authorized account denied'; end if;
    end;
    denied := false;
    begin
      perform public.prepare_crm_personal_call('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000',gen_random_uuid());
    exception when insufficient_privilege then denied:=true;
    end;
    if not denied then raise exception 'Unowned call was accepted'; end if;
  end loop;
end;
$verify$;
