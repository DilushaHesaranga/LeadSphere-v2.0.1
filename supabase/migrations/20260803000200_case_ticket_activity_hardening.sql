-- Add database-triggered audit coverage and assignment validation. Kept as a
-- follow-up migration so already-linked environments receive the hardening.

create table if not exists public.crm_case_activity (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_cases(id) on delete cascade,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_case_activity_case_idx
  on public.crm_case_activity (case_id, created_at desc);

create or replace function public.crm_touch_parent_case()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.crm_cases set updated_at = now() where id = new.case_id;
  return new;
end;
$$;

drop trigger if exists crm_tickets_touch_case on public.crm_tickets;
create trigger crm_tickets_touch_case after insert or update on public.crm_tickets
for each row execute function public.crm_touch_parent_case();

create or replace function public.crm_record_case_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.crm_case_activity (case_id, action, actor_user_id)
    values (new.id, 'CASE_CREATED', new.created_by_user_id);
  elsif old.deleted_at is null and new.deleted_at is not null then
    insert into public.crm_case_activity (case_id, action, actor_user_id)
    values (new.id, 'CASE_ARCHIVED', coalesce(new.deleted_by_user_id, (select auth.uid())));
  end if;
  return new;
end;
$$;

drop trigger if exists crm_cases_record_activity on public.crm_cases;
create trigger crm_cases_record_activity after insert or update of deleted_at on public.crm_cases
for each row execute function public.crm_record_case_activity();

create or replace function public.crm_record_contact_added()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (new.ticket_id, 'CONTACT_ADDED', new.created_by_user_id, jsonb_build_object('contactId', new.id));
  return new;
end;
$$;

drop trigger if exists crm_contacts_record_activity on public.crm_ticket_contacts;
create trigger crm_contacts_record_activity after insert on public.crm_ticket_contacts
for each row execute function public.crm_record_contact_added();

create or replace function public.crm_validate_ticket_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.crm_user_has_role(new.user_id, array[
    'marketing_executive', 'sales_executive', 'marketing_manager',
    'sales_manager', 'delivery_manager', 'leadership'
  ]) then
    raise exception 'The selected user is not an authorised Ticket assignee';
  end if;
  return new;
end;
$$;

drop trigger if exists crm_assignments_validate_user on public.crm_ticket_assignments;
create trigger crm_assignments_validate_user before insert or update of user_id on public.crm_ticket_assignments
for each row execute function public.crm_validate_ticket_assignment();

alter table public.crm_case_activity enable row level security;
drop policy if exists crm_case_activity_read on public.crm_case_activity;
create policy crm_case_activity_read on public.crm_case_activity for select to authenticated
using (public.crm_can_access_case(case_id, 'cases.read'));

grant select on public.crm_case_activity to authenticated;
revoke insert, update, delete on public.crm_case_activity from authenticated;

revoke all on function public.crm_touch_parent_case() from public, anon, authenticated;
revoke all on function public.crm_record_case_activity() from public, anon, authenticated;
revoke all on function public.crm_record_contact_added() from public, anon, authenticated;
revoke all on function public.crm_validate_ticket_assignment() from public, anon, authenticated;
