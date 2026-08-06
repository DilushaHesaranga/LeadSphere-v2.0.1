# Follow Ups

LeadSphere stores Follow Ups in Supabase and exposes the same records through a Ticket tab and the global `/console/follow-ups` page.

## Data model

- `crm_follow_up_series` stores the rule and active state for a recurring schedule.
- `crm_follow_up_occurrences` stores one-time Follow Ups and the individual historical occurrences of recurring series.
- One-time records have no `series_id`.
- A recurring Follow Up creates only its first occurrence. Completing or cancelling the current occurrence advances an active series by exactly one occurrence.
- A unique `(series_id, scheduled_at)` index and row locking prevent duplicate future occurrences.

## Recurrence

Supported frequencies are Daily, Every 3 days, Weekly, and Monthly. Dates are stored as UTC `timestamptz` values and displayed in the browser's local timezone. Monthly recurrence clamps to the final valid day of the next month.

## Permissions

- Read access follows `tickets.read` through `crm_can_access_ticket`.
- Create, edit, complete, cancel, and stop-series actions follow `tickets.notes.create` for the target Ticket.
- Global Ticket search returns only active Tickets for which the current user can create Follow Ups.
- RLS protects both Follow Up tables, while all mutations use security-definer RPCs with their own target-Ticket checks.

## RPCs

- `create_crm_follow_up`
- `list_crm_follow_ups`
- `search_crm_follow_up_tickets`
- `update_crm_follow_up`
- `complete_crm_follow_up`
- `cancel_crm_follow_up`
- `stop_crm_follow_up_series`

The frontend broadcasts `leadsphere:follow-ups-changed` after mutations so open Follow Up views refresh from the same persisted source without a page reload.
