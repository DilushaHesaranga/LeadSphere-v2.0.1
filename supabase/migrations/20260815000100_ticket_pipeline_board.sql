-- LeadSphere Ticket pipeline board.
--
-- crm_tickets remains the single opportunity/project entity. The migration
-- adds pipeline metadata, semantic stages, immutable transition history and
-- permission-checked RPCs without introducing a duplicate Deal table.

create table if not exists public.crm_pipelines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  is_default boolean not null default false,
  status text not null default 'active',
  created_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_pipelines_slug_format check (slug ~ '^[a-z][a-z0-9_]*$'),
  constraint crm_pipelines_name_length check (char_length(trim(name)) between 2 and 100),
  constraint crm_pipelines_status_check check (status in ('active', 'archived'))
);

create unique index if not exists crm_pipelines_name_unique
  on public.crm_pipelines (lower(trim(name)));
create unique index if not exists crm_pipelines_one_active_default
  on public.crm_pipelines (is_default) where is_default and status = 'active';

insert into public.crm_pipelines (slug, name, is_default, status)
values ('sales', 'Sales Pipeline', false, 'active')
on conflict (slug) do update set
  name = excluded.name,
  status = 'active';

update public.crm_pipelines
set is_default = true
where slug = 'sales'
  and not exists (
    select 1 from public.crm_pipelines current_default
    where current_default.is_default and current_default.status = 'active'
  );

drop trigger if exists crm_pipelines_set_updated_at on public.crm_pipelines;
create trigger crm_pipelines_set_updated_at
before update on public.crm_pipelines
for each row execute function public.set_updated_at();

alter table public.crm_ticket_stages
  add column if not exists pipeline_id uuid,
  add column if not exists probability numeric(5,2) not null default 0,
  add column if not exists semantic_category text not null default 'open',
  add column if not exists updated_at timestamptz not null default now();

update public.crm_ticket_stages
set pipeline_id = (select id from public.crm_pipelines where slug = 'sales')
where pipeline_id is null;

update public.crm_ticket_stages
set probability = case slug
    when 'qualification' then 20
    when 'proposal_or_price_quote' then 45
    when 'negotiation' then 70
    when 'sales_order' then 85
    when 'payment' then 90
    when 'close_won' then 100
    when 'lost' then 0
    else probability
  end,
  semantic_category = case
    when slug = 'close_won' then 'won'
    when slug = 'lost' then 'lost'
    else 'open'
  end;

alter table public.crm_ticket_stages alter column pipeline_id set not null;

do $$ begin
  alter table public.crm_ticket_stages
    add constraint crm_ticket_stages_pipeline_fk
    foreign key (pipeline_id) references public.crm_pipelines(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.crm_ticket_stages
    add constraint crm_ticket_stages_probability_check check (probability between 0 and 100);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.crm_ticket_stages
    add constraint crm_ticket_stages_semantic_category_check
    check (semantic_category in ('open', 'won', 'lost'));
exception when duplicate_object then null; end $$;

create unique index if not exists crm_ticket_stages_pipeline_name_unique
  on public.crm_ticket_stages (pipeline_id, lower(trim(name)));
create index if not exists crm_ticket_stages_pipeline_order_idx
  on public.crm_ticket_stages (pipeline_id, is_active, sort_order);

alter table public.crm_tickets
  add column if not exists pipeline_id uuid,
  add column if not exists stage_entered_at timestamptz,
  add column if not exists pipeline_version integer not null default 1;

update public.crm_tickets ticket
set pipeline_id = stage.pipeline_id,
    stage_entered_at = coalesce(ticket.stage_entered_at, ticket.updated_at, ticket.created_at)
from public.crm_ticket_stages stage
where stage.slug = ticket.stage
  and (ticket.pipeline_id is null or ticket.stage_entered_at is null);

alter table public.crm_tickets
  alter column pipeline_id set not null,
  alter column stage_entered_at set not null;

do $$ begin
  alter table public.crm_tickets
    add constraint crm_tickets_pipeline_fk
    foreign key (pipeline_id) references public.crm_pipelines(id) on delete restrict;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.crm_tickets
    add constraint crm_tickets_pipeline_version_check check (pipeline_version > 0);
exception when duplicate_object then null; end $$;

create index if not exists crm_tickets_pipeline_stage_updated_idx
  on public.crm_tickets (pipeline_id, stage, updated_at desc) where deleted_at is null;
create index if not exists crm_tickets_pipeline_stage_age_idx
  on public.crm_tickets (pipeline_id, stage, stage_entered_at) where deleted_at is null;
create index if not exists crm_tickets_pipeline_manager_idx
  on public.crm_tickets (pipeline_id, responsible_manager_id, updated_at desc) where deleted_at is null;

create table if not exists public.crm_ticket_stage_history (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.crm_tickets(id) on delete restrict,
  previous_pipeline_id uuid references public.crm_pipelines(id) on delete restrict,
  previous_stage_slug text references public.crm_ticket_stages(slug) on delete restrict,
  new_pipeline_id uuid not null references public.crm_pipelines(id) on delete restrict,
  new_stage_slug text not null references public.crm_ticket_stages(slug) on delete restrict,
  changed_by_user_id uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  previous_stage_entered_at timestamptz,
  duration_seconds bigint,
  probability_snapshot numeric(5,2) not null,
  transition_source text not null default 'API',
  idempotency_key uuid,
  constraint crm_ticket_stage_history_duration_check check (duration_seconds is null or duration_seconds >= 0),
  constraint crm_ticket_stage_history_probability_check check (probability_snapshot between 0 and 100),
  constraint crm_ticket_stage_history_source_length check (char_length(transition_source) between 2 and 40)
);

create unique index if not exists crm_ticket_stage_history_idempotency_unique
  on public.crm_ticket_stage_history (ticket_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists crm_ticket_stage_history_ticket_time_idx
  on public.crm_ticket_stage_history (ticket_id, changed_at desc);
create index if not exists crm_ticket_stage_history_pipeline_time_idx
  on public.crm_ticket_stage_history (new_pipeline_id, changed_at desc);

insert into public.crm_ticket_stage_history (
  ticket_id, previous_pipeline_id, previous_stage_slug,
  new_pipeline_id, new_stage_slug, changed_by_user_id,
  changed_at, previous_stage_entered_at, duration_seconds,
  probability_snapshot, transition_source
)
select ticket.id, null, null, ticket.pipeline_id, ticket.stage,
  ticket.created_by_user_id, ticket.created_at, null, null,
  stage.probability, 'MIGRATION'
from public.crm_tickets ticket
join public.crm_ticket_stages stage on stage.slug = ticket.stage
where not exists (
  select 1 from public.crm_ticket_stage_history history where history.ticket_id = ticket.id
);

insert into public.permissions (slug, description)
values ('pipeline.configure', 'Configure CRM pipelines and stages')
on conflict (slug) do update set description = excluded.description;

insert into public.role_permissions (role_id, permission_id, access_scope)
select role.id, permission.id, 'company'::public.data_access_scope
from public.roles role
join public.permissions permission on permission.slug = 'pipeline.configure'
where role.slug = 'system_admin'
on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;

-- Pipeline visibility follows LeadSphere's established company-wide Ticket
-- visibility. Movement still uses the narrower deals/leads mutation scopes.
insert into public.role_permissions (role_id, permission_id, access_scope)
select role.id, permission.id, 'company'::public.data_access_scope
from public.roles role
join public.permissions permission on permission.slug = 'pipeline.read'
where role.slug = any(array[
  'marketing_executive', 'sales_executive', 'marketing_manager', 'sales_manager',
  'delivery_manager', 'leadership', 'viewer', 'system_admin'
])
on conflict (role_id, permission_id) do update set access_scope = excluded.access_scope;

create or replace function public.crm_prepare_ticket_pipeline()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  default_pipeline uuid;
  requested_pipeline text;
begin
  if tg_op = 'UPDATE'
     and new.pipeline_id is not distinct from old.pipeline_id
     and new.stage is not distinct from old.stage then
    return new;
  end if;

  if new.pipeline_id is null then
    requested_pipeline := nullif(current_setting('app.crm_requested_pipeline_id', true), '');
    if requested_pipeline is not null then
      begin
        new.pipeline_id := requested_pipeline::uuid;
      exception when invalid_text_representation then
        raise exception 'PIPELINE_NOT_FOUND: Select a valid pipeline';
      end;
    else
      select id into default_pipeline
      from public.crm_pipelines
      where is_default and status = 'active'
      limit 1;
      if default_pipeline is null then
        raise exception 'PIPELINE_NOT_FOUND: No active default pipeline is configured';
      end if;
      new.pipeline_id := default_pipeline;
    end if;
  end if;

  if not exists (
    select 1
    from public.crm_pipelines pipeline
    join public.crm_ticket_stages stage on stage.pipeline_id = pipeline.id
    where pipeline.id = new.pipeline_id
      and pipeline.status = 'active'
      and stage.slug = new.stage
      and stage.is_active
  ) then
    raise exception 'PIPELINE_STAGE_MISMATCH: Select an active stage from the selected pipeline';
  end if;

  if tg_op = 'INSERT' then
    new.stage_entered_at := coalesce(new.stage_entered_at, new.created_at, now());
    new.pipeline_version := coalesce(new.pipeline_version, 1);
  else
    new.stage_entered_at := now();
    new.pipeline_version := old.pipeline_version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_tickets_prepare_pipeline on public.crm_tickets;
create trigger crm_tickets_prepare_pipeline
before insert or update on public.crm_tickets
for each row execute function public.crm_prepare_ticket_pipeline();

create or replace function public.crm_record_initial_ticket_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
declare stage_probability numeric(5,2);
begin
  select probability into stage_probability
  from public.crm_ticket_stages where slug = new.stage;
  insert into public.crm_ticket_stage_history (
    ticket_id, new_pipeline_id, new_stage_slug, changed_by_user_id,
    changed_at, probability_snapshot, transition_source
  ) values (
    new.id, new.pipeline_id, new.stage, new.created_by_user_id,
    new.created_at, stage_probability, 'CREATE'
  );
  return new;
end;
$$;

drop trigger if exists crm_tickets_record_initial_stage on public.crm_tickets;
create trigger crm_tickets_record_initial_stage
after insert on public.crm_tickets
for each row execute function public.crm_record_initial_ticket_stage();

-- Pipeline-aware overloads preserve the existing creation services while
-- allowing stage-specific board creation to choose a non-default pipeline in
-- the same transaction as the Ticket insert.
create or replace function public.create_crm_case_and_ticket_with_assignees(
  p_company_name text,
  p_project_title text,
  p_department text,
  p_stage text,
  p_responsible_manager_id uuid,
  p_contacts jsonb,
  p_pipeline_id uuid,
  p_assignee_ids uuid[] default array[]::uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  perform set_config('app.crm_requested_pipeline_id', coalesce(p_pipeline_id::text, ''), true);
  result := public.create_crm_case_and_ticket(
    p_company_name, p_project_title, p_department, p_stage,
    p_responsible_manager_id, p_contacts
  );
  perform public.crm_set_initial_ticket_assignees(
    (result ->> 'ticketId')::uuid, p_assignee_ids, actor
  );
  return result;
end;
$$;

create or replace function public.create_crm_ticket_with_assignees(
  p_case_id uuid,
  p_project_title text,
  p_department text,
  p_stage text,
  p_responsible_manager_id uuid,
  p_contacts jsonb,
  p_pipeline_id uuid,
  p_assignee_ids uuid[] default array[]::uuid[]
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  result jsonb;
begin
  perform set_config('app.crm_requested_pipeline_id', coalesce(p_pipeline_id::text, ''), true);
  result := public.create_crm_ticket(
    p_case_id, p_project_title, p_department, p_stage,
    p_responsible_manager_id, p_contacts
  );
  perform public.crm_set_initial_ticket_assignees(
    (result ->> 'ticketId')::uuid, p_assignee_ids, actor
  );
  return result;
end;
$$;

revoke all on function public.create_crm_case_and_ticket_with_assignees(text, text, text, text, uuid, jsonb, uuid, uuid[]) from public, anon;
revoke all on function public.create_crm_ticket_with_assignees(uuid, text, text, text, uuid, jsonb, uuid, uuid[]) from public, anon;
grant execute on function public.create_crm_case_and_ticket_with_assignees(text, text, text, text, uuid, jsonb, uuid, uuid[]) to authenticated;
grant execute on function public.create_crm_ticket_with_assignees(uuid, text, text, text, uuid, jsonb, uuid, uuid[]) to authenticated;

create or replace function public.crm_record_ticket_stage_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  transition_source text;
  transition_key uuid;
  stage_probability numeric(5,2);
  history_id uuid;
begin
  if new.pipeline_id is not distinct from old.pipeline_id
     and new.stage is not distinct from old.stage then
    return new;
  end if;

  transition_source := upper(coalesce(
    nullif(current_setting('app.crm_transition_source', true), ''),
    'API'
  ));
  if transition_source !~ '^[A-Z][A-Z0-9_]{1,39}$' then
    transition_source := 'API';
  end if;
  begin
    transition_key := nullif(current_setting('app.crm_transition_idempotency_key', true), '')::uuid;
  exception when invalid_text_representation then
    transition_key := null;
  end;

  select probability into stage_probability
  from public.crm_ticket_stages where slug = new.stage;

  insert into public.crm_ticket_stage_history (
    ticket_id, previous_pipeline_id, previous_stage_slug,
    new_pipeline_id, new_stage_slug, changed_by_user_id,
    changed_at, previous_stage_entered_at, duration_seconds,
    probability_snapshot, transition_source, idempotency_key
  ) values (
    new.id, old.pipeline_id, old.stage,
    new.pipeline_id, new.stage, (select auth.uid()),
    new.stage_entered_at, old.stage_entered_at,
    greatest(0, extract(epoch from (new.stage_entered_at - old.stage_entered_at))::bigint),
    stage_probability, transition_source, transition_key
  ) returning id into history_id;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (
    new.id,
    'STAGE_CHANGED',
    (select auth.uid()),
    jsonb_build_object(
      'historyId', history_id,
      'previousPipelineId', old.pipeline_id,
      'previousStage', old.stage,
      'pipelineId', new.pipeline_id,
      'stage', new.stage,
      'source', transition_source
    )
  );
  return new;
end;
$$;

drop trigger if exists crm_tickets_record_stage_transition on public.crm_tickets;
create trigger crm_tickets_record_stage_transition
after update of pipeline_id, stage on public.crm_tickets
for each row
when (old.pipeline_id is distinct from new.pipeline_id or old.stage is distinct from new.stage)
execute function public.crm_record_ticket_stage_transition();

create or replace function public.crm_ticket_summary(p_ticket public.crm_tickets)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p_ticket.id,
    'caseId', p_ticket.case_id,
    'projectTitle', p_ticket.project_title,
    'currentDepartment', p_ticket.current_department,
    'pipelineId', p_ticket.pipeline_id,
    'pipelineName', pipeline.name,
    'stage', p_ticket.stage,
    'stageName', stage.name,
    'stageProbability', stage.probability,
    'stageCategory', stage.semantic_category,
    'stageEnteredAt', p_ticket.stage_entered_at,
    'pipelineVersion', p_ticket.pipeline_version,
    'status', p_ticket.status,
    'responsibleManagerId', p_ticket.responsible_manager_id,
    'responsibleManagerName', coalesce(manager.display_name, manager.email::text),
    'assignedUsers', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', profile.id, 'name', coalesce(profile.display_name, profile.email::text))
        order by coalesce(profile.display_name, profile.email::text)
      )
      from public.crm_ticket_assignments assignment
      join public.profiles profile on profile.id = assignment.user_id
      where assignment.ticket_id = p_ticket.id and assignment.removed_at is null
    ), '[]'::jsonb),
    'createdAt', p_ticket.created_at,
    'updatedAt', p_ticket.updated_at,
    'closedAt', p_ticket.closed_at
  )
  from public.profiles manager
  join public.crm_ticket_stages stage on stage.slug = p_ticket.stage
  join public.crm_pipelines pipeline on pipeline.id = p_ticket.pipeline_id
  where manager.id = p_ticket.responsible_manager_id;
$$;

create or replace function public.get_crm_reference_data()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  return jsonb_build_object(
    'departments', (
      select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'name', name) order by sort_order), '[]'::jsonb)
      from public.crm_departments where is_active
    ),
    'pipelines', (
      select coalesce(jsonb_agg(jsonb_build_object('id', id, 'slug', slug, 'name', name, 'isDefault', is_default) order by is_default desc, name), '[]'::jsonb)
      from public.crm_pipelines where status = 'active'
    ),
    'stages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', slug,
        'name', name,
        'pipelineId', pipeline_id,
        'businessArea', business_area,
        'probability', probability,
        'category', semantic_category,
        'sortOrder', sort_order
      ) order by sort_order), '[]'::jsonb)
      from public.crm_ticket_stages where is_active
    ),
    'managers', (
      select coalesce(jsonb_agg(manager order by manager ->> 'name'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', profile.id,
          'name', coalesce(profile.display_name, profile.email::text),
          'email', profile.email::text,
          'roleSlug', min(role.slug)
        ) manager
        from public.profiles profile
        join public.user_roles user_role on user_role.user_id = profile.id and user_role.status = 'active'
        join public.roles role on role.id = user_role.role_id
        where profile.status = 'active' and role.slug = any(array['sales_manager', 'delivery_manager'])
        group by profile.id, profile.display_name, profile.email
      ) eligible_managers
    ),
    'assignees', case when public.current_user_has_permission('tickets.requests.review') then (
      select coalesce(jsonb_agg(item order by item ->> 'name'), '[]'::jsonb)
      from (
        select distinct jsonb_build_object('id', profile.id, 'name', coalesce(profile.display_name, profile.email::text)) item
        from public.profiles profile
        join public.user_roles user_role on user_role.user_id = profile.id
        join public.roles role on role.id = user_role.role_id
        where profile.status = 'active' and user_role.status = 'active'
          and role.slug = any(array['marketing_executive','sales_executive','marketing_manager','sales_manager','delivery_manager','leadership'])
      ) active_assignees
    ) else '[]'::jsonb end,
    'departmentManagers', (
      select coalesce(jsonb_agg(jsonb_build_object('department', department_slug, 'managerId', manager_user_id)), '[]'::jsonb)
      from public.crm_department_managers mapping
      where public.crm_is_eligible_responsible_manager(mapping.manager_user_id, mapping.department_slug)
    )
  );
end;
$$;

create or replace function public.list_crm_pipelines()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.current_user_has_permission('pipeline.read') then
    raise exception 'PIPELINE_FORBIDDEN: Your role cannot view the pipeline';
  end if;
  return jsonb_build_object(
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', pipeline.id,
        'slug', pipeline.slug,
        'name', pipeline.name,
        'isDefault', pipeline.is_default,
        'stages', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'slug', stage.slug,
            'name', stage.name,
            'businessArea', stage.business_area,
            'probability', stage.probability,
            'category', stage.semantic_category,
            'sortOrder', stage.sort_order
          ) order by stage.sort_order), '[]'::jsonb)
          from public.crm_ticket_stages stage
          where stage.pipeline_id = pipeline.id and stage.is_active
        )
      ) order by pipeline.is_default desc, pipeline.name), '[]'::jsonb)
      from public.crm_pipelines pipeline where pipeline.status = 'active'
    ),
    'canConfigure', public.current_user_has_permission('pipeline.configure')
  );
end;
$$;

create or replace function public.get_crm_pipeline_ticket(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'pipeline.read') then
    raise exception 'PIPELINE_NOT_FOUND: Ticket not found or access denied';
  end if;
  select jsonb_build_object(
    'id', ticket.id,
    'ticketNumber', upper(substr(replace(ticket.id::text, '-', ''), 1, 8)),
    'caseId', ticket.case_id,
    'companyName', case_record.company_name,
    'projectTitle', ticket.project_title,
    'pipelineId', ticket.pipeline_id,
    'stage', ticket.stage,
    'stageEnteredAt', ticket.stage_entered_at,
    'stageAgeSeconds', greatest(0, extract(epoch from (now() - ticket.stage_entered_at))::bigint),
    'pipelineVersion', ticket.pipeline_version,
    'status', ticket.status,
    'canMove', (
      public.crm_can_access_ticket(ticket.id, 'deals.move_stage')
      or public.crm_can_access_ticket(ticket.id, 'leads.change_status')
    ),
    'responsibleManagerId', ticket.responsible_manager_id,
    'responsibleManagerName', coalesce(manager.display_name, manager.email::text),
    'assignedUsers', coalesce((
      select jsonb_agg(jsonb_build_object('id', profile.id, 'name', coalesce(profile.display_name, profile.email::text)) order by coalesce(profile.display_name, profile.email::text))
      from public.crm_ticket_assignments assignment
      join public.profiles profile on profile.id = assignment.user_id
      where assignment.ticket_id = ticket.id and assignment.removed_at is null
    ), '[]'::jsonb),
    'nextFollowUpAt', (
      select min(follow_up.scheduled_at)
      from public.crm_follow_up_occurrences follow_up
      where follow_up.ticket_id = ticket.id and follow_up.status = 'PENDING' and follow_up.scheduled_at >= now()
    ),
    'hasOverdueFollowUp', exists (
      select 1 from public.crm_follow_up_occurrences follow_up
      where follow_up.ticket_id = ticket.id and follow_up.status = 'PENDING' and follow_up.scheduled_at < now()
    ),
    'updatedAt', ticket.updated_at
  ) into result
  from public.crm_tickets ticket
  join public.crm_cases case_record on case_record.id = ticket.case_id and case_record.deleted_at is null
  join public.profiles manager on manager.id = ticket.responsible_manager_id
  where ticket.id = p_ticket_id and ticket.deleted_at is null;
  if result is null then raise exception 'PIPELINE_NOT_FOUND: Ticket not found'; end if;
  return result;
end;
$$;

create or replace function public.get_crm_pipeline_board(
  p_pipeline_id uuid default null,
  p_search text default '',
  p_owner_id uuid default null,
  p_category text default null,
  p_stage_age_days integer default null,
  p_sort text default 'recent',
  p_page integer default 1,
  p_page_size integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  selected_pipeline public.crm_pipelines%rowtype;
  safe_search text := trim(coalesce(p_search, ''));
  safe_category text := nullif(lower(trim(coalesce(p_category, ''))), '');
  safe_sort text := lower(trim(coalesce(p_sort, 'recent')));
  safe_page integer := greatest(coalesce(p_page, 1), 1);
  safe_size integer := least(greatest(coalesce(p_page_size, 25), 1), 50);
  result jsonb;
begin
  if not public.current_user_has_permission('pipeline.read') then
    raise exception 'PIPELINE_FORBIDDEN: Your role cannot view the pipeline';
  end if;
  if safe_category is not null and safe_category not in ('open', 'won', 'lost') then
    raise exception 'PIPELINE_INVALID_FILTER: Select a valid stage category';
  end if;
  if safe_sort not in ('recent', 'oldest_stage', 'company', 'title') then
    raise exception 'PIPELINE_INVALID_FILTER: Select a valid sort order';
  end if;
  if p_stage_age_days is not null and p_stage_age_days < 0 then
    raise exception 'PIPELINE_INVALID_FILTER: Stage age cannot be negative';
  end if;

  if p_pipeline_id is null then
    select * into selected_pipeline
    from public.crm_pipelines
    where is_default and status = 'active'
    limit 1;
  else
    select * into selected_pipeline
    from public.crm_pipelines
    where id = p_pipeline_id and status = 'active';
  end if;
  if selected_pipeline.id is null then
    raise exception 'PIPELINE_NOT_FOUND: Pipeline not found';
  end if;

  with filtered as materialized (
    select
      ticket.id,
      ticket.stage,
      ticket.updated_at,
      ticket.stage_entered_at,
      case_record.company_name,
      ticket.project_title,
      jsonb_build_object(
        'id', ticket.id,
        'ticketNumber', upper(substr(replace(ticket.id::text, '-', ''), 1, 8)),
        'caseId', ticket.case_id,
        'companyName', case_record.company_name,
        'projectTitle', ticket.project_title,
        'pipelineId', ticket.pipeline_id,
        'stage', ticket.stage,
        'stageEnteredAt', ticket.stage_entered_at,
        'stageAgeSeconds', greatest(0, extract(epoch from (now() - ticket.stage_entered_at))::bigint),
        'pipelineVersion', ticket.pipeline_version,
        'status', ticket.status,
        'canMove', (
          public.crm_can_access_ticket(ticket.id, 'deals.move_stage')
          or public.crm_can_access_ticket(ticket.id, 'leads.change_status')
        ),
        'responsibleManagerId', ticket.responsible_manager_id,
        'responsibleManagerName', coalesce(manager.display_name, manager.email::text),
        'assignedUsers', coalesce(assignees.items, '[]'::jsonb),
        'nextFollowUpAt', follow_ups.next_at,
        'hasOverdueFollowUp', coalesce(follow_ups.overdue, false),
        'updatedAt', ticket.updated_at
      ) card
    from public.crm_tickets ticket
    join public.crm_cases case_record on case_record.id = ticket.case_id and case_record.deleted_at is null
    join public.crm_ticket_stages stage on stage.slug = ticket.stage and stage.pipeline_id = ticket.pipeline_id
    join public.profiles manager on manager.id = ticket.responsible_manager_id
    left join lateral (
      select jsonb_agg(jsonb_build_object('id', profile.id, 'name', coalesce(profile.display_name, profile.email::text)) order by coalesce(profile.display_name, profile.email::text)) items
      from public.crm_ticket_assignments assignment
      join public.profiles profile on profile.id = assignment.user_id
      where assignment.ticket_id = ticket.id and assignment.removed_at is null
    ) assignees on true
    left join lateral (
      select
        min(follow_up.scheduled_at) filter (where follow_up.scheduled_at >= now()) next_at,
        bool_or(follow_up.scheduled_at < now()) overdue
      from public.crm_follow_up_occurrences follow_up
      where follow_up.ticket_id = ticket.id and follow_up.status = 'PENDING'
    ) follow_ups on true
    where ticket.pipeline_id = selected_pipeline.id
      and ticket.deleted_at is null
      and ticket.status <> 'archived'
      and public.crm_can_access_ticket(ticket.id, 'pipeline.read')
      and (safe_category is null or stage.semantic_category = safe_category)
      and (p_stage_age_days is null or ticket.stage_entered_at <= now() - make_interval(days => p_stage_age_days))
      and (
        p_owner_id is null
        or ticket.responsible_manager_id = p_owner_id
        or exists (
          select 1 from public.crm_ticket_assignments owner_assignment
          where owner_assignment.ticket_id = ticket.id
            and owner_assignment.user_id = p_owner_id
            and owner_assignment.removed_at is null
        )
      )
      and (
        safe_search = ''
        or ticket.project_title ilike '%' || safe_search || '%'
        or case_record.company_name ilike '%' || safe_search || '%'
        or replace(ticket.id::text, '-', '') ilike replace(ltrim(safe_search, '#'), '-', '') || '%'
      )
  ), owners as (
    select distinct profile.id, coalesce(profile.display_name, profile.email::text) name
    from public.profiles profile
    where profile.status = 'active' and (
      exists (
        select 1 from public.crm_tickets owner_ticket
        where owner_ticket.pipeline_id = selected_pipeline.id
          and owner_ticket.deleted_at is null
          and owner_ticket.responsible_manager_id = profile.id
          and public.crm_can_access_ticket(owner_ticket.id, 'pipeline.read')
      )
      or exists (
        select 1
        from public.crm_ticket_assignments owner_assignment
        join public.crm_tickets owner_ticket on owner_ticket.id = owner_assignment.ticket_id
        where owner_ticket.pipeline_id = selected_pipeline.id
          and owner_ticket.deleted_at is null
          and owner_assignment.removed_at is null
          and owner_assignment.user_id = profile.id
          and public.crm_can_access_ticket(owner_ticket.id, 'pipeline.read')
      )
    )
  )
  select jsonb_build_object(
    'pipeline', jsonb_build_object(
      'id', selected_pipeline.id,
      'slug', selected_pipeline.slug,
      'name', selected_pipeline.name,
      'isDefault', selected_pipeline.is_default
    ),
    'totalCount', (select count(*) from filtered),
    'page', safe_page,
    'pageSize', safe_size,
    'owners', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) order by name), '[]'::jsonb) from owners),
    'stages', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'slug', stage.slug,
        'name', stage.name,
        'businessArea', stage.business_area,
        'probability', stage.probability,
        'category', stage.semantic_category,
        'sortOrder', stage.sort_order,
        'totalCount', (select count(*) from filtered item where item.stage = stage.slug),
        'hasMore', (select count(*) from filtered item where item.stage = stage.slug) > safe_page * safe_size,
        'cards', (
          select coalesce(jsonb_agg(page_items.card order by page_items.position), '[]'::jsonb)
          from (
            select item.card, row_number() over (order by
              case when safe_sort = 'recent' then item.updated_at end desc,
              case when safe_sort = 'oldest_stage' then item.stage_entered_at end asc,
              case when safe_sort = 'company' then item.company_name end asc,
              case when safe_sort = 'title' then item.project_title end asc,
              item.updated_at desc,
              item.id
            ) position
            from filtered item
            where item.stage = stage.slug
            order by
              case when safe_sort = 'recent' then item.updated_at end desc,
              case when safe_sort = 'oldest_stage' then item.stage_entered_at end asc,
              case when safe_sort = 'company' then item.company_name end asc,
              case when safe_sort = 'title' then item.project_title end asc,
              item.updated_at desc,
              item.id
            offset (safe_page - 1) * safe_size
            limit safe_size
          ) page_items
        )
      ) order by stage.sort_order), '[]'::jsonb)
      from public.crm_ticket_stages stage
      where stage.pipeline_id = selected_pipeline.id
        and stage.is_active
        and (safe_category is null or stage.semantic_category = safe_category)
    )
  ) into result;
  return result;
end;
$$;

create or replace function public.move_crm_ticket_stage(
  p_ticket_id uuid,
  p_pipeline_id uuid,
  p_stage_slug text,
  p_expected_version integer default null,
  p_source text default 'BOARD',
  p_idempotency_key uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  existing_history public.crm_ticket_stage_history%rowtype;
  safe_source text := upper(trim(coalesce(p_source, 'BOARD')));
begin
  if actor is null then raise exception 'PIPELINE_FORBIDDEN: Authentication required'; end if;
  if p_idempotency_key is not null then
    select * into existing_history
    from public.crm_ticket_stage_history
    where ticket_id = p_ticket_id and idempotency_key = p_idempotency_key;
    if existing_history.id is not null then
      return jsonb_build_object('moved', true, 'idempotentReplay', true, 'ticket', public.get_crm_pipeline_ticket(p_ticket_id));
    end if;
  end if;

  select * into ticket_record
  from public.crm_tickets
  where id = p_ticket_id and deleted_at is null
  for update;
  if ticket_record.id is null then raise exception 'PIPELINE_NOT_FOUND: Ticket not found'; end if;
  if ticket_record.status <> 'active' then raise exception 'PIPELINE_INVALID_STATE: Only active Tickets can move stage'; end if;
  if not (
    public.crm_can_access_ticket(p_ticket_id, 'deals.move_stage')
    or public.crm_can_access_ticket(p_ticket_id, 'leads.change_status')
  ) then
    raise exception 'PIPELINE_FORBIDDEN: Your role cannot move this Ticket';
  end if;
  if p_expected_version is not null and p_expected_version <> ticket_record.pipeline_version then
    raise exception 'PIPELINE_CONFLICT: This Ticket changed after the board loaded. Refresh and try again';
  end if;
  if not exists (
    select 1
    from public.crm_pipelines pipeline
    join public.crm_ticket_stages stage on stage.pipeline_id = pipeline.id
    where pipeline.id = p_pipeline_id
      and pipeline.status = 'active'
      and stage.slug = p_stage_slug
      and stage.is_active
  ) then
    raise exception 'PIPELINE_STAGE_MISMATCH: Select an active stage from the selected pipeline';
  end if;
  if ticket_record.pipeline_id = p_pipeline_id and ticket_record.stage = p_stage_slug then
    return jsonb_build_object('moved', false, 'ticket', public.get_crm_pipeline_ticket(p_ticket_id));
  end if;
  if safe_source !~ '^[A-Z][A-Z0-9_]{1,39}$' then
    raise exception 'PIPELINE_INVALID_SOURCE: Invalid transition source';
  end if;

  if p_idempotency_key is not null then
    select * into existing_history
    from public.crm_ticket_stage_history
    where ticket_id = p_ticket_id and idempotency_key = p_idempotency_key;
    if existing_history.id is not null then
      return jsonb_build_object('moved', true, 'idempotentReplay', true, 'ticket', public.get_crm_pipeline_ticket(p_ticket_id));
    end if;
  end if;

  perform set_config('app.crm_transition_source', safe_source, true);
  perform set_config('app.crm_transition_idempotency_key', coalesce(p_idempotency_key::text, ''), true);

  update public.crm_tickets
  set pipeline_id = p_pipeline_id,
      stage = p_stage_slug
  where id = p_ticket_id;

  return jsonb_build_object('moved', true, 'ticket', public.get_crm_pipeline_ticket(p_ticket_id));
end;
$$;

create or replace function public.get_crm_ticket_stage_history(p_ticket_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.read') then
    raise exception 'Ticket not found or access denied';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', history.id,
      'previousPipelineId', history.previous_pipeline_id,
      'previousPipelineName', previous_pipeline.name,
      'previousStage', history.previous_stage_slug,
      'previousStageName', previous_stage.name,
      'newPipelineId', history.new_pipeline_id,
      'newPipelineName', new_pipeline.name,
      'newStage', history.new_stage_slug,
      'newStageName', new_stage.name,
      'changedById', history.changed_by_user_id,
      'changedByName', coalesce(actor.display_name, actor.email::text, 'System'),
      'changedAt', history.changed_at,
      'durationSeconds', history.duration_seconds,
      'probabilitySnapshot', history.probability_snapshot,
      'source', history.transition_source
    ) order by history.changed_at desc), '[]'::jsonb)
    from public.crm_ticket_stage_history history
    left join public.crm_pipelines previous_pipeline on previous_pipeline.id = history.previous_pipeline_id
    left join public.crm_ticket_stages previous_stage on previous_stage.slug = history.previous_stage_slug
    join public.crm_pipelines new_pipeline on new_pipeline.id = history.new_pipeline_id
    join public.crm_ticket_stages new_stage on new_stage.slug = history.new_stage_slug
    left join public.profiles actor on actor.id = history.changed_by_user_id
    where history.ticket_id = p_ticket_id
  );
end;
$$;

-- Existing Ticket edits use the same transition operation as the board so a
-- stage change cannot bypass permission checks, concurrency, or history.
create or replace function public.update_crm_ticket(
  p_ticket_id uuid,
  p_project_title text,
  p_stage text,
  p_responsible_manager_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  ticket_record public.crm_tickets%rowtype;
  manager_id uuid;
begin
  if not public.crm_can_access_ticket(p_ticket_id, 'tickets.update') then raise exception 'Permission denied'; end if;
  select * into ticket_record from public.crm_tickets where id = p_ticket_id for update;
  if ticket_record.status <> 'active' then raise exception 'Only active Tickets can be edited'; end if;
  if char_length(trim(coalesce(p_project_title, ''))) < 2 then raise exception 'Project title is required'; end if;
  if not exists (
    select 1 from public.crm_ticket_stages
    where slug = p_stage and pipeline_id = ticket_record.pipeline_id and is_active
  ) then raise exception 'Select a valid stage'; end if;

  manager_id := ticket_record.responsible_manager_id;
  if p_responsible_manager_id is not null and p_responsible_manager_id <> manager_id then
    if not public.current_user_has_permission('tickets.requests.review') then
      raise exception 'Only a manager can change the responsible manager';
    end if;
    manager_id := public.crm_resolve_manager(ticket_record.current_department, p_responsible_manager_id);
  end if;

  if ticket_record.stage <> p_stage then
    perform public.move_crm_ticket_stage(
      p_ticket_id,
      ticket_record.pipeline_id,
      p_stage,
      ticket_record.pipeline_version,
      'DETAIL_EDIT',
      gen_random_uuid()
    );
  end if;

  update public.crm_tickets
  set project_title = trim(p_project_title),
      responsible_manager_id = manager_id
  where id = p_ticket_id;

  insert into public.crm_ticket_activity (ticket_id, action, actor_user_id, details)
  values (
    p_ticket_id,
    'TICKET_UPDATED',
    actor,
    jsonb_build_object('previousStage', ticket_record.stage, 'stage', p_stage)
  );
  return public.get_crm_ticket(p_ticket_id);
end;
$$;

-- Reuse the existing notification delivery path for one stage-change event.
create or replace function public.crm_notify_ticket_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  ticket_record public.crm_tickets%rowtype;
  notification_title text;
  notification_message text;
  destination text;
  destination_stage_name text;
begin
  if new.action <> all(array[
    'TICKET_CREATED','NOTE_ADDED','ASSIGNMENT_DIRECT','TRANSFER_DIRECT',
    'TICKET_CLOSED','TICKET_DELETE_DIRECT','STAGE_CHANGED'
  ]) then return new; end if;
  select * into ticket_record from public.crm_tickets where id = new.ticket_id;
  if ticket_record.id is null then return new; end if;
  if new.action = 'STAGE_CHANGED' then
    select stage.name into destination_stage_name
    from public.crm_ticket_stages stage
    where stage.slug = coalesce(new.details ->> 'stage', ticket_record.stage);
  end if;

  notification_title := case new.action
    when 'TICKET_CREATED' then 'Ticket created'
    when 'NOTE_ADDED' then 'New Ticket note'
    when 'ASSIGNMENT_DIRECT' then 'Ticket assignment updated'
    when 'TRANSFER_DIRECT' then 'Ticket transferred'
    when 'TICKET_CLOSED' then 'Ticket closed'
    when 'TICKET_DELETE_DIRECT' then 'Ticket archived'
    when 'STAGE_CHANGED' then 'Ticket stage changed'
  end;
  notification_message := case new.action
    when 'TICKET_CREATED' then ticket_record.project_title || ' was created.'
    when 'NOTE_ADDED' then 'A note was added to ' || ticket_record.project_title || '.'
    when 'ASSIGNMENT_DIRECT' then ticket_record.project_title || ' has a new direct assignment.'
    when 'TRANSFER_DIRECT' then ticket_record.project_title || ' moved to another department.'
    when 'TICKET_CLOSED' then ticket_record.project_title || ' was closed.'
    when 'TICKET_DELETE_DIRECT' then ticket_record.project_title || ' was archived.'
    when 'STAGE_CHANGED' then ticket_record.project_title || ' moved to ' || coalesce(destination_stage_name, new.details ->> 'stage', ticket_record.stage) || '.'
  end;
  destination := case when new.action = 'TICKET_DELETE_DIRECT'
    then '/console/cases/' || ticket_record.case_id::text
    else '/console/tickets/' || ticket_record.id::text end;

  insert into public.user_notifications (user_id, kind, title, message, link, event_key)
  select target.user_id, lower(new.action), notification_title, notification_message, destination,
    'ticket-activity:' || new.id::text
  from (
    select ticket_record.created_by_user_id user_id
    union select ticket_record.responsible_manager_id
    union select assignment.user_id
      from public.crm_ticket_assignments assignment
      where assignment.ticket_id = new.ticket_id and assignment.removed_at is null
  ) target
  join public.profiles profile on profile.id = target.user_id and profile.status = 'active'
  where target.user_id is distinct from new.actor_user_id
  on conflict (user_id, event_key) do nothing;
  return new;
end;
$$;

alter table public.crm_pipelines enable row level security;
alter table public.crm_ticket_stage_history enable row level security;

drop policy if exists crm_pipelines_read on public.crm_pipelines;
create policy crm_pipelines_read on public.crm_pipelines for select to authenticated
using (public.current_user_has_permission('pipeline.read'));

drop policy if exists crm_ticket_stage_history_read on public.crm_ticket_stage_history;
create policy crm_ticket_stage_history_read on public.crm_ticket_stage_history for select to authenticated
using (public.crm_can_access_ticket(ticket_id, 'tickets.read'));

grant select on public.crm_pipelines, public.crm_ticket_stage_history to authenticated;
revoke insert, update, delete on public.crm_pipelines, public.crm_ticket_stage_history from authenticated;

revoke all on function public.crm_prepare_ticket_pipeline() from public, anon, authenticated;
revoke all on function public.crm_record_initial_ticket_stage() from public, anon, authenticated;
revoke all on function public.crm_record_ticket_stage_transition() from public, anon, authenticated;
revoke all on function public.list_crm_pipelines() from public, anon;
revoke all on function public.get_crm_pipeline_ticket(uuid) from public, anon;
revoke all on function public.get_crm_pipeline_board(uuid, text, uuid, text, integer, text, integer, integer) from public, anon;
revoke all on function public.move_crm_ticket_stage(uuid, uuid, text, integer, text, uuid) from public, anon;
revoke all on function public.get_crm_ticket_stage_history(uuid) from public, anon;

grant execute on function public.list_crm_pipelines() to authenticated;
grant execute on function public.get_crm_pipeline_ticket(uuid) to authenticated;
grant execute on function public.get_crm_pipeline_board(uuid, text, uuid, text, integer, text, integer, integer) to authenticated;
grant execute on function public.move_crm_ticket_stage(uuid, uuid, text, integer, text, uuid) to authenticated;
grant execute on function public.get_crm_ticket_stage_history(uuid) to authenticated;
