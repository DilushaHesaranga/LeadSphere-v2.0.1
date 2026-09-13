begin;
-- Shared rate limits for the optional AI Assistant, across Edge instances.
-- No ticket records or conversations are written to this table.
create table if not exists public.ai_assistant_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  request_count integer not null default 0,
  resets_at timestamptz not null,
  lease_id uuid,
  lease_until timestamptz not null default '-infinity'
);
alter table public.ai_assistant_usage enable row level security;
revoke all on public.ai_assistant_usage from public, anon, authenticated;

create or replace function public.claim_ai_assistant_request(p_ticket_id uuid, p_request_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if p_request_id is null then raise exception 'Request identifier required'; end if;
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then
    raise exception 'Ticket not found or access denied';
  end if;
  insert into public.ai_assistant_usage as usage (user_id, request_count, resets_at, lease_id, lease_until)
    values (actor, 1, now() + interval '1 hour', p_request_id, now() + interval '50 seconds')
  on conflict (user_id) do update set
    request_count = case when usage.resets_at <= now() then 1 else usage.request_count + 1 end,
    resets_at = case when usage.resets_at <= now() then now() + interval '1 hour' else usage.resets_at end,
    lease_id = p_request_id,
    lease_until = now() + interval '50 seconds'
  where usage.lease_until <= now() and (usage.resets_at <= now() or usage.request_count < 20);
  return found;
end;
$$;

create or replace function public.release_ai_assistant_request(p_request_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.ai_assistant_usage set lease_id = null, lease_until = '-infinity'
  where user_id = (select auth.uid()) and lease_id = p_request_id;
$$;
revoke all on function public.claim_ai_assistant_request(uuid, uuid) from public, anon;
revoke all on function public.release_ai_assistant_request(uuid) from public, anon;
grant execute on function public.claim_ai_assistant_request(uuid, uuid) to authenticated;
grant execute on function public.release_ai_assistant_request(uuid) to authenticated;
commit;
