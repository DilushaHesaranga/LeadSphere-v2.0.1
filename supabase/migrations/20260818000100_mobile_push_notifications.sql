-- Register mobile devices per authenticated user and make delivery claiming
-- idempotent across duplicate database webhooks and concurrent Edge workers.

create table if not exists public.mobile_push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  expo_push_token text not null unique,
  platform text not null,
  active boolean not null default true,
  last_registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_push_devices_user_device_unique unique (user_id, device_id),
  constraint mobile_push_devices_platform_check check (platform in ('android', 'ios')),
  constraint mobile_push_devices_token_length check (char_length(expo_push_token) between 20 and 300)
);

create index if not exists mobile_push_devices_active_user_idx
  on public.mobile_push_devices (user_id)
  where active;

alter table public.mobile_push_devices enable row level security;

create table if not exists public.mobile_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.user_notifications(id) on delete cascade,
  device_id uuid not null references public.mobile_push_devices(id) on delete cascade,
  status text not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  expo_ticket_id text,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mobile_push_deliveries_unique unique (notification_id, device_id),
  constraint mobile_push_deliveries_status_check
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  constraint mobile_push_deliveries_attempts_check check (attempts between 0 and 5)
);

create index if not exists mobile_push_deliveries_retry_idx
  on public.mobile_push_deliveries (next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.mobile_push_deliveries enable row level security;

create or replace function public.register_mobile_push_device(
  p_device_id uuid,
  p_expo_push_token text,
  p_platform text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  normalized_token text := btrim(p_expo_push_token);
  registered_id uuid;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_device_id is null then raise exception 'Device ID is required'; end if;
  if p_platform not in ('android', 'ios') then raise exception 'Unsupported platform'; end if;
  if normalized_token !~ E'^(Expo(nent)?PushToken)\\[[^]]+\\]$' then
    raise exception 'Invalid Expo push token';
  end if;

  delete from public.mobile_push_devices
  where user_id = actor
    and device_id = p_device_id
    and expo_push_token <> normalized_token;

  insert into public.mobile_push_devices (
    user_id, device_id, expo_push_token, platform, active,
    last_registered_at, updated_at
  ) values (
    actor, p_device_id, normalized_token, p_platform, true, now(), now()
  )
  on conflict (expo_push_token) do update set
    user_id = excluded.user_id,
    device_id = excluded.device_id,
    platform = excluded.platform,
    active = true,
    last_registered_at = now(),
    updated_at = now()
  returning id into registered_id;

  return jsonb_build_object('deviceId', registered_id, 'active', true);
end;
$$;

create or replace function public.unregister_mobile_push_device(p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  affected integer;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  update public.mobile_push_devices
  set active = false, updated_at = now()
  where user_id = actor and device_id = p_device_id and active;
  get diagnostics affected = row_count;
  return jsonb_build_object('updated', affected);
end;
$$;

create or replace function public.claim_mobile_push_deliveries(
  p_notification_id uuid,
  p_limit integer default 100
)
returns table (
  delivery_id uuid,
  expo_push_token text,
  platform text,
  attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.mobile_push_deliveries (notification_id, device_id)
  select p_notification_id, device.id
  from public.user_notifications notification
  join public.mobile_push_devices device
    on device.user_id = notification.user_id and device.active
  where notification.id = p_notification_id
  on conflict (notification_id, device_id) do nothing;

  return query
  with candidates as (
    select delivery.id
    from public.mobile_push_deliveries delivery
    where delivery.notification_id = p_notification_id
      and delivery.status in ('pending', 'failed')
      and delivery.attempts < 5
      and delivery.next_attempt_at <= now()
    order by delivery.created_at
    for update skip locked
    limit least(greatest(p_limit, 1), 100)
  ), claimed as (
    update public.mobile_push_deliveries delivery
    set status = 'processing',
        attempts = delivery.attempts + 1,
        updated_at = now(),
        last_error = null
    from candidates
    where delivery.id = candidates.id
    returning delivery.id, delivery.device_id, delivery.attempts
  )
  select claimed.id, device.expo_push_token, device.platform, claimed.attempts
  from claimed
  join public.mobile_push_devices device on device.id = claimed.device_id
  where device.active;
end;
$$;

revoke all on table public.mobile_push_devices from public, anon, authenticated;
revoke all on table public.mobile_push_deliveries from public, anon, authenticated;
revoke all on function public.register_mobile_push_device(uuid, text, text) from public, anon;
revoke all on function public.unregister_mobile_push_device(uuid) from public, anon;
revoke all on function public.claim_mobile_push_deliveries(uuid, integer) from public, anon, authenticated;
grant execute on function public.register_mobile_push_device(uuid, text, text) to authenticated;
grant execute on function public.unregister_mobile_push_device(uuid) to authenticated;
grant execute on function public.claim_mobile_push_deliveries(uuid, integer) to service_role;
