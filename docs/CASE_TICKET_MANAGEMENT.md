# Case and Ticket Management

LeadSphere represents a company with `crm_cases` and each project, lead, opportunity, or customer engagement with `crm_tickets`. A Ticket has one non-null `case_id`; a Case can have many Tickets. Leads and Customers are not separate tables: `crm_ticket_stages.business_area` filters the same records into the appropriate workspace.

## Apply the migration

Run all migrations against the linked Supabase project from the `LeadSphere` folder:

```powershell
npx supabase db push
```

The Case/Ticket migrations are `supabase/migrations/20260803000100_case_ticket_management.sql`, `supabase/migrations/20260803000200_case_ticket_activity_hardening.sql`, `supabase/migrations/20260803000300_global_visibility_and_deletion_approval.sql`, and `supabase/migrations/20260803000400_multi_assignee_ticket_creation.sql`. They are additive and do not remove or rename an existing table.

## Tables

- `crm_departments` is the authoritative department list, initially Marketing, Sales, and Delivery.
- `crm_ticket_stages` is the authoritative pipeline stage list and maps each stage to Leads or Customers.
- `crm_cases` stores company Cases and supports soft deletion.
- `crm_tickets` stores projects and requires exactly one Case, department, stage, status, creator, and responsible manager.
- `crm_ticket_contacts` stores named contact methods without comma-separated data.
- `crm_ticket_notes` stores append-only shared note history.
- `crm_ticket_assignments` stores active and historical user assignments.
- `crm_ticket_permission_requests` stores Assign to Me and Post Ticket requests and review decisions.
- `crm_ticket_activity` and `crm_case_activity` store workflow audit events.
- `crm_department_managers` optionally maps a department to its default request reviewer.

Foreign keys use restrictive deletion for Cases, Tickets, creators, and responsible managers. Contacts, notes, assignments, requests, and activity only cascade if a privileged future maintenance operation permanently removes a Ticket. Normal application deletion creates a pending manager request; approval performs a soft archive and retains the related data.

## Department managers

When a department has a mapped active manager, the Ticket form selects that manager automatically. Without a mapping, the creator must select an authorised manager. Configure defaults in the Supabase SQL Editor, using the manager's Auth user UUID:

```sql
insert into public.crm_department_managers (
  department_slug,
  manager_user_id,
  assigned_by_user_id
) values (
  'sales',
  'MANAGER_AUTH_USER_UUID',
  'ADMIN_AUTH_USER_UUID'
)
on conflict (department_slug, manager_user_id) do nothing;
```

Only users with an active Manager, Leadership, or System Admin role can be selected as responsible managers.

## Security and workflows

The frontend uses authenticated Supabase RPCs. Security-definer functions derive creator, requester, reviewer, closer, and archiver identities from `auth.uid()` and never accept those identities from the client. RLS protects direct reads; authenticated clients have no direct insert, update, or delete grants on CRM tables.

- Marketing Executives default to Marketing and Sales Executives/Sales Managers default to Sales. The database enforces these defaults even if browser data is modified.
- Every active business role can read all Cases and Tickets at company scope. Update, note, assignment, transfer, close, and review capabilities remain separately permission-controlled.
- Marketing, Sales, and Delivery Managers, Leadership, and System Admin can create Cases and Tickets. Managers may select multiple initial assignees; each assignment is stored independently and does not replace another assignee.
- `Assign to Me` inserts a pending request only. Assignment is applied in the same transaction as manager approval or modification.
- `Post Ticket` inserts a pending transfer request only. Department changes are applied in the same transaction as manager approval or modification.
- Partial unique indexes prevent duplicate pending assignment and conflicting transfer requests.
- Closing preserves the Ticket and its history. Delete Ticket and Delete Case create pending manager requests and do not immediately alter the record. Approval archives the record atomically; rejection leaves it unchanged. Case deletion requests are blocked while the Case has any non-archived Ticket.

## Routes

- `/console/leads` — New and Open Tickets grouped by Case.
- `/console/customers` — Qualified and later-stage Tickets grouped by Case.
- `/console/cases/:caseId` — Case details and all accessible Tickets.
- `/console/tickets/:ticketId` — Ticket working area.
- `/console/permissions` — protected manager review queue.

The web UI uses `mailto:` and `tel:` handlers only. Email sending, telephony, notifications, and external workflow automation are intentionally outside this module.
