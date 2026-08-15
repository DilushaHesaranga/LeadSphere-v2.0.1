# LeadSphere Ticket Pipeline

## Domain model

The pipeline uses the existing `crm_tickets` record as the sales opportunity/project. A Case remains the company-level customer record. No separate Deal table is introduced, so assignment, contacts, Follow Ups, permissions, deletion approval, and the Sales Order lead-to-customer transition keep using the existing workflow.

The seeded **Sales Pipeline** uses the established stages in this order:

| Stage | Category | Probability | Business area |
| --- | --- | ---: | --- |
| Qualification | open | 20% | Leads |
| Proposal or Price Quote | open | 45% | Leads |
| Negotiation | open | 70% | Leads |
| Sales Order | open | 85% | Customers |
| Payment | open | 90% | Customers |
| Close won | won | 100% | Customers |
| Lost | lost | 0% | Customers |

LeadSphere Tickets do not currently store an opportunity amount, currency, or expected close date. The board therefore does not invent monetary totals, weighted revenue, amount filters, or close-date filters. The probability metadata and exact-decimal expected-revenue utility are ready for a future, properly designed amount field.

## Architecture

`20260815000100_ticket_pipeline_board.sql` adds:

- `crm_pipelines` for pipeline identity, active/default state, and future configuration.
- Pipeline, probability, semantic category, stage-entry time, and optimistic version metadata on the existing stage/Ticket tables.
- `crm_ticket_stage_history`, an immutable transition audit table.
- Indexed, permission-aware RPCs for pipeline listing, board pagination, canonical Ticket retrieval, stage movement, and history retrieval.
- A single `move_crm_ticket_stage` operation used by both the board and the existing Ticket edit RPC.

The board remains a direct React-to-Supabase CRM feature, matching the current Case/Ticket service architecture. NestJS remains responsible for privileged team operations and does not duplicate pipeline logic.

## Authorization and movement

- `pipeline.read` gives active business roles company-wide board visibility, matching LeadSphere's existing company-wide Case/Ticket visibility rule.
- `deals.move_stage` or `leads.change_status` controls stage movement, using the caller's existing assigned/team/company scope.
- `pipeline.configure` is reserved for System Admin as an extension point. LeadSphere has no pipeline administration/settings area yet, so this release intentionally seeds a safe default rather than adding a separate administration product.
- PostgreSQL rechecks authorization, active Ticket status, selected pipeline, destination-stage membership, and the expected `pipeline_version` while holding the Ticket row lock.
- Every client move has a UUID idempotency key. A database unique index prevents duplicate history under retries or concurrent submissions.
- Pipeline and stage foreign keys use `ON DELETE RESTRICT`, preventing destructive removal while records or history still reference them.

## Board behavior

The `/console/pipeline` route provides:

- Ordered stage columns with semantic category, probability, and authoritative filtered record counts.
- Ticket cards with company, responsible manager, active assignees, time in stage, and next/overdue Follow Up state.
- Server-side search, owner/assignee filter, semantic category filter, minimum stage-age filter, and supported sort orders.
- Per-stage incremental loading without unbounded client fetching.
- Drag-and-drop plus a labelled stage selector for keyboard and assistive-technology users.
- Server-confirmed movement rather than optimistic mutation, with conflict and permission errors preserved.
- Stage-specific reuse of the existing Ticket creation flow.
- A per-user, browser-local selected pipeline preference and URL-backed filters.

The Ticket Activity tab shows immutable stage history: previous/new stage, actor, timestamp, previous-stage duration, probability snapshot, pipeline, and transition source.

## Migration and rollout

The migration is repeat-safe. It creates or updates the Sales Pipeline, maps every existing configured stage into it, backfills existing Tickets using their current stage without changing their business meaning, derives `stage_entered_at` from existing update/create timestamps, and creates one migration history row only when a Ticket has no history.

Apply database changes before deploying the frontend:

```powershell
npx supabase db push --linked
```

Then validate and deploy the web application through the repository's normal commands. A safe local/test Supabase database is preferred before pushing to the linked production project.

## Future configuration

A future administrator UI can build on `crm_pipelines`, `crm_ticket_stages.pipeline_id`, explicit `sort_order`, and `pipeline.configure`. It must add transactional create/rename/default/reorder/archive operations and explicit record mappings before allowing a populated stage or pipeline to be removed. Direct authenticated table mutation remains revoked.
