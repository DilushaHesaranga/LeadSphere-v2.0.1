begin;

-- System administrators operate the Team Management feature only. Console access
-- is retained so they can sign in and reach that feature; every CRM permission is
-- removed at the database authorization layer.
delete from public.role_permissions role_permission
using public.roles role, public.permissions permission
where role_permission.role_id = role.id
  and role_permission.permission_id = permission.id
  and role.slug = 'system_admin'
  and permission.slug <> all(array[
    'console.access',
    'team.members.read',
    'team.members.invite',
    'team.members.assign_role',
    'team.members.change_status',
    'team.members.assign_system_admin',
    'teams.read',
    'teams.manage',
    'roles.read'
  ]);

insert into public.role_permissions(role_id, permission_id, access_scope)
select role.id, permission.id, 'company'::public.data_access_scope
from public.roles role
join public.permissions permission on permission.slug = any(array[
  'console.access',
  'team.members.read',
  'team.members.invite',
  'team.members.assign_role',
  'team.members.change_status',
  'team.members.assign_system_admin',
  'teams.read',
  'teams.manage',
  'roles.read'
])
where role.slug = 'system_admin'
on conflict(role_id, permission_id) do update set access_scope = excluded.access_scope;

-- Delivery managers may move stages only when crm_can_access_ticket confirms they
-- are the current responsible manager or an active assignee of that Ticket.
insert into public.role_permissions(role_id, permission_id, access_scope)
select role.id, permission.id, 'assigned'::public.data_access_scope
from public.roles role
join public.permissions permission on permission.slug = 'deals.move_stage'
where role.slug = 'delivery_manager'
on conflict(role_id, permission_id) do update set access_scope = excluded.access_scope;

commit;
