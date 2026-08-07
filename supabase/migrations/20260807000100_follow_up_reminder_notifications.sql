-- Durable Follow Up reminders. The queue stores only four checkpoints for the
-- current occurrence. Recipients are resolved from active Ticket assignments
-- when a checkpoint is processed, so reassignment is respected automatically.

create extension if not exists pg_cron with schema extensions;

alter table public.crm_follow_up_occurrences
  add column if not exists reminder_revision integer not null default 1;

create unique index if not exists crm_follow_up_occurrences_id_ticket_unique
  on public.crm_follow_up_occurrences (id, ticket_id);

create table if not exists public.crm_follow_up_reminders (
  id uuid primary key default gen_random_uuid(),
  occurrence_id uuid not null,
  ticket_id uuid not null,
  schedule_revision integer not null,
  reminder_offset_minutes integer not null,
  scheduled_for timestamptz not null,
  status text not null default 'SCHEDULED',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz,
  recipient_count integer not null default 0,
  processed_at timestamptz,
  cancelled_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_follow_up_reminders_offset check (reminder_offset_minutes in (30, 15, 5, 0)),
  constraint crm_follow_up_reminders_status check (status in ('SCHEDULED','PROCESSING','SENT','FAILED','CANCELLED')),
  constraint crm_follow_up_reminders_attempt_count check (attempt_count between 0 and 5),
  constraint crm_follow_up_reminders_recipient_count check (recipient_count >= 0),
  constraint crm_follow_up_reminders_revision check (schedule_revision > 0),
  constraint crm_follow_up_reminders_occurrence_ticket_fk
    foreign key (occurrence_id, ticket_id)
    references public.crm_follow_up_occurrences(id, ticket_id) on delete cascade,
  constraint crm_follow_up_reminders_identity unique (occurrence_id, schedule_revision, reminder_offset_minutes)
);

create index if not exists crm_follow_up_reminders_scheduled_due_idx
  on public.crm_follow_up_reminders (scheduled_for, id) where status = 'SCHEDULED';
create index if not exists crm_follow_up_reminders_retry_due_idx
  on public.crm_follow_up_reminders (next_attempt_at, id)
  where status = 'FAILED' and attempt_count < 5;
create index if not exists crm_follow_up_reminders_occurrence_idx
  on public.crm_follow_up_reminders (occurrence_id, status);

alter table public.crm_follow_up_reminders enable row level security;
revoke all on table public.crm_follow_up_reminders from public, anon, authenticated;

create or replace function public.crm_follow_up_reminder_title(p_offset integer)
returns text language sql immutable set search_path = '' as $$
  select case p_offset
    when 30 then 'Follow Up in 30 Minutes'
    when 15 then 'Follow Up in 15 Minutes'
    when 5 then 'Follow Up in 5 Minutes'
    when 0 then 'Follow Up Due Now'
  end;
$$;

create or replace function public.crm_follow_up_reminder_message(p_offset integer, p_ticket_number text)
returns text language sql immutable set search_path = '' as $$
  select case p_offset
    when 30 then 'A follow up for ticket #' || p_ticket_number || ' is scheduled in 30 minutes.'
    when 15 then 'A follow up for ticket #' || p_ticket_number || ' is scheduled in 15 minutes.'
    when 5 then 'A follow up for ticket #' || p_ticket_number || ' is scheduled in 5 minutes.'
    when 0 then 'The scheduled follow up for ticket #' || p_ticket_number || ' is due now.'
  end;
$$;

create or replace function public.crm_schedule_follow_up_reminders(p_occurrence_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  occurrence public.crm_follow_up_occurrences%rowtype;
  inserted_count integer := 0;
begin
  select * into occurrence
  from public.crm_follow_up_occurrences
  where id = p_occurrence_id;

  if occurrence.id is null then return 0; end if;

  if occurrence.status <> 'PENDING' or not exists (
    select 1 from public.crm_tickets ticket
    where ticket.id = occurrence.ticket_id
      and ticket.status = 'active'
      and ticket.deleted_at is null
  ) then
    update public.crm_follow_up_reminders
    set status = 'CANCELLED', cancelled_at = coalesce(cancelled_at, clock_timestamp()),
      next_attempt_at = null, updated_at = clock_timestamp()
    where occurrence_id = occurrence.id
      and status in ('SCHEDULED','PROCESSING','FAILED');
    return 0;
  end if;

  insert into public.crm_follow_up_reminders
    (occurrence_id, ticket_id, schedule_revision, reminder_offset_minutes, scheduled_for)
  select occurrence.id, occurrence.ticket_id, occurrence.reminder_revision, checkpoint.offset_minutes,
    occurrence.scheduled_at - make_interval(mins => checkpoint.offset_minutes)
  from unnest(array[30, 15, 5, 0]) as checkpoint(offset_minutes)
  where occurrence.scheduled_at - make_interval(mins => checkpoint.offset_minutes) >= now()
  on conflict (occurrence_id, schedule_revision, reminder_offset_minutes) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.crm_prepare_follow_up_reminder_revision()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.scheduled_at is distinct from new.scheduled_at then
    new.reminder_revision := old.reminder_revision + 1;
  end if;
  return new;
end;
$$;

create or replace function public.crm_sync_follow_up_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.crm_schedule_follow_up_reminders(new.id);
    return new;
  end if;

  if old.scheduled_at is distinct from new.scheduled_at then
    update public.crm_follow_up_reminders
    set status = 'CANCELLED', cancelled_at = coalesce(cancelled_at, clock_timestamp()),
      next_attempt_at = null, updated_at = clock_timestamp()
    where occurrence_id = new.id
      and schedule_revision <> new.reminder_revision
      and status in ('SCHEDULED','PROCESSING','FAILED');
  end if;

  if new.status <> 'PENDING' then
    update public.crm_follow_up_reminders
    set status = 'CANCELLED', cancelled_at = coalesce(cancelled_at, clock_timestamp()),
      next_attempt_at = null, updated_at = clock_timestamp()
    where occurrence_id = new.id
      and status in ('SCHEDULED','PROCESSING','FAILED');
  elsif old.scheduled_at is distinct from new.scheduled_at
     or old.status is distinct from new.status then
    perform public.crm_schedule_follow_up_reminders(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists crm_follow_up_occurrences_prepare_reminder_revision on public.crm_follow_up_occurrences;
create trigger crm_follow_up_occurrences_prepare_reminder_revision
before update of scheduled_at on public.crm_follow_up_occurrences
for each row execute function public.crm_prepare_follow_up_reminder_revision();

drop trigger if exists crm_follow_up_occurrences_sync_reminders on public.crm_follow_up_occurrences;
create trigger crm_follow_up_occurrences_sync_reminders
after insert or update of scheduled_at, status on public.crm_follow_up_occurrences
for each row execute function public.crm_sync_follow_up_reminders();

create or replace function public.crm_sync_ticket_follow_up_reminders()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pending_occurrence record;
begin
  if new.status <> 'active' or new.deleted_at is not null then
    update public.crm_follow_up_reminders
    set status = 'CANCELLED', cancelled_at = coalesce(cancelled_at, clock_timestamp()),
      next_attempt_at = null, updated_at = clock_timestamp()
    where ticket_id = new.id and status in ('SCHEDULED','PROCESSING','FAILED');
  elsif old.status is distinct from new.status or old.deleted_at is distinct from new.deleted_at then
    for pending_occurrence in
      select id from public.crm_follow_up_occurrences
      where ticket_id = new.id and status = 'PENDING'
    loop
      perform public.crm_schedule_follow_up_reminders(pending_occurrence.id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_tickets_sync_follow_up_reminders on public.crm_tickets;
create trigger crm_tickets_sync_follow_up_reminders
after update of status, deleted_at on public.crm_tickets
for each row execute function public.crm_sync_ticket_follow_up_reminders();

create or replace function public.process_crm_follow_up_reminders(
  p_batch_size integer default 100,
  p_now timestamptz default clock_timestamp()
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  reminder public.crm_follow_up_reminders%rowtype;
  occurrence public.crm_follow_up_occurrences%rowtype;
  ticket public.crm_tickets%rowtype;
  delivered_count integer;
  sent_checkpoints integer := 0;
  cancelled_checkpoints integer := 0;
  failed_checkpoints integer := 0;
begin
  for reminder in
    with candidates as (
      select queued.id
      from public.crm_follow_up_reminders queued
      where (queued.status = 'SCHEDULED' and queued.scheduled_for <= p_now)
         or (queued.status = 'FAILED' and queued.attempt_count < 5 and queued.next_attempt_at <= p_now)
      order by coalesce(queued.next_attempt_at, queued.scheduled_for), queued.id
      for update skip locked
      limit least(greatest(coalesce(p_batch_size, 100), 1), 500)
    )
    update public.crm_follow_up_reminders queued
    set status = 'PROCESSING', attempt_count = queued.attempt_count + 1,
      next_attempt_at = null, last_error = null, updated_at = clock_timestamp()
    from candidates where queued.id = candidates.id
    returning queued.*
  loop
    begin
      select * into occurrence from public.crm_follow_up_occurrences
      where id = reminder.occurrence_id for share;
      select * into ticket from public.crm_tickets
      where id = reminder.ticket_id for share;

      if occurrence.id is null
        or occurrence.status <> 'PENDING'
        or occurrence.reminder_revision <> reminder.schedule_revision
        or ticket.id is null
        or ticket.status <> 'active'
        or ticket.deleted_at is not null then
        update public.crm_follow_up_reminders
        set status = 'CANCELLED', cancelled_at = clock_timestamp(),
          next_attempt_at = null, updated_at = clock_timestamp()
        where id = reminder.id;
        cancelled_checkpoints := cancelled_checkpoints + 1;
        continue;
      end if;

      insert into public.user_notifications (user_id, kind, title, message, link, event_key)
      select distinct assignment.user_id,
        'follow_up_reminder',
        public.crm_follow_up_reminder_title(reminder.reminder_offset_minutes),
        public.crm_follow_up_reminder_message(reminder.reminder_offset_minutes, left(ticket.id::text, 8)),
        '/console/tickets/' || ticket.id::text,
        'follow-up-reminder:' || occurrence.id::text || ':' || reminder.schedule_revision::text || ':' || reminder.reminder_offset_minutes::text
      from public.crm_ticket_assignments assignment
      join public.profiles profile on profile.id = assignment.user_id and profile.status = 'active'
      where assignment.ticket_id = ticket.id and assignment.removed_at is null
      on conflict (user_id, event_key) do nothing;
      get diagnostics delivered_count = row_count;

      update public.crm_follow_up_reminders
      set status = 'SENT', recipient_count = delivered_count,
        processed_at = clock_timestamp(), next_attempt_at = null,
        last_error = null, updated_at = clock_timestamp()
      where id = reminder.id;
      sent_checkpoints := sent_checkpoints + 1;
    exception when others then
      update public.crm_follow_up_reminders
      set status = 'FAILED', last_error = left(sqlerrm, 1000),
        next_attempt_at = case when reminder.attempt_count < 5
          then p_now + make_interval(mins => least(30, (power(2, reminder.attempt_count - 1))::integer))
          else null end,
        updated_at = clock_timestamp()
      where id = reminder.id;
      failed_checkpoints := failed_checkpoints + 1;
    end;
  end loop;

  return jsonb_build_object(
    'sent', sent_checkpoints,
    'cancelled', cancelled_checkpoints,
    'failed', failed_checkpoints
  );
end;
$$;

-- Schedule only applicable checkpoints for existing pending occurrences.
select public.crm_schedule_follow_up_reminders(occurrence.id)
from public.crm_follow_up_occurrences occurrence
join public.crm_tickets ticket on ticket.id = occurrence.ticket_id
where occurrence.status = 'PENDING'
  and ticket.status = 'active'
  and ticket.deleted_at is null;

do $$
declare existing_job_id bigint;
begin
  select jobid into existing_job_id from cron.job
  where jobname = 'leadsphere-follow-up-reminders'
  order by jobid desc limit 1;
  if existing_job_id is not null then perform cron.unschedule(existing_job_id); end if;
  perform cron.schedule(
    'leadsphere-follow-up-reminders',
    '* * * * *',
    'select public.process_crm_follow_up_reminders(200, clock_timestamp());'
  );
end;
$$;

revoke all on function public.crm_follow_up_reminder_title(integer) from public, anon, authenticated;
revoke all on function public.crm_follow_up_reminder_message(integer, text) from public, anon, authenticated;
revoke all on function public.crm_schedule_follow_up_reminders(uuid) from public, anon, authenticated;
revoke all on function public.crm_prepare_follow_up_reminder_revision() from public, anon, authenticated;
revoke all on function public.crm_sync_follow_up_reminders() from public, anon, authenticated;
revoke all on function public.crm_sync_ticket_follow_up_reminders() from public, anon, authenticated;
revoke all on function public.process_crm_follow_up_reminders(integer, timestamptz) from public, anon, authenticated;
