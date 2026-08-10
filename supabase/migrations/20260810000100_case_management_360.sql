-- Case 360 management. crm_cases remains the single company/account entity and
-- crm_tickets remains the authoritative operational history.

alter table public.crm_cases
  add column if not exists display_name text,
  add column if not exists legal_name text,
  add column if not exists logo_url text,
  add column if not exists industry text,
  add column if not exists company_type text,
  add column if not exists website text,
  add column if not exists primary_email extensions.citext,
  add column if not exists primary_phone text,
  add column if not exists additional_emails text[] not null default '{}',
  add column if not exists additional_phones text[] not null default '{}',
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists region text,
  add column if not exists country text,
  add column if not exists company_size text,
  add column if not exists employee_count integer,
  add column if not exists annual_revenue numeric(18,2),
  add column if not exists lifecycle_stage text not null default 'prospect',
  add column if not exists case_status text not null default 'active',
  add column if not exists source text,
  add column if not exists first_contact_date date,
  add column if not exists account_owner_id uuid references auth.users(id) on delete set null,
  add column if not exists sales_manager_id uuid references auth.users(id) on delete set null,
  add column if not exists delivery_manager_id uuid references auth.users(id) on delete set null,
  add column if not exists priority text not null default 'normal',
  add column if not exists tags text[] not null default '{}',
  add column if not exists description text,
  add column if not exists risk_level text not null default 'low',
  add column if not exists opportunity_level text not null default 'medium',
  add column if not exists updated_by_user_id uuid references auth.users(id) on delete set null;

do $$ begin
  alter table public.crm_cases add constraint crm_cases_lifecycle_stage_check
    check (lifecycle_stage in ('prospect','lead','qualified','customer','active_customer','inactive_customer','lost','archived'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_status_check
    check (case_status in ('active','inactive','customer','at_risk','closed','archived'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_priority_check
    check (priority in ('low','normal','high','critical'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_risk_check check (risk_level in ('low','medium','high'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_opportunity_check check (opportunity_level in ('low','medium','high'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_employee_count_check check (employee_count is null or employee_count >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_revenue_check check (annual_revenue is null or annual_revenue >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.crm_cases add constraint crm_cases_email_shape check (
    primary_email is null or primary_email::text ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  );
exception when duplicate_object then null; end $$;

create index if not exists crm_cases_status_updated_idx on public.crm_cases(case_status, updated_at desc) where deleted_at is null;
create index if not exists crm_cases_lifecycle_updated_idx on public.crm_cases(lifecycle_stage, updated_at desc) where deleted_at is null;
create index if not exists crm_cases_owner_updated_idx on public.crm_cases(account_owner_id, updated_at desc) where deleted_at is null;
create index if not exists crm_cases_industry_idx on public.crm_cases(lower(industry)) where deleted_at is null;

create table if not exists public.crm_case_contacts (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_cases(id) on delete cascade,
  full_name text not null,
  job_title text,
  department text,
  email extensions.citext,
  phone text,
  secondary_phone text,
  preferred_method text,
  is_decision_maker boolean not null default false,
  is_primary boolean not null default false,
  notes text,
  status text not null default 'active',
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_case_contacts_name_check check (char_length(trim(full_name)) between 2 and 120),
  constraint crm_case_contacts_method_check check (email is not null or nullif(trim(coalesce(phone,'')), '') is not null),
  constraint crm_case_contacts_email_check check (email is null or email::text ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  constraint crm_case_contacts_preferred_check check (preferred_method is null or preferred_method in ('email','phone','meeting')),
  constraint crm_case_contacts_status_check check (status in ('active','inactive'))
);
create index if not exists crm_case_contacts_case_idx on public.crm_case_contacts(case_id, is_primary desc, full_name);
create index if not exists crm_case_contacts_email_idx on public.crm_case_contacts(lower(email::text)) where email is not null;
create unique index if not exists crm_case_contacts_one_primary on public.crm_case_contacts(case_id) where is_primary and status = 'active';
create unique index if not exists crm_case_contacts_case_email_unique on public.crm_case_contacts(case_id, lower(email::text)) where email is not null;

create table if not exists public.crm_case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_cases(id) on delete cascade,
  ticket_id uuid references public.crm_tickets(id) on delete set null,
  content text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_case_notes_content_check check (char_length(trim(content)) between 1 and 5000)
);
create index if not exists crm_case_notes_case_time_idx on public.crm_case_notes(case_id, created_at desc);

drop trigger if exists crm_case_contacts_set_updated_at on public.crm_case_contacts;
create trigger crm_case_contacts_set_updated_at before update on public.crm_case_contacts
for each row execute function public.set_updated_at();
drop trigger if exists crm_case_notes_set_updated_at on public.crm_case_notes;
create trigger crm_case_notes_set_updated_at before update on public.crm_case_notes
for each row execute function public.set_updated_at();

-- Existing Ticket contacts are preserved and projected into the Case address book.
insert into public.crm_case_contacts (case_id, full_name, email, phone, is_primary, created_by_user_id, created_at)
select distinct on (ticket.case_id, lower(coalesce(contact.email::text,'')), regexp_replace(coalesce(contact.phone_number,''),'[^0-9+]','','g'))
  ticket.case_id, contact.name, contact.email, contact.phone_number,
  false, contact.created_by_user_id, contact.created_at
from public.crm_ticket_contacts contact
join public.crm_tickets ticket on ticket.id = contact.ticket_id
where ticket.deleted_at is null
  and not exists (
    select 1 from public.crm_case_contacts current_contact
    where current_contact.case_id = ticket.case_id
      and ((contact.email is not null and lower(current_contact.email::text) = lower(contact.email::text))
        or (contact.email is null and regexp_replace(coalesce(current_contact.phone,''),'[^0-9+]','','g') = regexp_replace(coalesce(contact.phone_number,''),'[^0-9+]','','g')))
  )
order by ticket.case_id, lower(coalesce(contact.email::text,'')), regexp_replace(coalesce(contact.phone_number,''),'[^0-9+]','','g'), contact.created_at;

create or replace function public.crm_sync_ticket_contact_to_case()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_case uuid;
begin
  select case_id into target_case from public.crm_tickets where id = new.ticket_id;
  if target_case is null then return new; end if;
  if new.email is not null then
    insert into public.crm_case_contacts(case_id, full_name, email, phone, created_by_user_id, created_at)
    values(target_case, new.name, new.email, new.phone_number, new.created_by_user_id, new.created_at)
    on conflict (case_id, lower(email::text)) where email is not null do update
      set full_name = excluded.full_name,
          phone = coalesce(public.crm_case_contacts.phone, excluded.phone),
          updated_by_user_id = excluded.created_by_user_id;
  elsif not exists (
    select 1 from public.crm_case_contacts c where c.case_id = target_case
      and regexp_replace(coalesce(c.phone,''),'[^0-9+]','','g') = regexp_replace(coalesce(new.phone_number,''),'[^0-9+]','','g')
  ) then
    insert into public.crm_case_contacts(case_id, full_name, phone, created_by_user_id, created_at)
    values(target_case, new.name, new.phone_number, new.created_by_user_id, new.created_at);
  end if;
  return new;
end;
$$;
drop trigger if exists crm_ticket_contacts_sync_case on public.crm_ticket_contacts;
create trigger crm_ticket_contacts_sync_case after insert or update of name,email,phone_number on public.crm_ticket_contacts
for each row execute function public.crm_sync_ticket_contact_to_case();

insert into public.permissions(slug, description) values
  ('cases.update', 'Update authorised Case profiles'),
  ('cases.contacts.manage', 'Manage contacts for authorised Cases'),
  ('cases.notes.create', 'Add internal notes to authorised Cases'),
  ('cases.restore', 'Restore archived Cases')
on conflict (slug) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id, access_scope)
select role.id, permission.id, matrix.scope::public.data_access_scope
from (values
  ('marketing_executive','cases.notes.create','assigned'),
  ('sales_executive','cases.notes.create','assigned'),
  ('marketing_manager','cases.update','team'),('marketing_manager','cases.contacts.manage','team'),('marketing_manager','cases.notes.create','team'),
  ('sales_manager','cases.update','team'),('sales_manager','cases.contacts.manage','team'),('sales_manager','cases.notes.create','team'),
  ('delivery_manager','cases.update','team'),('delivery_manager','cases.contacts.manage','team'),('delivery_manager','cases.notes.create','team'),
  ('leadership','cases.update','company'),('leadership','cases.contacts.manage','company'),('leadership','cases.notes.create','company'),('leadership','cases.restore','company'),
  ('system_admin','cases.update','company'),('system_admin','cases.contacts.manage','company'),('system_admin','cases.notes.create','company'),('system_admin','cases.restore','company')
) matrix(role_slug, permission_slug, scope)
join public.roles role on role.slug = matrix.role_slug
join public.permissions permission on permission.slug = matrix.permission_slug
on conflict(role_id, permission_id) do update set access_scope = excluded.access_scope;

alter table public.crm_case_contacts enable row level security;
alter table public.crm_case_notes enable row level security;
drop policy if exists crm_case_contacts_read on public.crm_case_contacts;
create policy crm_case_contacts_read on public.crm_case_contacts for select to authenticated
using (public.crm_can_access_case(case_id, 'cases.read'));
drop policy if exists crm_case_notes_read on public.crm_case_notes;
create policy crm_case_notes_read on public.crm_case_notes for select to authenticated
using (public.crm_can_access_case(case_id, 'cases.read'));
grant select on public.crm_case_contacts, public.crm_case_notes to authenticated;
revoke insert, update, delete on public.crm_case_contacts, public.crm_case_notes from authenticated;

create or replace function public.crm_case_rate(p_numerator bigint, p_denominator bigint)
returns numeric language sql immutable set search_path = '' as $$
  select case when p_denominator = 0 then null else round((p_numerator::numeric * 100) / p_denominator, 1) end
$$;

create or replace function public.crm_case_metrics(p_case_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
with tickets as (
  select * from public.crm_tickets where case_id = p_case_id and deleted_at is null
), decisions as (
  select distinct on (request.ticket_id) request.ticket_id, request.status
  from public.crm_ticket_permission_requests request join tickets on tickets.id = request.ticket_id
  where request.request_type = 'POST_TICKET' and request.status <> 'PENDING'
  order by request.ticket_id, request.reviewed_at desc nulls last, request.created_at desc
), totals as (
  select count(*) total,
    count(*) filter(where status = 'active') open_count,
    count(*) filter(where status = 'closed') closed_count,
    count(*) filter(where stage = 'close_won') won,
    count(*) filter(where stage = 'lost') lost,
    max(updated_at) ticket_last
  from tickets
), decision_totals as (
  select count(*) filter(where status in ('APPROVED','MODIFIED')) accepted,
    count(*) filter(where status = 'REJECTED') rejected from decisions
), followups as (
  select min(occurrence.scheduled_at) filter(where occurrence.status='PENDING' and occurrence.scheduled_at >= now()) next_follow_up,
    bool_or(occurrence.status='PENDING' and occurrence.scheduled_at < now()) overdue
  from public.crm_follow_up_occurrences occurrence join tickets on tickets.id = occurrence.ticket_id
), activity as (
  select greatest(
    (select max(a.created_at) from public.crm_case_activity a where a.case_id=p_case_id),
    (select max(a.created_at) from public.crm_ticket_activity a join tickets t on t.id=a.ticket_id),
    (select max(c.occurred_at) from public.crm_ticket_communications c join tickets t on t.id=c.ticket_id),
    (select max(n.created_at) from public.crm_case_notes n where n.case_id=p_case_id),
    (select ticket_last from totals)
  ) last_interaction
)
select jsonb_build_object(
  'totalTickets', totals.total, 'openTickets', totals.open_count, 'closedTickets', totals.closed_count,
  'wonTickets', totals.won, 'lostTickets', totals.lost,
  'acceptedTickets', decision_totals.accepted, 'rejectedTickets', decision_totals.rejected,
  'acceptanceRate', public.crm_case_rate(decision_totals.accepted, decision_totals.accepted + decision_totals.rejected),
  'winRate', public.crm_case_rate(totals.won, totals.won + totals.lost),
  'lastInteraction', activity.last_interaction, 'nextFollowUp', followups.next_follow_up,
  'hasOverdueFollowUp', coalesce(followups.overdue,false),
  'averageResponseHours', null, 'averageResolutionHours',
    (select round(avg(extract(epoch from (closed_at-created_at))/3600)::numeric,1) from tickets where closed_at is not null),
  'totalValue', null, 'wonValue', null, 'pendingValue', null
)
from totals cross join decision_totals cross join followups cross join activity
where public.crm_can_access_case(p_case_id,'cases.read')
$$;

create or replace function public.list_crm_case_management(
  p_search text default '', p_filters jsonb default '{}'::jsonb,
  p_sort text default 'updatedAt', p_direction text default 'desc',
  p_page integer default 1, p_page_size integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; safe_page integer := greatest(coalesce(p_page,1),1); safe_size integer := least(greatest(coalesce(p_page_size,25),1),100);
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  with base as (
    select c.*, public.crm_case_metrics(c.id) metrics,
      coalesce(owner.display_name, owner.email::text) owner_name,
      coalesce(manager.display_name, manager.email::text) manager_name
    from public.crm_cases c
    left join public.profiles owner on owner.id=c.account_owner_id
    left join public.profiles manager on manager.id=coalesce(c.sales_manager_id,c.delivery_manager_id)
    where (c.deleted_at is null or coalesce(p_filters->>'archived','')='only')
      and (coalesce(p_filters->>'archived','')='only' and c.deleted_at is not null or coalesce(p_filters->>'archived','')<>'only' and c.deleted_at is null)
      and ((c.deleted_at is null and public.crm_can_access_case(c.id,'cases.read'))
        or (c.deleted_at is not null and coalesce(p_filters->>'archived','')='only' and public.current_user_has_permission('cases.restore')))
      and (trim(coalesce(p_search,''))='' or c.company_name ilike '%'||trim(p_search)||'%'
        or c.id::text ilike trim(p_search)||'%' or coalesce(c.primary_email::text,'') ilike '%'||trim(p_search)||'%'
        or coalesce(c.primary_phone,'') ilike '%'||trim(p_search)||'%' or coalesce(c.website,'') ilike '%'||trim(p_search)||'%'
        or exists(select 1 from public.crm_case_contacts cc where cc.case_id=c.id and (cc.full_name ilike '%'||trim(p_search)||'%' or cc.email::text ilike '%'||trim(p_search)||'%'))
        or exists(select 1 from public.crm_tickets t where t.case_id=c.id and t.deleted_at is null and (t.project_title ilike '%'||trim(p_search)||'%' or t.id::text ilike trim(p_search)||'%'))
        or exists(select 1 from public.crm_tickets t join public.crm_ticket_assignments a on a.ticket_id=t.id and a.removed_at is null join public.profiles p on p.id=a.user_id where t.case_id=c.id and coalesce(p.display_name,p.email::text) ilike '%'||trim(p_search)||'%'))
      and (coalesce(p_filters->>'status','')='' or c.case_status=p_filters->>'status')
      and (coalesce(p_filters->>'lifecycle','')='' or c.lifecycle_stage=p_filters->>'lifecycle')
      and (coalesce(p_filters->>'industry','')='' or lower(coalesce(c.industry,''))=lower(p_filters->>'industry'))
      and (coalesce(p_filters->>'priority','')='' or c.priority=p_filters->>'priority')
      and (coalesce(p_filters->>'risk','')='' or c.risk_level=p_filters->>'risk')
      and (coalesce(p_filters->>'ownerId','')='' or c.account_owner_id::text=p_filters->>'ownerId')
      and (coalesce(p_filters->>'department','')='' or exists(select 1 from public.crm_tickets t where t.case_id=c.id and t.deleted_at is null and t.current_department=p_filters->>'department'))
      and (coalesce(p_filters->>'openTickets','')<>'true' or (public.crm_case_metrics(c.id)->>'openTickets')::int > 0)
      and (coalesce(p_filters->>'overdue','')<>'true' or (public.crm_case_metrics(c.id)->>'hasOverdueFollowUp')::boolean)
  ), ordered as (
    select *, count(*) over() full_count from base order by
      case when p_sort='companyName' and lower(p_direction)='asc' then lower(company_name) end asc,
      case when p_sort='companyName' and lower(p_direction)='desc' then lower(company_name) end desc,
      case when p_sort='createdAt' and lower(p_direction)='asc' then created_at end asc,
      case when p_sort='createdAt' and lower(p_direction)='desc' then created_at end desc,
      case when p_sort='totalTickets' and lower(p_direction)='asc' then (metrics->>'totalTickets')::int end asc,
      case when p_sort='totalTickets' and lower(p_direction)='desc' then (metrics->>'totalTickets')::int end desc,
      case when p_sort='openTickets' and lower(p_direction)='asc' then (metrics->>'openTickets')::int end asc,
      case when p_sort='openTickets' and lower(p_direction)='desc' then (metrics->>'openTickets')::int end desc,
      case when p_sort='acceptanceRate' and lower(p_direction)='asc' then (metrics->>'acceptanceRate')::numeric end asc nulls last,
      case when p_sort='acceptanceRate' and lower(p_direction)='desc' then (metrics->>'acceptanceRate')::numeric end desc nulls last,
      case when p_sort='winRate' and lower(p_direction)='asc' then (metrics->>'winRate')::numeric end asc nulls last,
      case when p_sort='winRate' and lower(p_direction)='desc' then (metrics->>'winRate')::numeric end desc nulls last,
      case when p_sort='lastInteraction' and lower(p_direction)='asc' then (metrics->>'lastInteraction')::timestamptz end asc nulls last,
      case when p_sort='lastInteraction' and lower(p_direction)='desc' then (metrics->>'lastInteraction')::timestamptz end desc nulls last,
      updated_at desc
    limit safe_size offset (safe_page-1)*safe_size
  ), items as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',id,'companyName',company_name,'displayName',display_name,'industry',industry,'status',case_status,
      'lifecycleStage',lifecycle_stage,'ownerId',account_owner_id,'ownerName',owner_name,'managerName',manager_name,
      'priority',priority,'riskLevel',risk_level,'health',case when risk_level='high' then 'AT_RISK' when (metrics->>'hasOverdueFollowUp')::boolean or coalesce((metrics->>'lastInteraction')::timestamptz,created_at)<now()-interval '60 days' then 'ATTENTION_NEEDED' else 'HEALTHY' end,
      'createdAt',created_at,'updatedAt',updated_at,'deletedAt',deleted_at,'metrics',metrics
    ) order by
      case when p_sort='companyName' and lower(p_direction)='asc' then lower(company_name) end asc,
      case when p_sort='companyName' and lower(p_direction)='desc' then lower(company_name) end desc,
      case when p_sort='createdAt' and lower(p_direction)='asc' then created_at end asc,
      case when p_sort='createdAt' and lower(p_direction)='desc' then created_at end desc,
      updated_at desc),'[]'::jsonb) data, coalesce(max(full_count),0) total from ordered
  ), kpis as (
    select count(*) total, count(*) filter(where case_status='active') active,
      count(*) filter(where created_at>=now()-interval '30 days') new_cases,
      count(*) filter(where lifecycle_stage in ('customer','active_customer')) customers,
      count(*) filter(where lifecycle_stage in ('prospect','lead','qualified')) prospects,
      count(*) filter(where (metrics->>'openTickets')::int>0) open_cases,
      count(*) filter(where (metrics->>'nextFollowUp') is not null) follow_up_cases,
      count(*) filter(where (metrics->>'hasOverdueFollowUp')::boolean) overdue_cases,
      count(*) filter(where risk_level='high') high_risk,
      round(avg((metrics->>'acceptanceRate')::numeric),1) acceptance,
      round(avg((metrics->>'winRate')::numeric),1) win_rate
    from base
  )
  select jsonb_build_object('items',items.data,'total',items.total,'page',safe_page,'pageSize',safe_size,
    'kpis',jsonb_build_object('totalCases',kpis.total,'activeCases',kpis.active,'newCases',kpis.new_cases,'customers',kpis.customers,
      'prospects',kpis.prospects,'casesWithOpenTickets',kpis.open_cases,'requiringFollowUp',kpis.follow_up_cases,
      'overdueFollowUps',kpis.overdue_cases,'highRiskCases',kpis.high_risk,'averageAcceptanceRate',kpis.acceptance,'averageWinRate',kpis.win_rate,'activePipelineValue',null))
  into result from items cross join kpis;
  return result;
end;
$$;

create or replace function public.get_crm_case_overview(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
  select jsonb_build_object(
    'id',c.id,'companyName',c.company_name,'displayName',c.display_name,'legalName',c.legal_name,'logoUrl',c.logo_url,
    'industry',c.industry,'companyType',c.company_type,'website',c.website,'primaryEmail',c.primary_email,'primaryPhone',c.primary_phone,
    'additionalEmails',c.additional_emails,'additionalPhones',c.additional_phones,'address',c.address,'city',c.city,'region',c.region,'country',c.country,
    'companySize',c.company_size,'employeeCount',c.employee_count,'annualRevenue',c.annual_revenue,'lifecycleStage',c.lifecycle_stage,
    'status',c.case_status,'source',c.source,'firstContactDate',c.first_contact_date,'ownerId',c.account_owner_id,
    'ownerName',coalesce(owner.display_name,owner.email::text),'salesManagerId',c.sales_manager_id,
    'salesManagerName',coalesce(sales.display_name,sales.email::text),'deliveryManagerId',c.delivery_manager_id,
    'deliveryManagerName',coalesce(delivery.display_name,delivery.email::text),'priority',c.priority,'tags',c.tags,
    'description',c.description,'riskLevel',c.risk_level,'opportunityLevel',c.opportunity_level,
    'createdAt',c.created_at,'updatedAt',c.updated_at,'deletedAt',c.deleted_at,'createdById',c.created_by_user_id,
    'createdByName',coalesce(creator.display_name,creator.email::text),'metrics',public.crm_case_metrics(c.id),
    'health',case when c.risk_level='high' then 'AT_RISK' when (public.crm_case_metrics(c.id)->>'hasOverdueFollowUp')::boolean or coalesce((public.crm_case_metrics(c.id)->>'lastInteraction')::timestamptz,c.created_at)<now()-interval '60 days' then 'ATTENTION_NEEDED' else 'HEALTHY' end,
    'primaryContact',(select jsonb_build_object('id',cc.id,'name',cc.full_name,'email',cc.email,'phone',cc.phone,'jobTitle',cc.job_title) from public.crm_case_contacts cc where cc.case_id=c.id and cc.status='active' order by cc.is_primary desc,cc.created_at limit 1),
    'recentActivity',(select coalesce(jsonb_agg(item),'[]'::jsonb) from (select jsonb_build_object('id',a.id,'action',a.action,'createdAt',a.created_at,'actorName',coalesce(p.display_name,p.email::text),'details',a.details) item from public.crm_case_activity a left join public.profiles p on p.id=a.actor_user_id where a.case_id=c.id order by a.created_at desc limit 8) recent)
  ) into result from public.crm_cases c
  left join public.profiles owner on owner.id=c.account_owner_id left join public.profiles sales on sales.id=c.sales_manager_id
  left join public.profiles delivery on delivery.id=c.delivery_manager_id left join public.profiles creator on creator.id=c.created_by_user_id
  where c.id=p_case_id;
  return result;
end;
$$;

create or replace function public.list_crm_case_tickets(p_case_id uuid, p_page integer default 1, p_page_size integer default 25, p_search text default '', p_status text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb; safe_page int:=greatest(p_page,1); safe_size int:=least(greatest(p_page_size,1),100);
begin
  if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
  with page_ids as (
    select t.id,count(*) over() total
    from public.crm_tickets t
    where t.case_id=p_case_id and t.deleted_at is null and public.crm_can_access_ticket(t.id,'tickets.read')
      and (coalesce(p_status,'')='' or t.status=p_status)
      and (trim(coalesce(p_search,''))='' or t.project_title ilike '%'||trim(p_search)||'%' or t.id::text ilike trim(p_search)||'%')
    order by t.updated_at desc limit safe_size offset (safe_page-1)*safe_size
  )
  select jsonb_build_object('items',coalesce(jsonb_agg(public.crm_ticket_summary(ticket) order by ticket.updated_at desc),'[]'::jsonb),'total',coalesce(max(page_ids.total),0),'page',safe_page,'pageSize',safe_size)
  into result from page_ids join public.crm_tickets ticket on ticket.id=page_ids.id;
  return result;
end;
$$;

create or replace function public.list_crm_case_contacts(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.full_name,'jobTitle',c.job_title,'department',c.department,'email',c.email,'phone',c.phone,'secondaryPhone',c.secondary_phone,'preferredMethod',c.preferred_method,'decisionMaker',c.is_decision_maker,'primary',c.is_primary,'notes',c.notes,'status',c.status,'createdAt',c.created_at,'updatedAt',c.updated_at) order by c.is_primary desc,c.full_name),'[]'::jsonb) from public.crm_case_contacts c where c.case_id=p_case_id);
end;
$$;

create or replace function public.get_crm_case_timeline(p_case_id uuid, p_category text default 'ALL', p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
  return (with events as (
    select a.id,a.created_at,'CASE' category,a.action title,a.details, null::uuid ticket_id,coalesce(p.display_name,p.email::text) actor from public.crm_case_activity a left join public.profiles p on p.id=a.actor_user_id where a.case_id=p_case_id
    union all select a.id,a.created_at,'TICKET',a.action,a.details,a.ticket_id,coalesce(p.display_name,p.email::text) from public.crm_ticket_activity a join public.crm_tickets t on t.id=a.ticket_id left join public.profiles p on p.id=a.actor_user_id where t.case_id=p_case_id
    union all select f.id,f.created_at,'FOLLOW_UP','FOLLOW_UP_'||f.status,jsonb_build_object('type',f.follow_up_type,'purpose',f.purpose,'scheduledAt',f.scheduled_at),f.ticket_id,coalesce(p.display_name,p.email::text) from public.crm_follow_up_occurrences f join public.crm_tickets t on t.id=f.ticket_id left join public.profiles p on p.id=f.created_by_user_id where t.case_id=p_case_id
    union all select c.id,c.occurred_at,c.category,c.event_type,jsonb_build_object('subject',c.subject,'preview',c.preview,'status',c.status),c.ticket_id,coalesce(p.display_name,p.email::text) from public.crm_ticket_communications c join public.crm_tickets t on t.id=c.ticket_id left join public.profiles p on p.id=c.created_by_user_id where t.case_id=p_case_id
    union all select n.id,n.created_at,'NOTE','NOTE_ADDED',jsonb_build_object('content',n.content),n.ticket_id,coalesce(p.display_name,p.email::text) from public.crm_case_notes n left join public.profiles p on p.id=n.created_by_user_id where n.case_id=p_case_id
  ) select coalesce(jsonb_agg(jsonb_build_object('id',id,'createdAt',created_at,'category',category,'title',title,'details',details,'ticketId',ticket_id,'actorName',actor) order by created_at desc),'[]'::jsonb) from (select * from events where upper(coalesce(p_category,'ALL'))='ALL' or category=upper(p_category) order by created_at desc limit least(greatest(p_limit,1),250)) limited);
end;
$$;

create or replace function public.list_crm_case_employees(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
  return (with participation as (
    select distinct t.id ticket_id,a.user_id,t.stage,t.updated_at from public.crm_tickets t join public.crm_ticket_assignments a on a.ticket_id=t.id where t.case_id=p_case_id and t.deleted_at is null
  ), decision as (
    select distinct on (r.ticket_id) r.ticket_id,r.status from public.crm_ticket_permission_requests r join public.crm_tickets t on t.id=r.ticket_id where t.case_id=p_case_id and r.request_type='POST_TICKET' and r.status<>'PENDING' order by r.ticket_id,r.reviewed_at desc
  ), stats as (
    select p.user_id,count(*) handled,count(*) filter(where p.stage='close_won') won,count(*) filter(where p.stage='lost') lost,
      count(*) filter(where d.status in ('APPROVED','MODIFIED')) accepted,count(*) filter(where d.status='REJECTED') rejected,max(p.updated_at) last_interaction
    from participation p left join decision d on d.ticket_id=p.ticket_id group by p.user_id
  ), scored as (
    select s.*,public.crm_case_rate(won,won+lost) win_rate,public.crm_case_rate(accepted,accepted+rejected) acceptance_rate,
      case when exists(select 1 from stats where won+lost>=3) then won+lost>=3 else true end qualified,
      coalesce(public.crm_case_rate(won,won+lost),0)*.55+coalesce(public.crm_case_rate(accepted,accepted+rejected),0)*.20+least(won,10)*2+least(handled,20)*.5 score
    from stats s
  ) select coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'name',coalesce(p.display_name,p.email::text),'email',p.email,'roles',(select coalesce(jsonb_agg(distinct r.name),'[]'::jsonb) from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=s.user_id and ur.status='active'),'ticketsHandled',s.handled,'won',s.won,'lost',s.lost,'winRate',s.win_rate,'accepted',s.accepted,'rejected',s.rejected,'acceptanceRate',s.acceptance_rate,'qualified',s.qualified,'score',round(s.score,1),'lastInteraction',s.last_interaction) order by s.qualified desc,s.score desc,s.won desc,s.handled desc),'[]'::jsonb) from scored s join public.profiles p on p.id=s.user_id);
end;
$$;

create or replace function public.list_crm_case_communications(p_case_id uuid, p_category text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
return (select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'ticketId',c.ticket_id,'category',c.category,'eventType',c.event_type,'direction',c.direction,'status',c.status,'subject',c.subject,'preview',c.preview,'hasAttachments',c.has_attachments,'occurredAt',c.occurred_at,'durationSeconds',c.duration_seconds,'notes',c.notes,'userName',coalesce(p.display_name,p.email::text)) order by c.occurred_at desc),'[]'::jsonb) from public.crm_ticket_communications c join public.crm_tickets t on t.id=c.ticket_id left join public.profiles p on p.id=c.responsible_user_id where t.case_id=p_case_id and (coalesce(p_category,'')='' or c.category=upper(p_category)));
end;
$$;

create or replace function public.list_crm_case_follow_ups(p_case_id uuid, p_status text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
return (select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'ticketId',f.ticket_id,'ticketTitle',t.project_title,'scheduledAt',f.scheduled_at,'type',f.follow_up_type,'purpose',f.purpose,'status',f.status,'recurring',f.series_id is not null,'overdue',f.status='PENDING' and f.scheduled_at<now(),'createdByName',coalesce(p.display_name,p.email::text)) order by case when f.status='PENDING' then 0 else 1 end,f.scheduled_at),'[]'::jsonb) from public.crm_follow_up_occurrences f join public.crm_tickets t on t.id=f.ticket_id left join public.profiles p on p.id=f.created_by_user_id where t.case_id=p_case_id and t.deleted_at is null and (coalesce(p_status,'')='' or f.status=upper(p_status)));
end;
$$;

create or replace function public.list_crm_case_notes(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin if not public.crm_can_access_case(p_case_id,'cases.read') then raise exception 'Case not found or access denied'; end if;
return (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'content',n.content,'ticketId',n.ticket_id,'ticketTitle',t.project_title,'authorId',n.created_by_user_id,'authorName',coalesce(p.display_name,p.email::text),'createdAt',n.created_at,'updatedAt',n.updated_at) order by n.created_at desc),'[]'::jsonb) from public.crm_case_notes n left join public.crm_tickets t on t.id=n.ticket_id left join public.profiles p on p.id=n.created_by_user_id where n.case_id=p_case_id);
end;
$$;

create or replace function public.update_crm_case_profile(p_case_id uuid, p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=(select auth.uid()); previous jsonb; updated jsonb; allowed text[]:=array['companyName','displayName','legalName','logoUrl','industry','companyType','website','primaryEmail','primaryPhone','additionalEmails','additionalPhones','address','city','region','country','companySize','employeeCount','annualRevenue','lifecycleStage','status','source','firstContactDate','ownerId','salesManagerId','deliveryManagerId','priority','tags','description','riskLevel','opportunityLevel']; unknown text;
begin
  if actor is null or not public.crm_can_access_case(p_case_id,'cases.update') then raise exception 'Permission denied'; end if;
  select item.key into unknown from jsonb_object_keys(coalesce(p_changes,'{}'::jsonb)) as item(key) where not item.key=any(allowed) limit 1;
  if unknown is not null then raise exception 'Unsupported Case field'; end if;
  select to_jsonb(c) into previous from public.crm_cases c where c.id=p_case_id and c.deleted_at is null for update;
  if previous is null then raise exception 'Case not found'; end if;
  if p_changes?'ownerId' and nullif(p_changes->>'ownerId','') is not null
     and not public.crm_user_has_role((p_changes->>'ownerId')::uuid,array['marketing_executive','sales_executive','marketing_manager','sales_manager','delivery_manager','leadership']) then
    raise exception 'Select an active operational account owner';
  end if;
  if p_changes?'salesManagerId' and nullif(p_changes->>'salesManagerId','') is not null
     and not public.crm_user_has_role((p_changes->>'salesManagerId')::uuid,array['sales_manager']) then
    raise exception 'Select an active Sales Manager';
  end if;
  if p_changes?'deliveryManagerId' and nullif(p_changes->>'deliveryManagerId','') is not null
     and not public.crm_user_has_role((p_changes->>'deliveryManagerId')::uuid,array['delivery_manager']) then
    raise exception 'Select an active Delivery Manager';
  end if;
  update public.crm_cases c set
    company_name=case when p_changes?'companyName' then trim(p_changes->>'companyName') else company_name end,
    display_name=case when p_changes?'displayName' then nullif(trim(p_changes->>'displayName'),'') else display_name end,
    legal_name=case when p_changes?'legalName' then nullif(trim(p_changes->>'legalName'),'') else legal_name end,
    logo_url=case when p_changes?'logoUrl' then nullif(trim(p_changes->>'logoUrl'),'') else logo_url end,
    industry=case when p_changes?'industry' then nullif(trim(p_changes->>'industry'),'') else industry end,
    company_type=case when p_changes?'companyType' then nullif(trim(p_changes->>'companyType'),'') else company_type end,
    website=case when p_changes?'website' then nullif(trim(p_changes->>'website'),'') else website end,
    primary_email=case when p_changes?'primaryEmail' then nullif(lower(trim(p_changes->>'primaryEmail')),'')::extensions.citext else primary_email end,
    primary_phone=case when p_changes?'primaryPhone' then nullif(trim(p_changes->>'primaryPhone'),'') else primary_phone end,
    additional_emails=case when p_changes?'additionalEmails' then array(select lower(trim(item.value)) from jsonb_array_elements_text(p_changes->'additionalEmails') as item(value) where trim(item.value)<>'') else additional_emails end,
    additional_phones=case when p_changes?'additionalPhones' then array(select trim(item.value) from jsonb_array_elements_text(p_changes->'additionalPhones') as item(value) where trim(item.value)<>'') else additional_phones end,
    address=case when p_changes?'address' then nullif(trim(p_changes->>'address'),'') else address end,
    city=case when p_changes?'city' then nullif(trim(p_changes->>'city'),'') else city end,
    region=case when p_changes?'region' then nullif(trim(p_changes->>'region'),'') else region end,
    country=case when p_changes?'country' then nullif(trim(p_changes->>'country'),'') else country end,
    company_size=case when p_changes?'companySize' then nullif(trim(p_changes->>'companySize'),'') else company_size end,
    employee_count=case when p_changes?'employeeCount' then nullif(p_changes->>'employeeCount','')::int else employee_count end,
    annual_revenue=case when p_changes?'annualRevenue' then nullif(p_changes->>'annualRevenue','')::numeric else annual_revenue end,
    lifecycle_stage=case when p_changes?'lifecycleStage' then p_changes->>'lifecycleStage' else lifecycle_stage end,
    case_status=case when p_changes?'status' then p_changes->>'status' else case_status end,
    source=case when p_changes?'source' then nullif(trim(p_changes->>'source'),'') else source end,
    first_contact_date=case when p_changes?'firstContactDate' then nullif(p_changes->>'firstContactDate','')::date else first_contact_date end,
    account_owner_id=case when p_changes?'ownerId' then nullif(p_changes->>'ownerId','')::uuid else account_owner_id end,
    sales_manager_id=case when p_changes?'salesManagerId' then nullif(p_changes->>'salesManagerId','')::uuid else sales_manager_id end,
    delivery_manager_id=case when p_changes?'deliveryManagerId' then nullif(p_changes->>'deliveryManagerId','')::uuid else delivery_manager_id end,
    priority=case when p_changes?'priority' then p_changes->>'priority' else priority end,
    tags=case when p_changes?'tags' then array(select jsonb_array_elements_text(p_changes->'tags')) else tags end,
    description=case when p_changes?'description' then nullif(trim(p_changes->>'description'),'') else description end,
    risk_level=case when p_changes?'riskLevel' then p_changes->>'riskLevel' else risk_level end,
    opportunity_level=case when p_changes?'opportunityLevel' then p_changes->>'opportunityLevel' else opportunity_level end,
    updated_by_user_id=actor where c.id=p_case_id returning to_jsonb(c) into updated;
  insert into public.crm_case_activity(case_id,action,actor_user_id,details) values(p_case_id,'CASE_UPDATED',actor,jsonb_build_object('previous',previous-'updated_at','next',updated-'updated_at'));
  return public.get_crm_case_overview(p_case_id);
end;
$$;

create or replace function public.upsert_crm_case_contact(p_case_id uuid, p_contact_id uuid default null, p_contact jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=(select auth.uid()); contact_id uuid; make_primary boolean:=coalesce((p_contact->>'primary')::boolean,false);
begin
  if actor is null or not public.crm_can_access_case(p_case_id,'cases.contacts.manage') then raise exception 'Permission denied'; end if;
  if char_length(trim(coalesce(p_contact->>'name','')))<2 then raise exception 'Contact name is required'; end if;
  if nullif(trim(coalesce(p_contact->>'email','')),'') is null and nullif(trim(coalesce(p_contact->>'phone','')),'') is null then raise exception 'Email or phone is required'; end if;
  if make_primary then update public.crm_case_contacts set is_primary=false,updated_by_user_id=actor where case_id=p_case_id and is_primary; end if;
  if p_contact_id is null then
    insert into public.crm_case_contacts(case_id,full_name,job_title,department,email,phone,secondary_phone,preferred_method,is_decision_maker,is_primary,notes,status,created_by_user_id)
    values(p_case_id,trim(p_contact->>'name'),nullif(trim(p_contact->>'jobTitle'),''),nullif(trim(p_contact->>'department'),''),nullif(lower(trim(p_contact->>'email')),'')::extensions.citext,nullif(trim(p_contact->>'phone'),''),nullif(trim(p_contact->>'secondaryPhone'),''),nullif(p_contact->>'preferredMethod',''),coalesce((p_contact->>'decisionMaker')::boolean,false),make_primary,nullif(trim(p_contact->>'notes'),''),coalesce(nullif(p_contact->>'status',''),'active'),actor) returning id into contact_id;
    insert into public.crm_case_activity(case_id,action,actor_user_id,details) values(p_case_id,'CONTACT_ADDED',actor,jsonb_build_object('contactId',contact_id));
  else
    update public.crm_case_contacts set full_name=trim(p_contact->>'name'),job_title=nullif(trim(p_contact->>'jobTitle'),''),department=nullif(trim(p_contact->>'department'),''),email=nullif(lower(trim(p_contact->>'email')),'')::extensions.citext,phone=nullif(trim(p_contact->>'phone'),''),secondary_phone=nullif(trim(p_contact->>'secondaryPhone'),''),preferred_method=nullif(p_contact->>'preferredMethod',''),is_decision_maker=coalesce((p_contact->>'decisionMaker')::boolean,false),is_primary=make_primary,notes=nullif(trim(p_contact->>'notes'),''),status=coalesce(nullif(p_contact->>'status',''),'active'),updated_by_user_id=actor where id=p_contact_id and case_id=p_case_id returning id into contact_id;
    if contact_id is null then raise exception 'Contact not found'; end if;
    insert into public.crm_case_activity(case_id,action,actor_user_id,details) values(p_case_id,'CONTACT_UPDATED',actor,jsonb_build_object('contactId',contact_id));
  end if;
  return (select jsonb_build_object('id',id,'caseId',case_id) from public.crm_case_contacts where id=contact_id);
end;
$$;

create or replace function public.add_crm_case_note(p_case_id uuid, p_ticket_id uuid default null, p_content text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=(select auth.uid()); note_id uuid;
begin
  if actor is null or not public.crm_can_access_case(p_case_id,'cases.notes.create') then raise exception 'Permission denied'; end if;
  if char_length(trim(coalesce(p_content,''))) not between 1 and 5000 then raise exception 'Note must contain between 1 and 5000 characters'; end if;
  if p_ticket_id is not null and not exists(select 1 from public.crm_tickets where id=p_ticket_id and case_id=p_case_id and deleted_at is null) then raise exception 'Ticket does not belong to this Case'; end if;
  insert into public.crm_case_notes(case_id,ticket_id,content,created_by_user_id) values(p_case_id,p_ticket_id,trim(p_content),actor) returning id into note_id;
  insert into public.crm_case_activity(case_id,action,actor_user_id,details) values(p_case_id,'NOTE_ADDED',actor,jsonb_build_object('noteId',note_id,'ticketId',p_ticket_id));
  return jsonb_build_object('id',note_id);
end;
$$;

create or replace function public.restore_crm_case(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid:=(select auth.uid()); name text;
begin
  if actor is null or not public.current_user_has_permission('cases.restore') then raise exception 'Permission denied'; end if;
  select company_name into name from public.crm_cases where id=p_case_id and deleted_at is not null for update;
  if name is null then raise exception 'Archived Case not found'; end if;
  if exists(select 1 from public.crm_cases where deleted_at is null and lower(trim(company_name))=lower(trim(name))) then raise exception 'An active Case already uses this company name'; end if;
  update public.crm_cases set deleted_at=null,deleted_by_user_id=null,case_status='active',updated_by_user_id=actor where id=p_case_id;
  insert into public.crm_case_activity(case_id,action,actor_user_id) values(p_case_id,'CASE_RESTORED',actor);
  return jsonb_build_object('id',p_case_id,'restored',true);
end;
$$;

revoke all on function public.crm_sync_ticket_contact_to_case() from public,anon,authenticated;
revoke all on function public.crm_case_rate(bigint,bigint) from public,anon;
revoke all on function public.crm_case_metrics(uuid) from public,anon;
revoke all on function public.list_crm_case_management(text,jsonb,text,text,integer,integer) from public,anon;
revoke all on function public.get_crm_case_overview(uuid) from public,anon;
revoke all on function public.list_crm_case_tickets(uuid,integer,integer,text,text) from public,anon;
revoke all on function public.list_crm_case_contacts(uuid) from public,anon;
revoke all on function public.get_crm_case_timeline(uuid,text,integer) from public,anon;
revoke all on function public.list_crm_case_employees(uuid) from public,anon;
revoke all on function public.list_crm_case_communications(uuid,text) from public,anon;
revoke all on function public.list_crm_case_follow_ups(uuid,text) from public,anon;
revoke all on function public.list_crm_case_notes(uuid) from public,anon;
revoke all on function public.update_crm_case_profile(uuid,jsonb) from public,anon;
revoke all on function public.upsert_crm_case_contact(uuid,uuid,jsonb) from public,anon;
revoke all on function public.add_crm_case_note(uuid,uuid,text) from public,anon;
revoke all on function public.restore_crm_case(uuid) from public,anon;

grant execute on function public.crm_case_rate(bigint,bigint), public.crm_case_metrics(uuid),
  public.list_crm_case_management(text,jsonb,text,text,integer,integer), public.get_crm_case_overview(uuid),
  public.list_crm_case_tickets(uuid,integer,integer,text,text), public.list_crm_case_contacts(uuid),
  public.get_crm_case_timeline(uuid,text,integer), public.list_crm_case_employees(uuid),
  public.list_crm_case_communications(uuid,text), public.list_crm_case_follow_ups(uuid,text), public.list_crm_case_notes(uuid),
  public.update_crm_case_profile(uuid,jsonb), public.upsert_crm_case_contact(uuid,uuid,jsonb),
  public.add_crm_case_note(uuid,uuid,text), public.restore_crm_case(uuid) to authenticated;
