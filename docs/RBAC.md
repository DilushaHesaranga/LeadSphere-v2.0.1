# LeadSphere authorization model

Authorization is authoritative in Supabase PostgreSQL. React permission checks are user-interface controls, NestJS guards protect privileged APIs, and RLS/security-definer helpers enforce database access.

## Scope semantics

Scopes are ordered from narrowest to broadest:

| Scope | Meaning |
| --- | --- |
| `own` | Records created or owned by the current user. |
| `assigned` | Records owned by or explicitly assigned to the current user. |
| `team` | Records whose `team_id` belongs to one of the user's active teams. |
| `company` | All records for the current single-company deployment. |

Read-only access is represented by granting only `*.read` permissions. A read permission never implies an update, assignment, stage-change, or administrative permission.

## Role matrix

### System Admin

The existing deliberate superuser behavior is preserved: every permission receives `company` scope. System Admin is separate from Leadership and is never returned by the normal assignable-role endpoint. Creating another System Admin requires a future workflow protected by `team.members.assign_system_admin`. Scoped teams can be administered through the protected `/api/team/workgroups` endpoints guarded by `teams.read` and `teams.manage`.

### Marketing Executive

| Permission | Scope |
| --- | --- |
| `console.access` | company |
| `leads.create` | own |
| `leads.read` | assigned |
| `leads.update` | assigned |
| `leads.change_status` | assigned |
| `leads.monitor_conversion` | assigned |
| `lead_sources.read` | company |
| `pipeline.read` | assigned |

Marketing Executive intentionally has no lead assignment, revenue, team-performance, role, or membership permission.

### Sales Executive

| Permission group | Scope |
| --- | --- |
| `console.access` | company |
| `leads.read` | assigned |
| `accounts.read`, `accounts.update` | assigned |
| `contacts.read`, `contacts.update` | assigned |
| `activities.read`, `activities.create`, `activities.update` | assigned |
| `deals.read`, `deals.update`, `deals.move_stage` | assigned |
| `pipeline.read` | assigned |
| `followups.read`, `followups.update` | assigned |
| `reminders.read`, `reminders.update` | assigned |

Sales Executive intentionally has no assignment, team pipeline, company reporting, revenue, or administration permission.

### Sales Manager

| Permission group | Scope |
| --- | --- |
| `console.access` | company |
| `leads.read`, `leads.update`, `leads.assign` | team |
| `accounts.read`, `accounts.update`, `accounts.assign` | team |
| `contacts.read` | team |
| `activities.read` | team |
| `deals.read`, `deals.update`, `deals.move_stage`, `deals.assign` | team |
| `pipeline.read` | team |
| `followups.read`, `reminders.read` | team |
| `performance.read`, `dashboards.read`, `reports.read` | team |

Sales Manager intentionally has no company scope, revenue permission, or system-administration permission.

### Delivery Manager

| Permission | Scope |
| --- | --- |
| `console.access` | company |
| `accounts.read` | assigned |
| `contacts.read` | assigned |
| `activities.read` | assigned |
| `deals.read` | assigned |
| `customer_context.read` | assigned |

Delivery Manager is read-only. Future account/deal policies must additionally require the record to be in the delivery stage; no stage mutation, historical activity update, account assignment, deal value update, or administration permission is granted.

### Leadership

| Permission | Scope |
| --- | --- |
| `console.access` | company |
| `deals.read` | company |
| `pipeline.read` | company |
| `performance.read` | company |
| `dashboards.read` | company |
| `reports.read` | company |
| `revenue.read` | company |
| `revenue.forecast.read` | company |

Leadership has company-wide business visibility but no operational update, assignment, team-membership, role, permission, or System Admin access.

## Applying authorization to future features

### NestJS controller permission

```ts
@Get(':id')
@RequirePermission('accounts.read')
getAccount() {}
```

Use a minimum scope only when an endpoint inherently requires it:

```ts
@RequirePermission('reports.read', 'team')
```

After loading the record, prevent existence disclosure with the shared resolver:

```ts
this.dataScopeResolver.assertAccess(request.authorization, 'accounts.read', {
  ownerId: account.ownerId,
  assignedUserId: account.assignedUserId,
  teamId: account.teamId,
})
```

The resolver throws `404` for inaccessible records. Unauthenticated and missing-permission requests remain `401` and `403` through the guards.

### PostgreSQL RLS

Future record tables should store the applicable `owner_id`, `assigned_user_id`, and `team_id`, then use the shared helper in separate action policies:

```sql
create policy accounts_read_policy on public.accounts for select to authenticated
using (public.can_access_record('accounts.read', owner_id, assigned_user_id, team_id));

create policy accounts_update_policy on public.accounts for update to authenticated
using (public.can_access_record('accounts.update', owner_id, assigned_user_id, team_id))
with check (public.can_access_record('accounts.update', owner_id, assigned_user_id, team_id));
```

Delivery policies must add a delivery-stage predicate. Organization support must add `organization_id` to memberships, teams, invitations, authorization functions, and every business record before multiple companies share one deployment.

### React

```jsx
const { can, hasRole, getScope } = useAuth()

<PermissionGuard permission="accounts.update">
  <EditAccountButton />
</PermissionGuard>
```

Use `ProtectedRoute` for authentication and `PermissionGuard` for page/action visibility. Never treat these React checks as the security boundary.
