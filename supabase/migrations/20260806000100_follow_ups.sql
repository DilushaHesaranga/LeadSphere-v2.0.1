-- Persistent one-time and recurring Follow Ups. All mutations use guarded RPCs;
-- RLS also keeps direct reads scoped to Tickets the signed-in user can view.

create table if not exists public.crm_follow_up_series (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  follow_up_type text not null,
  purpose text,
  start_at timestamptz not null,
  recurrence_frequency text not null,
  is_active boolean not null default true,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_follow_up_series_type check (follow_up_type in ('EMAIL','CALL','MEETING')),
  constraint crm_follow_up_series_frequency check (recurrence_frequency in ('DAILY','EVERY_3_DAYS','WEEKLY','MONTHLY')),
  constraint crm_follow_up_series_purpose_length check (purpose is null or char_length(trim(purpose)) between 1 and 1000),
  constraint crm_follow_up_series_ticket_identity unique (id, ticket_id)
);

create table if not exists public.crm_follow_up_occurrences (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  series_id uuid,
  scheduled_at timestamptz not null,
  follow_up_type text not null,
  purpose text,
  status text not null default 'PENDING',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  completed_by_user_id uuid references auth.users(id) on delete restrict,
  completed_at timestamptz,
  client_request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_follow_up_occurrences_series_ticket_fk
    foreign key (series_id, ticket_id) references public.crm_follow_up_series(id, ticket_id) on delete restrict,
  constraint crm_follow_up_occurrences_type check (follow_up_type in ('EMAIL','CALL','MEETING')),
  constraint crm_follow_up_occurrences_status check (status in ('PENDING','COMPLETED','CANCELLED')),
  constraint crm_follow_up_occurrences_purpose_length check (purpose is null or char_length(trim(purpose)) between 1 and 1000),
  constraint crm_follow_up_occurrences_completion check (
    (status = 'COMPLETED' and completed_by_user_id is not null and completed_at is not null)
    or (status <> 'COMPLETED' and completed_at is null)
  ),
  constraint crm_follow_up_occurrences_request_unique unique (created_by_user_id, client_request_id)
);

create index if not exists crm_follow_up_series_ticket_idx on public.crm_follow_up_series(ticket_id, is_active);
create index if not exists crm_follow_up_series_created_by_idx on public.crm_follow_up_series(created_by_user_id, created_at desc);
create index if not exists crm_follow_up_occurrences_ticket_idx on public.crm_follow_up_occurrences(ticket_id, scheduled_at);
create index if not exists crm_follow_up_occurrences_scheduled_idx on public.crm_follow_up_occurrences(scheduled_at) where status = 'PENDING';
create index if not exists crm_follow_up_occurrences_status_idx on public.crm_follow_up_occurrences(status, scheduled_at);
create index if not exists crm_follow_up_occurrences_series_idx on public.crm_follow_up_occurrences(series_id, scheduled_at);
create index if not exists crm_follow_up_occurrences_created_by_idx on public.crm_follow_up_occurrences(created_by_user_id, created_at desc);
create unique index if not exists crm_follow_up_occurrences_one_series_date
  on public.crm_follow_up_occurrences(series_id, scheduled_at) where series_id is not null;

drop trigger if exists crm_follow_up_series_set_updated_at on public.crm_follow_up_series;
create trigger crm_follow_up_series_set_updated_at before update on public.crm_follow_up_series
for each row execute function public.set_updated_at();
drop trigger if exists crm_follow_up_occurrences_set_updated_at on public.crm_follow_up_occurrences;
create trigger crm_follow_up_occurrences_set_updated_at before update on public.crm_follow_up_occurrences
for each row execute function public.set_updated_at();

create or replace function public.crm_next_follow_up_at(p_previous timestamptz, p_frequency text)
returns timestamptz language plpgsql immutable set search_path = '' as $$
declare
  previous_utc timestamp := p_previous at time zone 'UTC';
  target_month date;
  last_day integer;
  target_day integer;
  next_utc timestamp;
begin
  if p_frequency = 'DAILY' then return (previous_utc + interval '1 day') at time zone 'UTC'; end if;
  if p_frequency = 'EVERY_3_DAYS' then return (previous_utc + interval '3 days') at time zone 'UTC'; end if;
  if p_frequency = 'WEEKLY' then return (previous_utc + interval '7 days') at time zone 'UTC'; end if;
  if p_frequency <> 'MONTHLY' then raise exception 'Select a valid recurrence frequency'; end if;

  target_month := (date_trunc('month', previous_utc) + interval '1 month')::date;
  last_day := extract(day from (target_month + interval '1 month - 1 day'))::integer;
  target_day := least(extract(day from previous_utc)::integer, last_day);
  next_utc := target_month::timestamp
    + (target_day - 1) * interval '1 day'
    + previous_utc::time;
  return next_utc at time zone 'UTC';
end;
$$;

create or replace function public.crm_validate_follow_up_input(
  p_scheduled_at timestamptz,
  p_type text,
  p_purpose text,
  p_recurring boolean,
  p_frequency text
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_scheduled_at is null or p_scheduled_at <= now() then raise exception 'Select a future follow-up date and time'; end if;
  if upper(coalesce(p_type, '')) <> all(array['EMAIL','CALL','MEETING']) then raise exception 'Select a valid follow-up type'; end if;
  if char_length(trim(coalesce(p_purpose, ''))) > 1000 then raise exception 'Purpose must be 1000 characters or fewer'; end if;
  if coalesce(p_recurring, false) and upper(coalesce(p_frequency, '')) <> all(array['DAILY','EVERY_3_DAYS','WEEKLY','MONTHLY']) then
    raise exception 'Select a recurrence frequency';
  end if;
  if not coalesce(p_recurring, false) and p_frequency is not null then
    raise exception 'A one-time follow-up cannot have a recurrence frequency';
  end if;
end;
$$;

create or replace function public.create_crm_follow_up(
  p_ticket_id uuid,
  p_scheduled_at timestamptz,
  p_type text,
  p_purpose text default null,
  p_recurring boolean default false,
  p_frequency text default null,
  p_client_request_id uuid default gen_random_uuid()
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  series_id uuid;
  occurrence_id uuid;
begin
  if actor is null or not public.crm_can_access_ticket(p_ticket_id, 'tickets.notes.create') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.id is null then raise exception 'Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets accept Follow Ups'; end if;
  if p_client_request_id is null then raise exception 'A request identifier is required'; end if;
  perform public.crm_validate_follow_up_input(p_scheduled_at, p_type, p_purpose, p_recurring, p_frequency);

  perform pg_advisory_xact_lock(hashtextextended(actor::text || ':' || p_client_request_id::text, 0));
  select occurrence.id into occurrence_id from public.crm_follow_up_occurrences occurrence
  where occurrence.created_by_user_id = actor and occurrence.client_request_id = p_client_request_id;
  if occurrence_id is not null then
    return jsonb_build_object('id', occurrence_id, 'duplicate', true);
  end if;

  if coalesce(p_recurring, false) then
    insert into public.crm_follow_up_series
      (ticket_id, follow_up_type, purpose, start_at, recurrence_frequency, created_by_user_id)
    values
      (p_ticket_id, upper(p_type), nullif(trim(p_purpose), ''), p_scheduled_at, upper(p_frequency), actor)
    returning id into series_id;
  end if;

  insert into public.crm_follow_up_occurrences
    (ticket_id, series_id, scheduled_at, follow_up_type, purpose, created_by_user_id, client_request_id)
  values
    (p_ticket_id, series_id, p_scheduled_at, upper(p_type), nullif(trim(p_purpose), ''), actor, p_client_request_id)
  returning id into occurrence_id;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (p_ticket_id, 'FOLLOW_UP_CREATED', actor, jsonb_build_object('followUpId', occurrence_id, 'seriesId', series_id));
  return jsonb_build_object('id', occurrence_id, 'seriesId', series_id, 'duplicate', false);
end;
$$;

create or replace function public.list_crm_follow_ups(
  p_ticket_id uuid default null,
  p_status text default null,
  p_limit integer default 100,
  p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_ticket_id is not null and not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then raise exception 'Ticket not found or access denied'; end if;
  if p_status is not null and upper(p_status) <> all(array['PENDING','COMPLETED','CANCELLED']) then raise exception 'Select a valid Follow Up status'; end if;

  select coalesce(jsonb_agg(item), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'id', occurrence.id,
      'ticketId', occurrence.ticket_id,
      'ticketTitle', ticket.project_title,
      'ticketNumber', left(ticket.id::text, 8),
      'companyName', crm_case.company_name,
      'seriesId', occurrence.series_id,
      'scheduledAt', occurrence.scheduled_at,
      'type', occurrence.follow_up_type,
      'purpose', occurrence.purpose,
      'status', occurrence.status,
      'recurring', occurrence.series_id is not null,
      'frequency', series.recurrence_frequency,
      'seriesActive', coalesce(series.is_active, false),
      'createdById', occurrence.created_by_user_id,
      'createdByName', coalesce(creator.display_name, creator.email::text),
      'createdAt', occurrence.created_at,
      'updatedAt', occurrence.updated_at,
      'completedAt', occurrence.completed_at
    ) item
    from public.crm_follow_up_occurrences occurrence
    join public.crm_tickets ticket on ticket.id = occurrence.ticket_id and ticket.deleted_at is null
    join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
    join public.profiles creator on creator.id = occurrence.created_by_user_id
    left join public.crm_follow_up_series series on series.id = occurrence.series_id
    where (p_ticket_id is null or occurrence.ticket_id = p_ticket_id)
      and (p_status is null or occurrence.status = upper(p_status))
      and public.crm_can_access_ticket(occurrence.ticket_id, 'tickets.read')
    order by case when occurrence.status = 'PENDING' then 0 else 1 end,
      case when occurrence.status = 'PENDING' then occurrence.scheduled_at end asc,
      occurrence.scheduled_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) listed;
  return result;
end;
$$;

create or replace function public.search_crm_follow_up_tickets(p_search text default '', p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); result jsonb;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  select coalesce(jsonb_agg(item), '[]'::jsonb) into result from (
    select jsonb_build_object(
      'id', ticket.id,
      'number', left(ticket.id::text, 8),
      'title', ticket.project_title,
      'companyName', crm_case.company_name,
      'department', ticket.current_department,
      'stage', ticket.stage
    ) item
    from public.crm_tickets ticket
    join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
    where ticket.deleted_at is null and ticket.status = 'active'
      and public.crm_can_access_ticket(ticket.id, 'tickets.notes.create')
      and (
        trim(coalesce(p_search, '')) = ''
        or ticket.project_title ilike '%' || trim(p_search) || '%'
        or crm_case.company_name ilike '%' || trim(p_search) || '%'
        or ticket.id::text ilike trim(p_search) || '%'
      )
    order by ticket.updated_at desc
    limit least(greatest(p_limit, 1), 50)
  ) tickets;
  return result;
end;
$$;

create or replace function public.update_crm_follow_up(
  p_follow_up_id uuid,
  p_scheduled_at timestamptz,
  p_type text,
  p_purpose text default null,
  p_frequency text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); occurrence public.crm_follow_up_occurrences%rowtype;
begin
  select * into occurrence from public.crm_follow_up_occurrences where id = p_follow_up_id for update;
  if occurrence.id is null then raise exception 'Follow Up not found'; end if;
  if not public.crm_can_access_ticket(occurrence.ticket_id, 'tickets.notes.create') then raise exception 'Permission denied'; end if;
  if occurrence.status <> 'PENDING' then raise exception 'Only pending Follow Ups can be edited'; end if;
  perform public.crm_validate_follow_up_input(p_scheduled_at, p_type, p_purpose, occurrence.series_id is not null, p_frequency);

  update public.crm_follow_up_occurrences set
    scheduled_at = p_scheduled_at, follow_up_type = upper(p_type), purpose = nullif(trim(p_purpose), '')
  where id = p_follow_up_id;
  if occurrence.series_id is not null then
    update public.crm_follow_up_series set
      follow_up_type = upper(p_type), purpose = nullif(trim(p_purpose), ''), recurrence_frequency = upper(p_frequency)
    where id = occurrence.series_id;
  end if;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (occurrence.ticket_id, 'FOLLOW_UP_UPDATED', actor, jsonb_build_object('followUpId', p_follow_up_id));
  return jsonb_build_object('id', p_follow_up_id, 'status', 'PENDING');
end;
$$;

create or replace function public.complete_crm_follow_up(p_follow_up_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  occurrence public.crm_follow_up_occurrences%rowtype;
  series public.crm_follow_up_series%rowtype;
  next_at timestamptz;
  next_id uuid;
begin
  select * into occurrence from public.crm_follow_up_occurrences where id = p_follow_up_id for update;
  if occurrence.id is null then raise exception 'Follow Up not found'; end if;
  if not public.crm_can_access_ticket(occurrence.ticket_id, 'tickets.notes.create') then raise exception 'Permission denied'; end if;
  if occurrence.status <> 'PENDING' then raise exception 'Only pending Follow Ups can be completed'; end if;

  update public.crm_follow_up_occurrences set status = 'COMPLETED', completed_by_user_id = actor, completed_at = now()
  where id = p_follow_up_id;
  if occurrence.series_id is not null then
    select * into series from public.crm_follow_up_series where id = occurrence.series_id for update;
    if series.is_active then
      next_at := public.crm_next_follow_up_at(occurrence.scheduled_at, series.recurrence_frequency);
      insert into public.crm_follow_up_occurrences
        (ticket_id, series_id, scheduled_at, follow_up_type, purpose, created_by_user_id, client_request_id)
      values
        (occurrence.ticket_id, series.id, next_at, series.follow_up_type, series.purpose, series.created_by_user_id, gen_random_uuid())
      on conflict (series_id, scheduled_at) where series_id is not null do nothing
      returning id into next_id;
      if next_id is null then
        select id into next_id from public.crm_follow_up_occurrences
        where series_id = series.id and scheduled_at = next_at;
      end if;
    end if;
  end if;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (occurrence.ticket_id, 'FOLLOW_UP_COMPLETED', actor, jsonb_build_object('followUpId', p_follow_up_id, 'nextFollowUpId', next_id));
  return jsonb_build_object('id', p_follow_up_id, 'status', 'COMPLETED', 'nextFollowUpId', next_id);
end;
$$;

create or replace function public.cancel_crm_follow_up(p_follow_up_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  occurrence public.crm_follow_up_occurrences%rowtype;
  series public.crm_follow_up_series%rowtype;
  next_at timestamptz;
  next_id uuid;
begin
  select * into occurrence from public.crm_follow_up_occurrences where id = p_follow_up_id for update;
  if occurrence.id is null then raise exception 'Follow Up not found'; end if;
  if not public.crm_can_access_ticket(occurrence.ticket_id, 'tickets.notes.create') then raise exception 'Permission denied'; end if;
  if occurrence.status <> 'PENDING' then raise exception 'Only pending Follow Ups can be cancelled'; end if;
  update public.crm_follow_up_occurrences set status = 'CANCELLED' where id = p_follow_up_id;
  if occurrence.series_id is not null then
    select * into series from public.crm_follow_up_series where id = occurrence.series_id for update;
    if series.is_active then
      next_at := public.crm_next_follow_up_at(occurrence.scheduled_at, series.recurrence_frequency);
      insert into public.crm_follow_up_occurrences
        (ticket_id, series_id, scheduled_at, follow_up_type, purpose, created_by_user_id, client_request_id)
      values
        (occurrence.ticket_id, series.id, next_at, series.follow_up_type, series.purpose, series.created_by_user_id, gen_random_uuid())
      on conflict (series_id, scheduled_at) where series_id is not null do nothing
      returning id into next_id;
      if next_id is null then
        select id into next_id from public.crm_follow_up_occurrences
        where series_id = series.id and scheduled_at = next_at;
      end if;
    end if;
  end if;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (occurrence.ticket_id, 'FOLLOW_UP_CANCELLED', actor, jsonb_build_object('followUpId', p_follow_up_id, 'nextFollowUpId', next_id));
  return jsonb_build_object('id', p_follow_up_id, 'status', 'CANCELLED', 'nextFollowUpId', next_id);
end;
$$;

create or replace function public.stop_crm_follow_up_series(p_series_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); series public.crm_follow_up_series%rowtype;
begin
  select * into series from public.crm_follow_up_series where id = p_series_id for update;
  if series.id is null then raise exception 'Recurring Follow Up not found'; end if;
  if not public.crm_can_access_ticket(series.ticket_id, 'tickets.notes.create') then raise exception 'Permission denied'; end if;
  if not series.is_active then return jsonb_build_object('id', p_series_id, 'active', false); end if;
  update public.crm_follow_up_series set is_active = false where id = p_series_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (series.ticket_id, 'FOLLOW_UP_SERIES_STOPPED', actor, jsonb_build_object('seriesId', p_series_id));
  return jsonb_build_object('id', p_series_id, 'active', false);
end;
$$;

alter table public.crm_follow_up_series enable row level security;
alter table public.crm_follow_up_occurrences enable row level security;

drop policy if exists crm_follow_up_series_read on public.crm_follow_up_series;
create policy crm_follow_up_series_read on public.crm_follow_up_series for select to authenticated
using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
drop policy if exists crm_follow_up_series_insert on public.crm_follow_up_series;
create policy crm_follow_up_series_insert on public.crm_follow_up_series for insert to authenticated
with check (created_by_user_id = (select auth.uid()) and public.crm_can_access_ticket(ticket_id, 'tickets.notes.create'));
drop policy if exists crm_follow_up_series_update on public.crm_follow_up_series;
create policy crm_follow_up_series_update on public.crm_follow_up_series for update to authenticated
using (public.crm_can_access_ticket(ticket_id, 'tickets.notes.create'))
with check (public.crm_can_access_ticket(ticket_id, 'tickets.notes.create'));

drop policy if exists crm_follow_up_occurrences_read on public.crm_follow_up_occurrences;
create policy crm_follow_up_occurrences_read on public.crm_follow_up_occurrences for select to authenticated
using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
drop policy if exists crm_follow_up_occurrences_insert on public.crm_follow_up_occurrences;
create policy crm_follow_up_occurrences_insert on public.crm_follow_up_occurrences for insert to authenticated
with check (created_by_user_id = (select auth.uid()) and public.crm_can_access_ticket(ticket_id, 'tickets.notes.create'));
drop policy if exists crm_follow_up_occurrences_update on public.crm_follow_up_occurrences;
create policy crm_follow_up_occurrences_update on public.crm_follow_up_occurrences for update to authenticated
using (public.crm_can_access_ticket(ticket_id, 'tickets.notes.create'))
with check (public.crm_can_access_ticket(ticket_id, 'tickets.notes.create'));

revoke all on public.crm_follow_up_series, public.crm_follow_up_occurrences from public, anon, authenticated;
grant select on public.crm_follow_up_series, public.crm_follow_up_occurrences to authenticated;
revoke all on function public.crm_next_follow_up_at(timestamptz, text) from public, anon, authenticated;
revoke all on function public.crm_validate_follow_up_input(timestamptz, text, text, boolean, text) from public, anon, authenticated;
revoke all on function public.create_crm_follow_up(uuid, timestamptz, text, text, boolean, text, uuid) from public, anon;
revoke all on function public.list_crm_follow_ups(uuid, text, integer, integer) from public, anon;
revoke all on function public.search_crm_follow_up_tickets(text, integer) from public, anon;
revoke all on function public.update_crm_follow_up(uuid, timestamptz, text, text, text) from public, anon;
revoke all on function public.complete_crm_follow_up(uuid) from public, anon;
revoke all on function public.cancel_crm_follow_up(uuid) from public, anon;
revoke all on function public.stop_crm_follow_up_series(uuid) from public, anon;
grant execute on function public.create_crm_follow_up(uuid, timestamptz, text, text, boolean, text, uuid) to authenticated;
grant execute on function public.list_crm_follow_ups(uuid, text, integer, integer) to authenticated;
grant execute on function public.search_crm_follow_up_tickets(text, integer) to authenticated;
grant execute on function public.update_crm_follow_up(uuid, timestamptz, text, text, text) to authenticated;
grant execute on function public.complete_crm_follow_up(uuid) to authenticated;
grant execute on function public.cancel_crm_follow_up(uuid) to authenticated;
grant execute on function public.stop_crm_follow_up_series(uuid) to authenticated;
