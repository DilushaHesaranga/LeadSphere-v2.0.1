-- LeadSphere Case and Ticket Management
-- Companies are represented by crm_cases. Every project/opportunity is one ticket
-- with a mandatory case_id. Leads and Customers are filtered views of this data.

create table if not exists public.crm_departments (
  slug text primary key,
  name text not null unique,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  constraint crm_departments_slug_format check (slug ~ '^[a-z][a-z0-9_]*$')
);

insert into public.crm_departments (slug, name, sort_order) values
  ('marketing', 'Marketing', 10),
  ('sales', 'Sales', 20),
  ('delivery', 'Delivery', 30)
on conflict (slug) do update set name = excluded.name, sort_order = excluded.sort_order;

create table if not exists public.crm_ticket_stages (
  slug text primary key,
  name text not null unique,
  business_area text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  constraint crm_ticket_stages_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint crm_ticket_stages_area check (business_area in ('leads', 'customers'))
);

insert into public.crm_ticket_stages (slug, name, business_area, sort_order) values
  ('new', 'New', 'leads', 10),
  ('open', 'Open', 'leads', 20),
  ('qualified', 'Qualified', 'customers', 30),
  ('proposal', 'Proposal', 'customers', 40),
  ('won', 'Won', 'customers', 50),
  ('delivery', 'Delivery', 'customers', 60),
  ('closed_lost', 'Closed Lost', 'customers', 70)
on conflict (slug) do update set
  name = excluded.name,
  business_area = excluded.business_area,
  sort_order = excluded.sort_order;

create table if not exists public.crm_cases (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id) on delete set null,
  constraint crm_cases_company_name_length check (char_length(trim(company_name)) between 2 and 160)
);

create unique index if not exists crm_cases_active_company_name_unique
  on public.crm_cases (lower(trim(company_name))) where deleted_at is null;
create index if not exists crm_cases_updated_idx
  on public.crm_cases (updated_at desc) where deleted_at is null;

create table if not exists public.crm_department_managers (
  department_slug text not null references public.crm_departments(slug) on delete cascade,
  manager_user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (department_slug, manager_user_id)
);

create table if not exists public.crm_tickets (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.crm_cases(id) on delete restrict,
  project_title text not null,
  current_department text not null references public.crm_departments(slug) on delete restrict,
  stage text not null references public.crm_ticket_stages(slug) on delete restrict,
  status text not null default 'active',
  responsible_manager_id uuid not null references auth.users(id) on delete restrict,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by_user_id uuid references auth.users(id) on delete set null,
  deleted_at timestamptz,
  deleted_by_user_id uuid references auth.users(id) on delete set null,
  constraint crm_tickets_project_title_length check (char_length(trim(project_title)) between 2 and 180),
  constraint crm_tickets_status check (status in ('active', 'closed', 'archived')),
  constraint crm_tickets_close_consistency check (
    (status = 'closed' and closed_at is not null and closed_by_user_id is not null)
    or status <> 'closed'
  )
);

create index if not exists crm_tickets_case_idx on public.crm_tickets (case_id, updated_at desc);
create index if not exists crm_tickets_stage_idx on public.crm_tickets (stage, updated_at desc) where deleted_at is null;
create index if not exists crm_tickets_department_idx on public.crm_tickets (current_department, updated_at desc) where deleted_at is null;
create index if not exists crm_tickets_manager_idx on public.crm_tickets (responsible_manager_id, updated_at desc) where deleted_at is null;

create table if not exists public.crm_ticket_contacts (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  name text not null,
  email extensions.citext,
  phone_number text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  constraint crm_ticket_contacts_name_length check (char_length(trim(name)) between 2 and 100),
  constraint crm_ticket_contacts_method_required check (
    nullif(trim(coalesce(email::text, '')), '') is not null
    or nullif(trim(coalesce(phone_number, '')), '') is not null
  ),
  constraint crm_ticket_contacts_email_shape check (
    email is null or email::text ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint crm_ticket_contacts_phone_length check (
    phone_number is null or char_length(phone_number) between 7 and 30
  )
);

create index if not exists crm_ticket_contacts_ticket_idx on public.crm_ticket_contacts (ticket_id);
create unique index if not exists crm_ticket_contacts_no_exact_duplicates
  on public.crm_ticket_contacts (
    ticket_id,
    lower(trim(name)),
    lower(trim(coalesce(email::text, ''))),
    regexp_replace(coalesce(phone_number, ''), '[[:space:]]', '', 'g')
  );

create table if not exists public.crm_ticket_notes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  content text not null,
  created_by_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_ticket_notes_content_length check (char_length(trim(content)) between 1 and 5000)
);

create index if not exists crm_ticket_notes_ticket_idx on public.crm_ticket_notes (ticket_id, created_at desc);

create table if not exists public.crm_ticket_assignments (
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  assigned_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (ticket_id, user_id)
);

create index if not exists crm_ticket_assignments_user_idx
  on public.crm_ticket_assignments (user_id, ticket_id) where removed_at is null;

create table if not exists public.crm_ticket_permission_requests (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  request_type text not null,
  requested_by_user_id uuid not null references auth.users(id) on delete restrict,
  assigned_manager_id uuid not null references auth.users(id) on delete restrict,
  current_department text not null references public.crm_departments(slug) on delete restrict,
  requested_department text references public.crm_departments(slug) on delete restrict,
  requested_assignee_id uuid references auth.users(id) on delete restrict,
  request_note text,
  status text not null default 'PENDING',
  manager_comment text,
  manager_modified_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  constraint crm_ticket_requests_type check (request_type in ('ASSIGN_TO_ME', 'POST_TICKET')),
  constraint crm_ticket_requests_status check (status in ('PENDING', 'APPROVED', 'REJECTED', 'MODIFIED')),
  constraint crm_ticket_requests_note_length check (request_note is null or char_length(trim(request_note)) <= 1000),
  constraint crm_ticket_requests_comment_length check (manager_comment is null or char_length(trim(manager_comment)) <= 1000),
  constraint crm_ticket_requests_shape check (
    (request_type = 'ASSIGN_TO_ME' and requested_assignee_id is not null and requested_department is null)
    or (request_type = 'POST_TICKET' and requested_department is not null and requested_department <> current_department and requested_assignee_id is null)
  ),
  constraint crm_ticket_requests_review_consistency check (
    (status = 'PENDING' and reviewed_at is null and reviewed_by_user_id is null)
    or (status <> 'PENDING' and reviewed_at is not null and reviewed_by_user_id is not null)
  )
);

create index if not exists crm_ticket_requests_manager_status_idx
  on public.crm_ticket_permission_requests (assigned_manager_id, status, created_at desc);
create index if not exists crm_ticket_requests_ticket_idx
  on public.crm_ticket_permission_requests (ticket_id, created_at desc);
create unique index if not exists crm_ticket_requests_one_pending_assignment
  on public.crm_ticket_permission_requests (ticket_id, requested_by_user_id)
  where request_type = 'ASSIGN_TO_ME' and status = 'PENDING';
create unique index if not exists crm_ticket_requests_one_pending_transfer
  on public.crm_ticket_permission_requests (ticket_id)
  where request_type = 'POST_TICKET' and status = 'PENDING';

create table if not exists public.crm_ticket_activity (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete cascade,
  action text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists crm_ticket_activity_ticket_idx
  on public.crm_ticket_activity (ticket_id, created_at desc);

drop trigger if exists crm_cases_set_updated_at on public.crm_cases;
create trigger crm_cases_set_updated_at before update on public.crm_cases
for each row execute function public.set_updated_at();
drop trigger if exists crm_tickets_set_updated_at on public.crm_tickets;
create trigger crm_tickets_set_updated_at before update on public.crm_tickets
for each row execute function public.set_updated_at();
drop trigger if exists crm_ticket_notes_set_updated_at on public.crm_ticket_notes;
create trigger crm_ticket_notes_set_updated_at before update on public.crm_ticket_notes
for each row execute function public.set_updated_at();

insert into public.permissions (slug, description) values
  ('cases.create', 'Create company cases'),
  ('cases.read', 'Read authorised company cases'),
  ('cases.delete', 'Archive empty company cases'),
  ('tickets.create', 'Create tickets in authorised cases'),
  ('tickets.read', 'Read authorised tickets and contacts'),
  ('tickets.update', 'Update authorised ticket details'),
  ('tickets.notes.create', 'Add shared notes to authorised tickets'),
  ('tickets.requests.create', 'Request assignment or department transfer'),
  ('tickets.requests.review', 'Review assigned ticket permission requests'),
  ('tickets.close', 'Close authorised tickets'),
  ('tickets.delete', 'Archive authorised tickets')
on conflict (slug) do update set description = excluded.description;

-- Executives work within their own/assigned scope. Managers review their team.
-- Leadership and System Admin retain company-wide visibility.
insert into public.role_permissions (role_id, permission_id, access_scope)
select r.id, p.id, matrix.scope::public.data_access_scope
from (values
  ('marketing_executive', 'cases.create', 'own'),
  ('marketing_executive', 'cases.read', 'assigned'),
  ('marketing_executive', 'tickets.create', 'own'),
  ('marketing_executive', 'tickets.read', 'assigned'),
  ('marketing_executive', 'tickets.update', 'assigned'),
  ('marketing_executive', 'tickets.notes.create', 'assigned'),
  ('marketing_executive', 'tickets.requests.create', 'assigned'),
  ('sales_executive', 'cases.create', 'own'),
  ('sales_executive', 'cases.read', 'assigned'),
  ('sales_executive', 'tickets.create', 'own'),
  ('sales_executive', 'tickets.read', 'assigned'),
  ('sales_executive', 'tickets.update', 'assigned'),
  ('sales_executive', 'tickets.notes.create', 'assigned'),
  ('sales_executive', 'tickets.requests.create', 'assigned'),
  ('sales_manager', 'cases.create', 'team'),
  ('sales_manager', 'cases.read', 'team'),
  ('sales_manager', 'cases.delete', 'team'),
  ('sales_manager', 'tickets.create', 'team'),
  ('sales_manager', 'tickets.read', 'team'),
  ('sales_manager', 'tickets.update', 'team'),
  ('sales_manager', 'tickets.notes.create', 'team'),
  ('sales_manager', 'tickets.requests.create', 'team'),
  ('sales_manager', 'tickets.requests.review', 'team'),
  ('sales_manager', 'tickets.close', 'team'),
  ('sales_manager', 'tickets.delete', 'team'),
  ('marketing_manager', 'cases.create', 'team'),
  ('marketing_manager', 'cases.read', 'team'),
  ('marketing_manager', 'cases.delete', 'team'),
  ('marketing_manager', 'tickets.create', 'team'),
  ('marketing_manager', 'tickets.read', 'team'),
  ('marketing_manager', 'tickets.update', 'team'),
  ('marketing_manager', 'tickets.notes.create', 'team'),
  ('marketing_manager', 'tickets.requests.create', 'team'),
  ('marketing_manager', 'tickets.requests.review', 'team'),
  ('marketing_manager', 'tickets.close', 'team'),
  ('marketing_manager', 'tickets.delete', 'team'),
  ('delivery_manager', 'cases.read', 'team'),
  ('delivery_manager', 'tickets.read', 'team'),
  ('delivery_manager', 'tickets.update', 'team'),
  ('delivery_manager', 'tickets.notes.create', 'team'),
  ('delivery_manager', 'tickets.requests.create', 'team'),
  ('delivery_manager', 'tickets.requests.review', 'team'),
  ('delivery_manager', 'tickets.close', 'team'),
  ('delivery_manager', 'tickets.delete', 'team'),
  ('leadership', 'cases.create', 'company'),
  ('leadership', 'cases.read', 'company'),
  ('leadership', 'cases.delete', 'company'),
  ('leadership', 'tickets.create', 'company'),
  ('leadership', 'tickets.read', 'company'),
  ('leadership', 'tickets.update', 'company'),
  ('leadership', 'tickets.notes.create', 'company'),
  ('leadership', 'tickets.requests.create', 'company'),
  ('leadership', 'tickets.requests.review', 'company'),
  ('leadership', 'tickets.close', 'company'),
  ('leadership', 'tickets.delete', 'company')
) as matrix(role_slug, permission_slug, scope)
join public.roles r on r.slug = matrix.role_slug
join public.permissions p on p.slug = matrix.permission_slug
on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;

insert into public.role_permissions (role_id, permission_id, access_scope)
select r.id, p.id, 'company'::public.data_access_scope
from public.roles r cross join public.permissions p
where r.slug = 'system_admin'
  and p.slug like any (array['cases.%', 'tickets.%'])
on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;

create or replace function public.crm_user_has_role(p_user_id uuid, p_role_slugs text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    join public.profiles p on p.id = ur.user_id
    where ur.user_id = p_user_id and ur.status = 'active' and p.status = 'active'
      and r.slug = any (p_role_slugs)
  );
$$;

create or replace function public.crm_users_share_team(p_first uuid, p_second uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members first_member
    join public.team_members second_member on second_member.team_id = first_member.team_id
    join public.teams team on team.id = first_member.team_id
    where first_member.user_id = p_first and second_member.user_id = p_second
      and first_member.status = 'active' and second_member.status = 'active' and team.status = 'active'
  );
$$;

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
  if scope = 'company' then return true; end if;
  if actor in (ticket_record.created_by_user_id, ticket_record.responsible_manager_id) then return true; end if;
  if exists (select 1 from public.crm_ticket_assignments a where a.ticket_id = p_ticket_id and a.user_id = actor and a.removed_at is null) then return true; end if;
  if scope = 'own' then return false; end if;
  if scope = 'team' and (
    public.crm_users_share_team(actor, ticket_record.created_by_user_id)
    or public.crm_users_share_team(actor, ticket_record.responsible_manager_id)
    or exists (
      select 1 from public.crm_ticket_assignments a
      where a.ticket_id = p_ticket_id and a.removed_at is null and public.crm_users_share_team(actor, a.user_id)
    )
  ) then return true; end if;
  return false;
end;
$$;

create or replace function public.crm_can_access_case(p_case_id uuid, p_permission text default 'cases.read')
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  scope public.data_access_scope;
  owner_id uuid;
begin
  scope := public.user_permission_scope(actor, p_permission);
  if scope is null then return false; end if;
  select created_by_user_id into owner_id from public.crm_cases where id = p_case_id and deleted_at is null;
  if owner_id is null then return false; end if;
  if scope = 'company' or owner_id = actor then return true; end if;
  if scope = 'team' and public.crm_users_share_team(actor, owner_id) then return true; end if;
  return exists (select 1 from public.crm_tickets t where t.case_id = p_case_id and public.crm_can_access_ticket(t.id, 'tickets.read'));
end;
$$;

create or replace function public.crm_validate_contacts(p_contacts jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare contact jsonb; normalized_phone text;
begin
  if jsonb_typeof(p_contacts) <> 'array' or jsonb_array_length(p_contacts) < 1 then
    raise exception 'At least one valid contact is required';
  end if;
  for contact in select value from jsonb_array_elements(p_contacts) loop
    normalized_phone := regexp_replace(trim(coalesce(contact ->> 'phoneNumber', '')), '[[:space:]]', '', 'g');
    if char_length(trim(coalesce(contact ->> 'name', ''))) < 2 then raise exception 'Every contact requires a name'; end if;
    if trim(coalesce(contact ->> 'email', '')) = '' and normalized_phone = '' then raise exception 'Every contact requires an email address or phone number'; end if;
    if trim(coalesce(contact ->> 'email', '')) <> '' and trim(contact ->> 'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'A contact email address is invalid'; end if;
    if normalized_phone <> '' and normalized_phone !~ '^\+?[0-9()\-]{7,30}$' then raise exception 'A contact phone number is invalid'; end if;
  end loop;
  if exists (
    select 1 from (
      select lower(trim(value ->> 'name')) name_key,
        lower(trim(coalesce(value ->> 'email', ''))) email_key,
        regexp_replace(trim(coalesce(value ->> 'phoneNumber', '')), '[[:space:]]', '', 'g') phone_key,
        count(*) total
      from jsonb_array_elements(p_contacts) group by 1, 2, 3
    ) duplicates where total > 1
  ) then raise exception 'Duplicate contacts are not allowed'; end if;
end;
$$;

create or replace function public.crm_resolve_creation_department(p_requested text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); resolved text;
begin
  if public.crm_user_has_role(actor, array['marketing_executive'])
     and not public.crm_user_has_role(actor, array['marketing_manager','sales_manager','delivery_manager','leadership','system_admin']) then
    resolved := 'marketing';
  elsif public.crm_user_has_role(actor, array['sales_executive','sales_manager'])
     and not public.crm_user_has_role(actor, array['marketing_manager','delivery_manager','leadership','system_admin']) then
    resolved := 'sales';
  elsif public.crm_user_has_role(actor, array['delivery_manager'])
     and not public.crm_user_has_role(actor, array['leadership','system_admin']) then
    resolved := coalesce(nullif(p_requested, ''), 'delivery');
  else
    resolved := nullif(p_requested, '');
  end if;
  if resolved is null or not exists (select 1 from public.crm_departments where slug = resolved and is_active) then
    raise exception 'Select an authorised current department';
  end if;
  return resolved;
end;
$$;

create or replace function public.crm_resolve_manager(p_department text, p_requested uuid)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare resolved uuid;
begin
  resolved := p_requested;
  if resolved is null then
    select dm.manager_user_id into resolved from public.crm_department_managers dm
    join public.profiles p on p.id = dm.manager_user_id and p.status = 'active'
    where dm.department_slug = p_department order by dm.created_at limit 1;
  end if;
  if resolved is null then raise exception 'A responsible manager is required'; end if;
  if not public.crm_user_has_role(resolved, array['marketing_manager','sales_manager','delivery_manager','leadership','system_admin']) then
    raise exception 'The selected responsible manager is not authorised';
  end if;
  return resolved;
end;
$$;

create or replace function public.crm_insert_contacts(p_ticket_id uuid, p_contacts jsonb, p_actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare contact jsonb; normalized_phone text;
begin
  perform public.crm_validate_contacts(p_contacts);
  for contact in select value from jsonb_array_elements(p_contacts) loop
    normalized_phone := nullif(regexp_replace(trim(coalesce(contact ->> 'phoneNumber', '')), '[[:space:]]', '', 'g'), '');
    insert into public.crm_ticket_contacts (ticket_id, name, email, phone_number, created_by_user_id)
    values (p_ticket_id, trim(contact ->> 'name'), nullif(lower(trim(contact ->> 'email')), ''), normalized_phone, p_actor);
  end loop;
end;
$$;

create or replace function public.crm_create_ticket_record(
  p_case_id uuid, p_project_title text, p_department text, p_stage text,
  p_responsible_manager_id uuid, p_contacts jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); resolved_department text; resolved_manager uuid; ticket_id uuid;
begin
  if actor is null or not public.current_user_has_permission('tickets.create') then raise exception 'Permission denied'; end if;
  if not exists (select 1 from public.crm_cases where id = p_case_id and deleted_at is null) then raise exception 'Case not found'; end if;
  if char_length(trim(coalesce(p_project_title, ''))) < 2 then raise exception 'Project title is required'; end if;
  if not exists (select 1 from public.crm_ticket_stages where slug = p_stage and is_active) then raise exception 'Select a valid stage'; end if;
  resolved_department := public.crm_resolve_creation_department(p_department);
  resolved_manager := public.crm_resolve_manager(resolved_department, p_responsible_manager_id);
  perform public.crm_validate_contacts(p_contacts);
  insert into public.crm_tickets (case_id, project_title, current_department, stage, responsible_manager_id, created_by_user_id)
  values (p_case_id, trim(p_project_title), resolved_department, p_stage, resolved_manager, actor)
  returning id into ticket_id;
  perform public.crm_insert_contacts(ticket_id, p_contacts, actor);
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (ticket_id, 'TICKET_CREATED', actor, jsonb_build_object('department', resolved_department, 'stage', p_stage));
  update public.crm_cases set updated_at = now() where id = p_case_id;
  return ticket_id;
end;
$$;

create or replace function public.create_crm_case_and_ticket(
  p_company_name text, p_project_title text, p_department text, p_stage text,
  p_responsible_manager_id uuid, p_contacts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); case_id uuid; ticket_id uuid; existing_id uuid;
begin
  if actor is null or not public.current_user_has_permission('cases.create') then raise exception 'Permission denied'; end if;
  if char_length(trim(coalesce(p_company_name, ''))) < 2 then raise exception 'Company name is required'; end if;
  select id into existing_id from public.crm_cases where lower(trim(company_name)) = lower(trim(p_company_name)) and deleted_at is null limit 1;
  if existing_id is not null then raise exception 'A Case with this company name already exists'; end if;
  insert into public.crm_cases (company_name, created_by_user_id) values (trim(p_company_name), actor) returning id into case_id;
  ticket_id := public.crm_create_ticket_record(case_id, p_project_title, p_department, p_stage, p_responsible_manager_id, p_contacts);
  return jsonb_build_object('caseId', case_id, 'ticketId', ticket_id);
end;
$$;

create or replace function public.create_crm_ticket(
  p_case_id uuid, p_project_title text, p_department text, p_stage text,
  p_responsible_manager_id uuid, p_contacts jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ticket_id uuid;
begin
  if not public.crm_can_access_case(p_case_id, 'cases.read') then raise exception 'Case not found or access denied'; end if;
  ticket_id := public.crm_create_ticket_record(p_case_id, p_project_title, p_department, p_stage, p_responsible_manager_id, p_contacts);
  return jsonb_build_object('caseId', p_case_id, 'ticketId', ticket_id);
end;
$$;

create or replace function public.crm_ticket_summary(p_ticket public.crm_tickets)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_ticket.id, 'caseId', p_ticket.case_id, 'projectTitle', p_ticket.project_title,
    'currentDepartment', p_ticket.current_department, 'stage', p_ticket.stage, 'status', p_ticket.status,
    'responsibleManagerId', p_ticket.responsible_manager_id,
    'responsibleManagerName', coalesce(manager.display_name, manager.email::text),
    'assignedUsers', coalesce((
      select jsonb_agg(jsonb_build_object('id', profile.id, 'name', coalesce(profile.display_name, profile.email::text)) order by coalesce(profile.display_name, profile.email::text))
      from public.crm_ticket_assignments assignment join public.profiles profile on profile.id = assignment.user_id
      where assignment.ticket_id = p_ticket.id and assignment.removed_at is null
    ), '[]'::jsonb),
    'createdAt', p_ticket.created_at, 'updatedAt', p_ticket.updated_at,
    'closedAt', p_ticket.closed_at
  ) from public.profiles manager where manager.id = p_ticket.responsible_manager_id;
$$;

create or replace function public.get_crm_reference_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return jsonb_build_object(
    'departments', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by sort_order), '[]'::jsonb) from public.crm_departments where is_active),
    'stages', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name, 'businessArea', business_area) order by sort_order), '[]'::jsonb) from public.crm_ticket_stages where is_active),
    'managers', (select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb) from (
      select distinct jsonb_build_object('id', p.id, 'name', coalesce(p.display_name, p.email::text), 'email', p.email::text) item
      from public.profiles p join public.user_roles ur on ur.user_id = p.id join public.roles r on r.id = ur.role_id
      where p.status = 'active' and ur.status = 'active' and r.slug = any(array['marketing_manager','sales_manager','delivery_manager','leadership','system_admin'])
    ) managers),
    'assignees', case when public.current_user_has_permission('tickets.requests.review') then (
      select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb) from (
        select distinct jsonb_build_object('id', p.id, 'name', coalesce(p.display_name, p.email::text)) item
        from public.profiles p join public.user_roles ur on ur.user_id = p.id join public.roles r on r.id = ur.role_id
        where p.status = 'active' and ur.status = 'active'
          and r.slug = any(array['marketing_executive','sales_executive','marketing_manager','sales_manager','delivery_manager','leadership'])
      ) active_assignees
    ) else '[]'::jsonb end,
    'departmentManagers', (select coalesce(jsonb_agg(jsonb_build_object('department', department_slug, 'managerId', manager_user_id)), '[]'::jsonb) from public.crm_department_managers)
  );
end;
$$;

create or replace function public.find_crm_cases(p_search text default '')
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'companyName', c.company_name, 'ticketCount', (select count(*) from public.crm_tickets t where t.case_id = c.id and t.deleted_at is null)) order by c.company_name), '[]'::jsonb)
  from public.crm_cases c where c.deleted_at is null and public.crm_can_access_case(c.id, 'cases.read')
    and (trim(coalesce(p_search, '')) = '' or c.company_name ilike '%' || trim(p_search) || '%');
$$;

create or replace function public.list_crm_cases(
  p_area text, p_search text default '', p_stage text default null,
  p_department text default null, p_sort text default 'recent'
) returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(result.case_json order by
    case when p_sort = 'company' then result.company_name end asc,
    case when p_sort = 'oldest' then result.updated_at end asc,
    result.updated_at desc
  ), '[]'::jsonb)
  from (
    select c.company_name, c.updated_at,
      jsonb_build_object(
        'id', c.id, 'companyName', c.company_name, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
        'ticketCount', count(t.id),
        'activeTicketCount', count(t.id) filter (where t.status = 'active'),
        'tickets', coalesce(jsonb_agg(public.crm_ticket_summary(t) order by t.updated_at desc) filter (where t.id is not null), '[]'::jsonb)
      ) case_json
    from public.crm_cases c
    join public.crm_tickets t on t.case_id = c.id and t.deleted_at is null
    join public.crm_ticket_stages stage on stage.slug = t.stage
    where c.deleted_at is null and stage.business_area = p_area
      and public.crm_can_access_ticket(t.id, 'tickets.read')
      and (p_stage is null or p_stage = '' or t.stage = p_stage)
      and (p_department is null or p_department = '' or t.current_department = p_department)
      and (
        trim(coalesce(p_search, '')) = '' or c.company_name ilike '%' || trim(p_search) || '%'
        or t.project_title ilike '%' || trim(p_search) || '%'
        or exists (select 1 from public.crm_ticket_contacts contact where contact.ticket_id = t.id and (
          contact.name ilike '%' || trim(p_search) || '%' or contact.email::text ilike '%' || trim(p_search) || '%'
          or contact.phone_number ilike '%' || trim(p_search) || '%'
        ))
      )
    group by c.id
  ) result;
$$;

create or replace function public.get_crm_case(p_case_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.crm_can_access_case(p_case_id, 'cases.read') then raise exception 'Case not found or access denied'; end if;
  select jsonb_build_object(
    'id', c.id, 'companyName', c.company_name, 'createdAt', c.created_at, 'updatedAt', c.updated_at,
    'tickets', coalesce((select jsonb_agg(public.crm_ticket_summary(t) order by t.updated_at desc) from public.crm_tickets t where t.case_id = c.id and t.deleted_at is null and public.crm_can_access_ticket(t.id, 'tickets.read')), '[]'::jsonb)
  ) into result from public.crm_cases c where c.id = p_case_id and c.deleted_at is null;
  if result is null then raise exception 'Case not found'; end if;
  return result;
end;
$$;

create or replace function public.get_crm_ticket(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then raise exception 'Ticket not found or access denied'; end if;
  select public.crm_ticket_summary(t) || jsonb_build_object(
    'companyName', c.company_name,
    'contacts', coalesce((select jsonb_agg(jsonb_build_object('id', contact.id, 'name', contact.name, 'email', contact.email::text, 'phoneNumber', contact.phone_number) order by contact.created_at) from public.crm_ticket_contacts contact where contact.ticket_id = t.id), '[]'::jsonb),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('id', note.id, 'content', note.content, 'authorId', note.created_by_user_id, 'authorName', coalesce(author.display_name, author.email::text), 'createdAt', note.created_at) order by note.created_at desc) from public.crm_ticket_notes note join public.profiles author on author.id = note.created_by_user_id where note.ticket_id = t.id), '[]'::jsonb),
    'requests', coalesce((select jsonb_agg(jsonb_build_object('id', request.id, 'requestType', request.request_type, 'status', request.status, 'requestedDepartment', request.requested_department, 'requestedAssigneeId', request.requested_assignee_id, 'requestNote', request.request_note, 'managerComment', request.manager_comment, 'managerModifiedData', request.manager_modified_data, 'createdAt', request.created_at, 'reviewedAt', request.reviewed_at) order by request.created_at desc) from public.crm_ticket_permission_requests request where request.ticket_id = t.id), '[]'::jsonb),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('id', activity.id, 'action', activity.action, 'actorName', coalesce(actor.display_name, actor.email::text, 'Former user'), 'details', activity.details, 'createdAt', activity.created_at) order by activity.created_at desc) from public.crm_ticket_activity activity left join public.profiles actor on actor.id = activity.actor_user_id where activity.ticket_id = t.id), '[]'::jsonb)
  ) into result from public.crm_tickets t join public.crm_cases c on c.id = t.case_id
  where t.id = p_ticket_id and t.deleted_at is null and c.deleted_at is null;
  return result;
end;
$$;

create or replace function public.update_crm_ticket(p_ticket_id uuid, p_project_title text, p_stage text, p_responsible_manager_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype; manager_id uuid;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.update') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id for update;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can be edited'; end if;
  if char_length(trim(coalesce(p_project_title, ''))) < 2 then raise exception 'Project title is required'; end if;
  if not exists (select 1 from public.crm_ticket_stages where slug = p_stage and is_active) then raise exception 'Select a valid stage'; end if;
  manager_id := ticket_record.responsible_manager_id;
  if p_responsible_manager_id is not null and p_responsible_manager_id <> manager_id then
    if not public.current_user_has_permission('tickets.requests.review') then raise exception 'Only a manager can change the responsible manager'; end if;
    manager_id := public.crm_resolve_manager(ticket_record.current_department, p_responsible_manager_id);
  end if;
  update public.crm_tickets set project_title = trim(p_project_title), stage = p_stage, responsible_manager_id = manager_id where id = p_ticket_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values
    (p_ticket_id, 'TICKET_UPDATED', actor, jsonb_build_object('previousStage', ticket_record.stage, 'stage', p_stage));
  return public.get_crm_ticket(p_ticket_id);
end;
$$;

create or replace function public.add_crm_ticket_note(p_ticket_id uuid, p_content text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); note_id uuid;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.notes.create') then raise exception 'Permission denied'; end if;
  if char_length(trim(coalesce(p_content, ''))) < 1 then raise exception 'Note content is required'; end if;
  if exists (select 1 from public.crm_tickets where id = p_ticket_id and status <> 'active') then raise exception 'Notes cannot be added to a closed or archived Ticket'; end if;
  insert into public.crm_ticket_notes (ticket_id, content, created_by_user_id) values (p_ticket_id, trim(p_content), actor) returning id into note_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id) values (p_ticket_id, 'NOTE_ADDED', actor);
  return jsonb_build_object('id', note_id);
end;
$$;

create or replace function public.request_crm_ticket_assignment(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype; request_id uuid;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.create') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets accept assignment requests'; end if;
  if exists (select 1 from public.crm_ticket_assignments where ticket_id = p_ticket_id and user_id = actor and removed_at is null) then raise exception 'You are already assigned to this Ticket'; end if;
  if exists (select 1 from public.crm_ticket_permission_requests where ticket_id = p_ticket_id and requested_by_user_id = actor and request_type = 'ASSIGN_TO_ME' and status = 'PENDING') then raise exception 'An Assign to Me request is already pending'; end if;
  insert into public.crm_ticket_permission_requests (ticket_id, request_type, requested_by_user_id, assigned_manager_id, current_department, requested_assignee_id)
  values (p_ticket_id, 'ASSIGN_TO_ME', actor, ticket_record.responsible_manager_id, ticket_record.current_department, actor) returning id into request_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values (p_ticket_id, 'ASSIGNMENT_REQUESTED', actor, jsonb_build_object('requestId', request_id));
  return jsonb_build_object('id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.request_crm_ticket_post(p_ticket_id uuid, p_requested_department text, p_request_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype; request_id uuid;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.requests.create') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id and deleted_at is null for update;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can be posted'; end if;
  if p_requested_department = ticket_record.current_department then raise exception 'Select a different destination department'; end if;
  if not exists (select 1 from public.crm_departments where slug = p_requested_department and is_active) then raise exception 'Select a valid destination department'; end if;
  if exists (select 1 from public.crm_ticket_permission_requests where ticket_id = p_ticket_id and request_type = 'POST_TICKET' and status = 'PENDING') then raise exception 'A Post Ticket request is already pending'; end if;
  insert into public.crm_ticket_permission_requests (ticket_id, request_type, requested_by_user_id, assigned_manager_id, current_department, requested_department, request_note)
  values (p_ticket_id, 'POST_TICKET', actor, ticket_record.responsible_manager_id, ticket_record.current_department, p_requested_department, nullif(trim(p_request_note), '')) returning id into request_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values (p_ticket_id, 'TRANSFER_REQUESTED', actor, jsonb_build_object('requestId', request_id, 'requestedDepartment', p_requested_department));
  return jsonb_build_object('id', request_id, 'status', 'PENDING');
end;
$$;

create or replace function public.list_crm_ticket_requests(p_status text default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); scope public.data_access_scope;
begin
  scope := public.current_user_permission_scope('tickets.requests.review');
  if scope is null then raise exception 'Permission denied'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'ticketId', r.ticket_id, 'ticketTitle', t.project_title, 'caseId', c.id, 'companyName', c.company_name,
      'requestType', r.request_type, 'requesterName', coalesce(requester.display_name, requester.email::text),
      'requestedByUserId', r.requested_by_user_id, 'assignedManagerId', r.assigned_manager_id,
      'responsibleManagerName', coalesce(manager.display_name, manager.email::text),
      'currentDepartment', r.current_department, 'requestedDepartment', r.requested_department,
      'requestedAssigneeId', r.requested_assignee_id, 'requestedAssigneeName', coalesce(assignee.display_name, assignee.email::text),
      'requestNote', r.request_note, 'status', r.status, 'managerComment', r.manager_comment,
      'managerModifiedData', r.manager_modified_data, 'createdAt', r.created_at, 'reviewedAt', r.reviewed_at
    ) order by r.created_at desc), '[]'::jsonb)
    from public.crm_ticket_permission_requests r
    join public.crm_tickets t on t.id = r.ticket_id
    join public.crm_cases c on c.id = t.case_id
    join public.profiles requester on requester.id = r.requested_by_user_id
    join public.profiles manager on manager.id = r.assigned_manager_id
    left join public.profiles assignee on assignee.id = r.requested_assignee_id
    where t.deleted_at is null and c.deleted_at is null
      and (p_status is null or p_status = '' or upper(p_status) = 'ALL' or r.status = upper(p_status))
      and (scope = 'company' or r.assigned_manager_id = actor)
  );
end;
$$;

create or replace function public.review_crm_ticket_request(
  p_request_id uuid, p_decision text, p_manager_comment text default null,
  p_modified_assignee_id uuid default null, p_modified_department text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); scope public.data_access_scope; request_record public.crm_ticket_permission_requests%rowtype; decision text := upper(p_decision); modified_data jsonb := '{}'::jsonb; applied_assignee uuid; applied_department text;
begin
  scope := public.current_user_permission_scope('tickets.requests.review');
  if scope is null then raise exception 'Permission denied'; end if;
  if decision not in ('APPROVED','REJECTED','MODIFIED') then raise exception 'Select Accept, Reject, or Modify'; end if;
  select * into request_record from public.crm_ticket_permission_requests where id = p_request_id for update;
  if request_record.id is null then raise exception 'Permission request not found'; end if;
  if request_record.status <> 'PENDING' then raise exception 'This request has already been reviewed'; end if;
  if scope <> 'company' and request_record.assigned_manager_id <> actor then raise exception 'This request is assigned to another manager'; end if;
  if request_record.requested_by_user_id = actor and not public.crm_user_has_role(actor, array['marketing_manager','sales_manager','delivery_manager','leadership','system_admin']) then raise exception 'You cannot approve your own request'; end if;
  if decision = 'MODIFIED' then
    if request_record.request_type = 'ASSIGN_TO_ME' then
      applied_assignee := p_modified_assignee_id;
      if applied_assignee is null or not exists (select 1 from public.profiles where id = applied_assignee and status = 'active') then raise exception 'Select a valid modified assignee'; end if;
      modified_data := jsonb_build_object('originalAssigneeId', request_record.requested_assignee_id, 'approvedAssigneeId', applied_assignee);
    else
      applied_department := p_modified_department;
      if applied_department is null or applied_department = request_record.current_department or not exists (select 1 from public.crm_departments where slug = applied_department and is_active) then raise exception 'Select a valid modified destination department'; end if;
      modified_data := jsonb_build_object('originalDepartment', request_record.requested_department, 'approvedDepartment', applied_department);
    end if;
  elsif decision = 'APPROVED' then
    applied_assignee := request_record.requested_assignee_id;
    applied_department := request_record.requested_department;
  end if;
  if decision in ('APPROVED','MODIFIED') and request_record.request_type = 'ASSIGN_TO_ME' then
    insert into public.crm_ticket_assignments (ticket_id, user_id, assigned_by_user_id, assigned_at, removed_at)
    values (request_record.ticket_id, applied_assignee, actor, now(), null)
    on conflict (ticket_id, user_id) do update set assigned_by_user_id = excluded.assigned_by_user_id, assigned_at = now(), removed_at = null;
  elsif decision in ('APPROVED','MODIFIED') and request_record.request_type = 'POST_TICKET' then
    update public.crm_tickets set current_department = applied_department where id = request_record.ticket_id;
  end if;
  update public.crm_ticket_permission_requests set status = decision, manager_comment = nullif(trim(p_manager_comment), ''), manager_modified_data = modified_data, reviewed_at = now(), reviewed_by_user_id = actor where id = p_request_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details) values
    (request_record.ticket_id, case when request_record.request_type = 'ASSIGN_TO_ME' then 'ASSIGNMENT_' || decision else 'TRANSFER_' || decision end, actor, jsonb_build_object('requestId', p_request_id) || modified_data);
  return jsonb_build_object('id', p_request_id, 'status', decision, 'ticketId', request_record.ticket_id);
end;
$$;

create or replace function public.close_crm_ticket(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_record public.crm_tickets%rowtype;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.close') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id for update;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can be closed'; end if;
  update public.crm_tickets set status = 'closed', closed_at = now(), closed_by_user_id = actor where id = p_ticket_id;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id) values (p_ticket_id, 'TICKET_CLOSED', actor);
  return jsonb_build_object('id', p_ticket_id, 'status', 'closed');
end;
$$;

create or replace function public.archive_crm_ticket(p_ticket_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.delete') then raise exception 'Permission denied'; end if;
  update public.crm_tickets set status = 'archived', deleted_at = now(), deleted_by_user_id = actor where id = p_ticket_id and deleted_at is null;
  if not found then raise exception 'Ticket not found'; end if;
  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id) values (p_ticket_id, 'TICKET_ARCHIVED', actor);
  return jsonb_build_object('id', p_ticket_id, 'archived', true);
end;
$$;

create or replace function public.archive_crm_case(p_case_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); ticket_count integer;
begin
  if not public.crm_can_access_case(p_case_id, 'cases.delete') then raise exception 'Permission denied'; end if;
  select count(*) into ticket_count from public.crm_tickets where case_id = p_case_id and deleted_at is null;
  if ticket_count > 0 then raise exception 'This Case contains % Ticket(s). Archive its Tickets before deleting the Case.', ticket_count; end if;
  update public.crm_cases set deleted_at = now(), deleted_by_user_id = actor where id = p_case_id and deleted_at is null;
  if not found then raise exception 'Case not found'; end if;
  return jsonb_build_object('id', p_case_id, 'archived', true);
end;
$$;

alter table public.crm_departments enable row level security;
alter table public.crm_ticket_stages enable row level security;
alter table public.crm_cases enable row level security;
alter table public.crm_department_managers enable row level security;
alter table public.crm_tickets enable row level security;
alter table public.crm_ticket_contacts enable row level security;
alter table public.crm_ticket_notes enable row level security;
alter table public.crm_ticket_assignments enable row level security;
alter table public.crm_ticket_permission_requests enable row level security;
alter table public.crm_ticket_activity enable row level security;

create policy crm_departments_read on public.crm_departments for select to authenticated using (true);
create policy crm_ticket_stages_read on public.crm_ticket_stages for select to authenticated using (true);
create policy crm_cases_read on public.crm_cases for select to authenticated using (public.crm_can_access_case(id, 'cases.read'));
create policy crm_department_managers_read on public.crm_department_managers for select to authenticated using (public.current_user_has_permission('tickets.create'));
create policy crm_tickets_read on public.crm_tickets for select to authenticated using (public.crm_can_access_ticket(id, 'tickets.read'));
create policy crm_contacts_read on public.crm_ticket_contacts for select to authenticated using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
create policy crm_notes_read on public.crm_ticket_notes for select to authenticated using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
create policy crm_assignments_read on public.crm_ticket_assignments for select to authenticated using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));
create policy crm_requests_read on public.crm_ticket_permission_requests for select to authenticated using (
  public.crm_can_access_ticket(ticket_id, 'tickets.read')
  or (public.current_user_has_permission('tickets.requests.review') and (assigned_manager_id = (select auth.uid()) or public.current_user_permission_scope('tickets.requests.review') = 'company'))
);
create policy crm_activity_read on public.crm_ticket_activity for select to authenticated using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));

grant select on public.crm_departments, public.crm_ticket_stages, public.crm_cases, public.crm_department_managers,
  public.crm_tickets, public.crm_ticket_contacts, public.crm_ticket_notes, public.crm_ticket_assignments,
  public.crm_ticket_permission_requests, public.crm_ticket_activity to authenticated;
revoke insert, update, delete on public.crm_departments, public.crm_ticket_stages, public.crm_cases,
  public.crm_department_managers, public.crm_tickets, public.crm_ticket_contacts, public.crm_ticket_notes,
  public.crm_ticket_assignments, public.crm_ticket_permission_requests, public.crm_ticket_activity from authenticated;

revoke all on function public.crm_user_has_role(uuid, text[]) from public, anon, authenticated;
revoke all on function public.crm_users_share_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.crm_validate_contacts(jsonb) from public, anon, authenticated;
revoke all on function public.crm_resolve_creation_department(text) from public, anon, authenticated;
revoke all on function public.crm_resolve_manager(text, uuid) from public, anon, authenticated;
revoke all on function public.crm_insert_contacts(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.crm_create_ticket_record(uuid, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.crm_ticket_summary(public.crm_tickets) from public, anon, authenticated;

revoke all on function public.crm_can_access_ticket(uuid, text) from public, anon;
revoke all on function public.crm_can_access_case(uuid, text) from public, anon;
grant execute on function public.crm_can_access_ticket(uuid, text) to authenticated;
grant execute on function public.crm_can_access_case(uuid, text) to authenticated;

revoke all on function public.create_crm_case_and_ticket(text, text, text, text, uuid, jsonb) from public, anon;
revoke all on function public.create_crm_ticket(uuid, text, text, text, uuid, jsonb) from public, anon;
revoke all on function public.get_crm_reference_data() from public, anon;
revoke all on function public.find_crm_cases(text) from public, anon;
revoke all on function public.list_crm_cases(text, text, text, text, text) from public, anon;
revoke all on function public.get_crm_case(uuid) from public, anon;
revoke all on function public.get_crm_ticket(uuid) from public, anon;
revoke all on function public.update_crm_ticket(uuid, text, text, uuid) from public, anon;
revoke all on function public.add_crm_ticket_note(uuid, text) from public, anon;
revoke all on function public.request_crm_ticket_assignment(uuid) from public, anon;
revoke all on function public.request_crm_ticket_post(uuid, text, text) from public, anon;
revoke all on function public.list_crm_ticket_requests(text) from public, anon;
revoke all on function public.review_crm_ticket_request(uuid, text, text, uuid, text) from public, anon;
revoke all on function public.close_crm_ticket(uuid) from public, anon;
revoke all on function public.archive_crm_ticket(uuid) from public, anon;
revoke all on function public.archive_crm_case(uuid) from public, anon;

grant execute on function public.create_crm_case_and_ticket(text, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.create_crm_ticket(uuid, text, text, text, uuid, jsonb) to authenticated;
grant execute on function public.get_crm_reference_data() to authenticated;
grant execute on function public.find_crm_cases(text) to authenticated;
grant execute on function public.list_crm_cases(text, text, text, text, text) to authenticated;
grant execute on function public.get_crm_case(uuid) to authenticated;
grant execute on function public.get_crm_ticket(uuid) to authenticated;
grant execute on function public.update_crm_ticket(uuid, text, text, uuid) to authenticated;
grant execute on function public.add_crm_ticket_note(uuid, text) to authenticated;
grant execute on function public.request_crm_ticket_assignment(uuid) to authenticated;
grant execute on function public.request_crm_ticket_post(uuid, text, text) to authenticated;
grant execute on function public.list_crm_ticket_requests(text) to authenticated;
grant execute on function public.review_crm_ticket_request(uuid, text, text, uuid, text) to authenticated;
grant execute on function public.close_crm_ticket(uuid) to authenticated;
grant execute on function public.archive_crm_ticket(uuid) to authenticated;
grant execute on function public.archive_crm_case(uuid) to authenticated;
