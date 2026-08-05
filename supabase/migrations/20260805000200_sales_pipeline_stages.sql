-- Replace the original generic Ticket stages with ElDream's sales pipeline.
-- A Ticket becomes customer work when it reaches Sales Order, independent of
-- which department currently owns it.

insert into public.crm_ticket_stages (slug, name, business_area, sort_order, is_active)
values
  ('qualification', 'Qualification', 'leads', 10, true),
  ('proposal_or_price_quote', 'Proposal or Price Quote', 'leads', 20, true),
  ('negotiation', 'Negotiation', 'leads', 30, true),
  ('sales_order', 'Sales Order', 'customers', 40, true),
  ('payment', 'Payment', 'customers', 50, true),
  ('close_won', 'Close won', 'customers', 60, true),
  ('lost', 'Lost', 'customers', 70, true)
on conflict (slug) do update set
  name = excluded.name,
  business_area = excluded.business_area,
  sort_order = excluded.sort_order,
  is_active = true;

-- Preserve every existing Ticket while translating its previous stage to the
-- closest point in the new pipeline.
update public.crm_tickets
set stage = case stage
  when 'new' then 'qualification'
  when 'open' then 'qualification'
  when 'qualified' then 'qualification'
  when 'proposal' then 'proposal_or_price_quote'
  when 'won' then 'close_won'
  when 'delivery' then 'payment'
  when 'closed_lost' then 'lost'
  else stage
end
where stage in ('new', 'open', 'qualified', 'proposal', 'won', 'delivery', 'closed_lost');

update public.crm_ticket_stages
set is_active = false
where slug in ('new', 'open', 'qualified', 'proposal', 'won', 'delivery', 'closed_lost');

create or replace function public.crm_apply_ticket_transfer(
  p_ticket_id uuid,
  p_destination text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  ticket_record public.crm_tickets%rowtype;
  destination_manager uuid;
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

  select stage.business_area into destination_area
  from public.crm_ticket_stages stage
  where stage.slug = ticket_record.stage;

  update public.crm_tickets set
    current_department = p_destination,
    responsible_manager_id = destination_manager
  where id = p_ticket_id;

  return jsonb_build_object(
    'ticketId', p_ticket_id,
    'department', p_destination,
    'stage', ticket_record.stage,
    'businessArea', destination_area,
    'responsibleManagerId', destination_manager
  );
end;
$$;

revoke all on function public.crm_apply_ticket_transfer(uuid, text) from public, anon, authenticated;
