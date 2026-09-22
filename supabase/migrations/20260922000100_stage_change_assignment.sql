-- Stage writes require a current association, even for creators and broad scopes.
-- The board's canMove flag and all stage RPCs use this shared permission check.
create or replace function public.crm_can_access_ticket(p_ticket_id uuid, p_permission text default 'tickets.read')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  scope public.data_access_scope;
  ticket_record public.crm_tickets%rowtype;
begin
  if actor is null then return false; end if;
  scope := public.user_permission_scope(actor, p_permission);
  if scope is null then return false; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null;
  if ticket_record.id is null then return false; end if;
  if p_permission in ('deals.move_stage', 'leads.change_status') then
    return coalesce(actor = ticket_record.responsible_manager_id, false)
      or exists (select 1 from public.crm_ticket_assignments a
        where a.ticket_id = p_ticket_id and a.user_id = actor and a.removed_at is null);
  end if;
  if scope = 'company' then return true; end if;
  if actor in (ticket_record.created_by_user_id, ticket_record.responsible_manager_id) then return true; end if;
  if exists (select 1 from public.crm_ticket_assignments a where a.ticket_id = p_ticket_id and a.user_id = actor and a.removed_at is null) then return true; end if;
  if scope = 'own' then return false; end if;
  if scope = 'team' and (
    public.crm_users_share_team(actor, ticket_record.created_by_user_id)
    or public.crm_users_share_team(actor, ticket_record.responsible_manager_id)
    or exists (select 1 from public.crm_ticket_assignments a
      where a.ticket_id = p_ticket_id and a.removed_at is null and public.crm_users_share_team(actor, a.user_id))
  ) then return true; end if;
  return false;
end;
$$;
