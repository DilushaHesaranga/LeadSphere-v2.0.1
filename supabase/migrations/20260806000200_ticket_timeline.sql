-- Secure, chart-ready Ticket Timeline data. Ticket activity remains authoritative;
-- communications record genuine launches without claiming external delivery.

create table if not exists public.crm_ticket_communications (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  contact_id uuid references public.crm_ticket_contacts(id) on delete set null,
  category text not null,
  event_type text not null,
  direction text not null,
  status text not null,
  subject text,
  sender text,
  recipients text[] not null default '{}'::text[],
  preview text,
  has_attachments boolean not null default false,
  occurred_at timestamptz not null default now(),
  duration_seconds integer,
  notes text,
  responsible_user_id uuid references auth.users(id) on delete set null,
  recording_id text,
  recording_url text,
  recording_duration_seconds integer,
  recording_availability_status text,
  recording_access_permission text,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  client_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_ticket_communications_category check (category in ('EMAIL', 'CALL')),
  constraint crm_ticket_communications_category_type check (
    (category = 'EMAIL' and event_type like 'EMAIL_%') or (category = 'CALL' and event_type like 'CALL_%')
  ),
  constraint crm_ticket_communications_type check (event_type in (
    'EMAIL_INITIATED', 'EMAIL_SENT', 'EMAIL_RECEIVED', 'EMAIL_FAILED', 'EMAIL_DELIVERED',
    'CALL_INITIATED', 'CALL_COMPLETED', 'CALL_MISSED', 'CALL_CANCELLED'
  )),
  constraint crm_ticket_communications_direction check (direction in ('INBOUND', 'OUTBOUND')),
  constraint crm_ticket_communications_status_length check (char_length(trim(status)) between 2 and 40),
  constraint crm_ticket_communications_subject_length check (subject is null or char_length(subject) <= 300),
  constraint crm_ticket_communications_preview_length check (preview is null or char_length(preview) <= 1000),
  constraint crm_ticket_communications_duration check (duration_seconds is null or duration_seconds >= 0),
  constraint crm_ticket_communications_recording_duration check (recording_duration_seconds is null or recording_duration_seconds >= 0)
);

create index if not exists crm_ticket_communications_ticket_time_idx
  on public.crm_ticket_communications (ticket_id, occurred_at desc);
create index if not exists crm_ticket_communications_category_time_idx
  on public.crm_ticket_communications (category, occurred_at desc);
create index if not exists crm_ticket_activity_time_ticket_idx
  on public.crm_ticket_activity (created_at desc, ticket_id);
create unique index if not exists crm_ticket_communications_request_unique
  on public.crm_ticket_communications (created_by_user_id, client_request_id)
  where client_request_id is not null;

drop trigger if exists crm_ticket_communications_set_updated_at on public.crm_ticket_communications;
create trigger crm_ticket_communications_set_updated_at before update on public.crm_ticket_communications
for each row execute function public.set_updated_at();

alter table public.crm_ticket_communications enable row level security;
drop policy if exists crm_ticket_communications_read on public.crm_ticket_communications;
create policy crm_ticket_communications_read on public.crm_ticket_communications for select to authenticated
using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
revoke all on public.crm_ticket_communications from anon, authenticated;

create or replace function public.crm_timeline_timezone()
returns text language sql immutable set search_path = '' as $$ select 'Asia/Colombo'::text $$;

create or replace function public.crm_validate_timeline_query(
  p_from date, p_to date, p_grouping text, p_categories text[], p_ticket_id uuid,
  p_department text, p_manager_id uuid, p_status text, p_stage text
) returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Select a valid Timeline date range'; end if;
  if p_to - p_from > 730 then raise exception 'Timeline ranges cannot exceed 730 days'; end if;
  if lower(coalesce(p_grouping, '')) not in ('day','week','month') then raise exception 'Select a valid Timeline grouping'; end if;
  if p_categories is null or cardinality(p_categories) = 0
     or exists (select 1 from unnest(p_categories) value where lower(value) not in ('activity','email','call'))
  then raise exception 'Select at least one valid Timeline category'; end if;
  if p_ticket_id is not null and not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then raise exception 'Ticket not found or access denied'; end if;
  if nullif(p_department, '') is not null and not exists (select 1 from public.crm_departments where slug = p_department) then raise exception 'Select a valid department'; end if;
  if nullif(p_status, '') is not null and lower(p_status) not in ('active','closed','archived') then raise exception 'Select a valid Ticket status'; end if;
  if nullif(p_stage, '') is not null and not exists (select 1 from public.crm_ticket_stages where slug = p_stage) then raise exception 'Select a valid Ticket stage'; end if;
  if p_manager_id is not null and not exists (select 1 from public.profiles where id = p_manager_id and status = 'active') then raise exception 'Select a valid responsible manager'; end if;
end;
$$;

create or replace function public.crm_authorized_timeline_events(
  p_from_ts timestamptz, p_to_ts timestamptz, p_categories text[], p_ticket_id uuid default null,
  p_department text default null, p_manager_id uuid default null, p_status text default null,
  p_stage text default null, p_activity_type text default null
) returns table (
  id uuid, ticket_id uuid, event_category text, event_type text, occurred_at timestamptz,
  actor_user_id uuid, title text, description text, previous_value text, new_value text,
  metadata jsonb, communication_id uuid
) language sql stable security definer set search_path = '' as $$
  select activity.id, activity.ticket_id, 'activity'::text, activity.action, activity.created_at,
    activity.actor_user_id, activity.action,
    nullif(activity.details ->> 'description', ''),
    coalesce(activity.details ->> 'previousValue', activity.details ->> 'previousStage', activity.details ->> 'currentDepartment'),
    coalesce(activity.details ->> 'newValue', activity.details ->> 'stage', activity.details ->> 'requestedDepartment', activity.details ->> 'department'),
    activity.details, null::uuid
  from public.crm_ticket_activity activity
  join public.crm_tickets ticket on ticket.id = activity.ticket_id and ticket.deleted_at is null
  join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
  where activity.created_at >= p_from_ts and activity.created_at < p_to_ts
    and 'activity' = any(select lower(value) from unnest(p_categories) value)
    and (p_ticket_id is null or ticket.id = p_ticket_id)
    and (nullif(p_department, '') is null or ticket.current_department = p_department)
    and (p_manager_id is null or ticket.responsible_manager_id = p_manager_id)
    and (nullif(p_status, '') is null or ticket.status = lower(p_status))
    and (nullif(p_stage, '') is null or ticket.stage = p_stage)
    and (nullif(p_activity_type, '') is null or activity.action = upper(p_activity_type))
    and public.crm_can_access_ticket(ticket.id, 'tickets.read')
  union all
  select communication.id, communication.ticket_id, lower(communication.category), communication.event_type,
    communication.occurred_at, communication.responsible_user_id, coalesce(communication.subject, communication.event_type),
    communication.preview, null::text, null::text,
    jsonb_build_object('direction', communication.direction, 'status', communication.status), communication.id
  from public.crm_ticket_communications communication
  join public.crm_tickets ticket on ticket.id = communication.ticket_id and ticket.deleted_at is null
  join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
  where communication.occurred_at >= p_from_ts and communication.occurred_at < p_to_ts
    and lower(communication.category) = any(select lower(value) from unnest(p_categories) value)
    and nullif(p_activity_type, '') is null
    and (p_ticket_id is null or ticket.id = p_ticket_id)
    and (nullif(p_department, '') is null or ticket.current_department = p_department)
    and (p_manager_id is null or ticket.responsible_manager_id = p_manager_id)
    and (nullif(p_status, '') is null or ticket.status = lower(p_status))
    and (nullif(p_stage, '') is null or ticket.stage = p_stage)
    and public.crm_can_access_ticket(ticket.id, 'tickets.read');
$$;

create or replace function public.get_crm_timeline(
  p_from date, p_to date, p_grouping text default 'day',
  p_categories text[] default array['activity','email','call']::text[], p_ticket_id uuid default null,
  p_department text default null, p_manager_id uuid default null, p_status text default null,
  p_stage text default null, p_activity_type text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare timezone_name text := public.crm_timeline_timezone(); from_ts timestamptz; to_ts timestamptz; grouping_name text := lower(p_grouping);
begin
  perform public.crm_validate_timeline_query(p_from, p_to, grouping_name, p_categories, p_ticket_id, p_department, p_manager_id, p_status, p_stage);
  from_ts := p_from::timestamp at time zone timezone_name;
  to_ts := (p_to + 1)::timestamp at time zone timezone_name;
  return (
    with events as materialized (
      select * from public.crm_authorized_timeline_events(from_ts, to_ts, p_categories, p_ticket_id, p_department, p_manager_id, p_status, p_stage, p_activity_type)
    ), bucketed as (
      select case grouping_name
        when 'month' then date_trunc('month', occurred_at at time zone timezone_name)::date
        when 'week' then date_trunc('week', occurred_at at time zone timezone_name)::date
        else (occurred_at at time zone timezone_name)::date end bucket,
        event_category, count(*) total from events group by 1, 2
    ), buckets as (
      select generate_series(
        case grouping_name when 'month' then date_trunc('month', p_from::timestamp)::date when 'week' then date_trunc('week', p_from::timestamp)::date else p_from end,
        p_to,
        case grouping_name when 'month' then interval '1 month' when 'week' then interval '1 week' else interval '1 day' end
      )::date bucket
    ), series as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', bucket,
        'activity', coalesce((select total from bucketed where bucketed.bucket = buckets.bucket and event_category = 'activity'), 0),
        'email', coalesce((select total from bucketed where bucketed.bucket = buckets.bucket and event_category = 'email'), 0),
        'call', coalesce((select total from bucketed where bucketed.bucket = buckets.bucket and event_category = 'call'), 0)
      ) order by bucket), '[]'::jsonb) value from buckets
    ), totals as (
      select jsonb_build_object(
        'activity', count(*) filter (where event_category = 'activity'),
        'email', count(*) filter (where event_category = 'email'),
        'call', count(*) filter (where event_category = 'call')
      ) value from events
    )
    select jsonb_build_object(
      'range', jsonb_build_object('from', p_from, 'to', p_to, 'timezone', timezone_name, 'grouping', grouping_name),
      'series', series.value, 'totals', totals.value
    ) from series cross join totals
  );
end;
$$;

create or replace function public.list_crm_timeline_details(
  p_from date, p_to date, p_grouping text, p_categories text[], p_bucket_start date, p_category text,
  p_ticket_id uuid default null, p_department text default null, p_manager_id uuid default null,
  p_status text default null, p_stage text default null, p_activity_type text default null,
  p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  timezone_name text := public.crm_timeline_timezone(); from_ts timestamptz; to_ts timestamptz;
  bucket_end timestamp; safe_page integer := greatest(coalesce(p_page, 1), 1); safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 100);
  actor uuid := (select auth.uid()); can_sensitive boolean;
begin
  perform public.crm_validate_timeline_query(p_from, p_to, p_grouping, p_categories, p_ticket_id, p_department, p_manager_id, p_status, p_stage);
  if lower(p_category) not in ('activity','email','call') or not exists (select 1 from unnest(p_categories) value where lower(value) = lower(p_category)) then raise exception 'Select a visible Timeline category'; end if;
  if p_bucket_start is null then raise exception 'Select a Timeline date bucket'; end if;
  bucket_end := p_bucket_start + case lower(p_grouping) when 'month' then interval '1 month' when 'week' then interval '1 week' else interval '1 day' end;
  from_ts := p_from::timestamp at time zone timezone_name;
  to_ts := (p_to + 1)::timestamp at time zone timezone_name;
  can_sensitive := public.current_user_has_permission('activities.read');
  return (
    with matching as materialized (
      select event.* from public.crm_authorized_timeline_events(from_ts, to_ts, p_categories, p_ticket_id, p_department, p_manager_id, p_status, p_stage, p_activity_type) event
      where event.event_category = lower(p_category)
        and (event.occurred_at at time zone timezone_name) >= p_bucket_start::timestamp
        and (event.occurred_at at time zone timezone_name) < bucket_end::timestamp
    ), records as (
      select jsonb_build_object(
        'id', event.id, 'ticketId', event.ticket_id, 'ticketNumber', left(event.ticket_id::text, 8),
        'ticketTitle', ticket.project_title, 'companyName', crm_case.company_name,
        'category', event.event_category, 'eventType', event.event_type, 'occurredAt', event.occurred_at,
        'actorName', coalesce(actor_profile.display_name, actor_profile.email::text, 'System'),
        'department', ticket.current_department,
        'title', case when event.event_category = 'activity' then event.title
          when can_sensitive or communication.created_by_user_id = actor then coalesce(communication.subject, event.title)
          else 'Restricted ' || event.event_category end,
        'description', case when event.event_category = 'activity' then event.description
          when can_sensitive or communication.created_by_user_id = actor then event.description else null end,
        'previousValue', event.previous_value, 'newValue', event.new_value,
        'metadata', case when event.event_category = 'activity' and can_sensitive then event.metadata else '{}'::jsonb end,
        'direction', communication.direction, 'status', communication.status,
        'sender', case when can_sensitive or communication.created_by_user_id = actor then communication.sender else null end,
        'recipients', case when can_sensitive or communication.created_by_user_id = actor then to_jsonb(communication.recipients) else '[]'::jsonb end,
        'hasAttachments', case when can_sensitive or communication.created_by_user_id = actor then communication.has_attachments else false end,
        'durationSeconds', case when can_sensitive or communication.created_by_user_id = actor then communication.duration_seconds else null end,
        'notes', case when can_sensitive or communication.created_by_user_id = actor then communication.notes else null end,
        'contactName', case when can_sensitive or communication.created_by_user_id = actor then contact.name else null end,
        'recordingAvailable', can_sensitive and communication.recording_url is not null and communication.recording_availability_status = 'AVAILABLE'
      ) value, event.occurred_at
      from matching event
      join public.crm_tickets ticket on ticket.id = event.ticket_id
      join public.crm_cases crm_case on crm_case.id = ticket.case_id
      left join public.profiles actor_profile on actor_profile.id = event.actor_user_id
      left join public.crm_ticket_communications communication on communication.id = event.communication_id
      left join public.crm_ticket_contacts contact on contact.id = communication.contact_id
      order by event.occurred_at desc
      limit safe_size offset (safe_page - 1) * safe_size
    )
    select jsonb_build_object(
      'page', safe_page, 'pageSize', safe_size, 'total', (select count(*) from matching),
      'records', coalesce((select jsonb_agg(value order by occurred_at desc) from records), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.get_crm_timeline_filter_options()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return (
    with tickets as materialized (
      select ticket.* from public.crm_tickets ticket join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
      where ticket.deleted_at is null and public.crm_can_access_ticket(ticket.id, 'tickets.read')
    )
    select jsonb_build_object(
      'departments', coalesce((select jsonb_agg(distinct jsonb_build_object('value', department.slug, 'label', department.name)) from tickets join public.crm_departments department on department.slug = tickets.current_department), '[]'::jsonb),
      'stages', coalesce((select jsonb_agg(distinct jsonb_build_object('value', stage.slug, 'label', stage.name)) from tickets join public.crm_ticket_stages stage on stage.slug = tickets.stage), '[]'::jsonb),
      'managers', coalesce((select jsonb_agg(distinct jsonb_build_object('value', profile.id, 'label', coalesce(profile.display_name, profile.email::text))) from tickets join public.profiles profile on profile.id = tickets.responsible_manager_id), '[]'::jsonb),
      'statuses', coalesce((select jsonb_agg(distinct tickets.status) from tickets), '[]'::jsonb),
      'activityTypes', coalesce((select jsonb_agg(distinct activity.action order by activity.action) from public.crm_ticket_activity activity join tickets on tickets.id = activity.ticket_id), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.search_crm_timeline_tickets(p_search text default '', p_limit integer default 30)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return (
    select coalesce(jsonb_agg(item), '[]'::jsonb) from (
      select jsonb_build_object('id', ticket.id, 'number', left(ticket.id::text, 8), 'title', ticket.project_title, 'companyName', crm_case.company_name) item
      from public.crm_tickets ticket join public.crm_cases crm_case on crm_case.id = ticket.case_id and crm_case.deleted_at is null
      where ticket.deleted_at is null and public.crm_can_access_ticket(ticket.id, 'tickets.read')
        and (trim(coalesce(p_search, '')) = '' or ticket.project_title ilike '%' || trim(p_search) || '%'
          or crm_case.company_name ilike '%' || trim(p_search) || '%' or ticket.id::text ilike trim(p_search) || '%')
      order by ticket.updated_at desc limit least(greatest(coalesce(p_limit, 30), 1), 50)
    ) authorized_tickets
  );
end;
$$;

create or replace function public.record_crm_communication_launch(
  p_ticket_id uuid, p_category text, p_contact_id uuid, p_recipient text, p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); category_name text := upper(p_category); contact public.crm_ticket_contacts%rowtype; communication_id uuid; sender_value text;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then raise exception 'Ticket not found or access denied'; end if;
  if category_name not in ('EMAIL','CALL') then raise exception 'Select Email or Call'; end if;
  if p_client_request_id is null then raise exception 'A request identifier is required'; end if;
  select * into contact from public.crm_ticket_contacts where id = p_contact_id and ticket_id = p_ticket_id;
  if contact.id is null then raise exception 'Select a valid Ticket contact'; end if;
  if category_name = 'EMAIL' and (contact.email is null or lower(trim(contact.email::text)) <> lower(trim(p_recipient))) then raise exception 'Select a valid contact email'; end if;
  if category_name = 'CALL' and (contact.phone_number is null or regexp_replace(contact.phone_number, '[[:space:]]', '', 'g') <> regexp_replace(p_recipient, '[[:space:]]', '', 'g')) then raise exception 'Select a valid contact phone number'; end if;
  select profile.email::text into sender_value from public.profiles profile where profile.id = actor;
  insert into public.crm_ticket_communications (
    ticket_id, contact_id, category, event_type, direction, status, sender, recipients,
    responsible_user_id, created_by_user_id, client_request_id
  ) values (
    p_ticket_id, contact.id, category_name, category_name || '_INITIATED', 'OUTBOUND', 'INITIATED',
    sender_value, array[trim(p_recipient)], actor, actor, p_client_request_id
  ) on conflict (created_by_user_id, client_request_id) where client_request_id is not null do nothing
  returning id into communication_id;
  if communication_id is null then select id into communication_id from public.crm_ticket_communications where created_by_user_id = actor and client_request_id = p_client_request_id; end if;
  return jsonb_build_object('id', communication_id, 'category', category_name, 'status', 'INITIATED');
end;
$$;

revoke all on function public.crm_timeline_timezone() from public, anon, authenticated;
revoke all on function public.crm_validate_timeline_query(date,date,text,text[],uuid,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.crm_authorized_timeline_events(timestamptz,timestamptz,text[],uuid,text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.get_crm_timeline(date,date,text,text[],uuid,text,uuid,text,text,text) to authenticated;
grant execute on function public.list_crm_timeline_details(date,date,text,text[],date,text,uuid,text,uuid,text,text,text,integer,integer) to authenticated;
grant execute on function public.get_crm_timeline_filter_options() to authenticated;
grant execute on function public.search_crm_timeline_tickets(text,integer) to authenticated;
grant execute on function public.record_crm_communication_launch(uuid,text,uuid,text,uuid) to authenticated;
