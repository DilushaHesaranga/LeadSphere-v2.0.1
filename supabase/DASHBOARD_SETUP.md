# CRM dashboard setup

The dashboard uses Supabase directly. No change or deployment to the teammate's Vercel backend is required.

Open **CRM Dashboard** from the sidebar at `/console/dashboard`. **Overview** remains at `/console`. The dashboard menu and direct route require one of the four permitted business roles as well as `dashboards.read`; executive and System Admin-only accounts retain Overview and are denied the dashboard.

## Enable the database functions

The existing ticket, pipeline history, follow-up, and scoped authorization migrations must already be applied. Dashboard access is independent of Reports & Insights.

1. Open the Supabase project's SQL Editor.
2. Copy and run the complete contents of `migrations/20260917000100_crm_dashboard.sql`, then `migrations/20260918000100_dashboard_role_access.sql`. Both wrap their changes in a transaction. If the dashboard was already installed, apply only the new `20260918000100` migration.
3. Build and deploy the frontend using the project's normal Firebase Hosting process.
4. Refresh the application with an active Marketing Manager, Sales Manager, Delivery Manager, or Leadership account. Add optional deal values from individual ticket details to populate sales charts.

For a database managed through the Supabase CLI, apply this migration through the team's normal migration workflow. Review the pending migration list first: unrelated local migrations may still be unapplied. If applying through SQL Editor, also record this migration as applied in the team's migration history before a later CLI push.

The migration adds one optional `crm_ticket_sales` table and dedicated functions. It does not change ticket workflow, rewrite existing reporting functions, or require an AI/API key.

## Metric definitions

- **Total tickets:** all currently visible, non-archived tickets. Deleted tickets and deleted cases are excluded.
- **Pipeline distribution:** the current stage of every ticket counted in Total tickets, including closed tickets and won/lost stages. Occupied inactive stages and pipelines stay visible so counts reconcile. Empty active stages are also shown. Selecting a stage lists the same tickets counted in its bar.
- **Pending tickets:** currently active tickets in an open stage. Won/lost stages and closed tickets do not count as pending.
- **New tickets:** tickets created during the selected period.
- **Closed tickets:** tickets currently closed, with a close date in the selected period. A close action is independent of winning a deal.
- **Won/lost tickets:** the ticket's current stage is won/lost and its latest entry into that outcome occurred during the selected period. Reopened tickets are not treated as current wins/losses.
- **Win rate:** selected-period won / (won + lost). No outcomes returns an unavailable value.
- **Sales value:** sum of recorded deal values for selected-period won tickets, grouped by currency. This is won deal value, not payments received or accounting revenue. Changing a ticket's value updates this view of its historical outcome.
- **Pipeline value:** recorded values for currently pending tickets. Weighted value applies each current stage's probability. Missing values are counted separately. Currencies are never added together or converted.
- **Sales trend:** calendar-month buckets, clipped to the selected event period, for each supported currency. An empty bucket is zero; wins with only unknown values in a known currency return an unavailable amount. Tickets with no currency/value record are included in the global missing-value count.
- **Overdue follow-ups:** pending occurrences on active tickets whose scheduled time has passed. Two overdue occurrences on one ticket count as two follow-ups; the ticket drill-down shows that ticket once.
- **Due today:** pending follow-ups scheduled today in Asia/Colombo, including any that became overdue earlier today. It overlaps the overdue count.
- **Upcoming:** pending follow-ups on active tickets scheduled from tomorrow onward. The next-follow-ups list includes the earliest six pending occurrences, with overdue entries first.
- **Completed follow-ups:** occurrences completed during the selected period, based on completion time, regardless of when they were originally scheduled.
- **Stale tickets:** pending tickets in their current stage for at least 14 days.
- **Unassigned tickets:** pending tickets with no active assigned people.
- **Team totals:** each ticket is attributed once to its responsible manager. Multiple assignees do not multiply totals.

Current workload and follow-up counts use the present snapshot, even when a historical reporting period is selected. Dates for event counts use Asia/Colombo. Department and owner filters describe the current department/assignment. History is not an immutable financial ledger.

## Permissions and validation

Dashboard functions require both `dashboards.read` and an active membership in one of four roles: `marketing_manager`, `sales_manager`, `delivery_manager`, or `leadership`. The user's profile must also be active. Executives, viewers, anonymous users, disabled memberships/profiles, and a `system_admin` role alone cannot access the dashboard. A user with multiple roles qualifies when at least one active role is allowed and the user has the dashboard permission. All three public dashboard functions enforce this rule, including direct API requests.

Marketing and sales managers initially receive team scope, delivery managers assigned scope, and leadership company scope. The access migration preserves existing custom scopes for these four roles and removes dashboard grants from every other role. Dashboard data still uses `crm_can_access_ticket(..., 'dashboards.read')`; the migration does not broaden ticket access. Reports & Insights access is unchanged. Private helper functions cannot be invoked by authenticated or anonymous users.

Ticket values require ticket-read access to view and ticket-read plus ticket-update access to change. Authorized users may add historical values to closed tickets. Archived tickets cannot be updated. Direct table writes are revoked; authorized function writes record a `TICKET_SALES_UPDATED` audit event. Supported currencies are LKR, USD, EUR, GBP, INR, and AUD. Amounts are optional, nonnegative, limited to 999999999999.99, and accept at most two decimals.

## Local validation

Run `node --test supabase/tests/crm-dashboard.test.mjs` from the project root after installing the existing root dependencies. It uses the PostgreSQL runtime already included with Firebase Tools (`@electric-sql/pglite`), runs both dashboard migrations in memory, and loads the real role, permission, and ticket access functions unchanged. Fixture tests cover aggregate accuracy, missing values, currencies, date boundaries, pagination, manager grants, scoped filter options, RLS, permission denials, and audited finance updates. Access checks exercise all four allowed roles, executives, viewers, administrators, disabled profiles/memberships, multiple roles, and later accidental grants. These tests do not contact or modify the hosted database. Browser checks are documented in `frontend/e2e/README.md`.

After deployment, run `tests/dashboard-role-access.sql` as the database owner. It uses a read-only transaction to test all three dashboard functions against existing account memberships and anonymous access, reports counts without identifying users, verifies function privileges and role grants, and rolls back its temporary authentication context. It creates no auth sessions and changes no application records.
