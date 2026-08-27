# Reports & Insights

Reports & Insights is LeadSphere's permission-aware reporting workspace. It aggregates the existing Ticket, pipeline, assignment, activity, and Follow Up data in PostgreSQL and exposes only records available through the signed-in user's `reports.read` scope.

## Architecture

- React renders the overview, reports library, report details, interactive charts, tables, and CSV download.
- The browser calls three authenticated Supabase RPCs through `reportService`.
- PostgreSQL performs filtering, point-in-time stage lookup, aggregation, comparison-period calculations, pagination, and record-level authorization.
- No chart or export dependency was added. Charts use semantic HTML/CSS, and CSV generation escapes spreadsheet formulas.
- LeadSphere is currently a single-company deployment. There is no organization or tenant key in the CRM schema. Isolation is therefore based on authentication, role scope, team membership, responsible-manager ownership, and active Ticket assignment through `crm_can_access_ticket`.

The schema currently has no monetary amount, currency, lead-source, campaign, expected-close-date, or sales-target fields. Revenue, weighted pipeline value, average deal value, source attribution, campaign performance, and forecasts are intentionally not shown.

## Entry points

- `/console/reports` — Overview
- `/console/reports/library` — standard Reports Library
- `/console/reports/:reportKey` — chart and paginated underlying records

Filters are stored in query parameters: `preset`, `from`, `to`, `pipeline`, `stage`, and `owner`. Detail pages also support `sort` and `page`.

## Permissions

The navigation and routes require `reports.read`. The database checks the permission again for every RPC and evaluates each Ticket using `crm_can_access_ticket(ticket.id, 'reports.read')`.

The current seed policy grants:

- Sales Manager — team scope
- Leadership — company scope
- System Admin — all permissions through the existing system-admin rule

Users without `reports.read` cannot see the navigation destination and cannot call the reporting RPCs successfully. The frontend is not treated as an authorization boundary.

## Standard reports

| Report key | Purpose |
| --- | --- |
| `ticket-volume` | Tickets created in the selected period |
| `conversion` | Selected-period Ticket creation cohort that reached a Customer stage by period end |
| `pipeline-health` | Active Tickets in open stages as of period end |
| `outcomes` | Tickets reaching their current Won or Lost outcome in the period |
| `follow-up-health` | Follow Ups scheduled in the period, including overdue status |
| `activity-summary` | Server-recorded Ticket workflow activity in the period |
| `team-performance` | Current assignee contribution within the authorized report scope |

The library contains standard reports only. Saved reports, favorites, dashboards, and a custom report builder are not represented by the current schema and were not fabricated.

## Metric definitions

Dates are interpreted as local calendar dates in `Asia/Colombo`. The beginning is inclusive and the end is inclusive in the UI, implemented by PostgreSQL as `[from at 00:00, day after to at 00:00)`. Timestamps remain stored in UTC.

- **New Tickets** — Tickets created inside the selected date interval. LeadSphere's Ticket is the opportunity/project entity, so this includes authorized lead and customer Tickets.
- **Converted Tickets** — Tickets created in the selected period whose first transition into a stage with `business_area = 'customers'` occurred no later than the period end.
- **Conversion Rate** — Converted Tickets from that creation cohort divided by all Tickets created in the period. A period with no new Tickets displays `N/A`, not zero.
- **Active Pipeline** — active Tickets in stages whose canonical `semantic_category` is `open`, evaluated at the end of the selected period.
- **Won/Lost Tickets** — Tickets whose current canonical Won or Lost stage was reached in the selected period.
- **Win Rate** — Won divided by Won plus Lost outcomes in the selected period. A period with no outcomes displays `N/A`.
- **Average Sales Cycle** — average elapsed days from Ticket creation to the relevant current Won or Lost transition for outcomes in the selected period.
- **Activities Recorded** — rows in `crm_ticket_activity` created during the selected period. This is workflow activity recorded by the server, not a claimed count of completed external calls or emails.
- **Completed Follow Ups** — occurrences scheduled in the selected period whose current status is `COMPLETED`.
- **Overdue Follow Ups** — occurrences scheduled in the selected period whose status is still `PENDING` and scheduled timestamp has passed.

Soft-deleted Tickets and Cases are excluded. Closed or archived Tickets remain available to outcome and historical creation reports but do not count as active pipeline. Assignment-based owner filtering uses the currently active assignment because the existing schema does not retain full assignment history after removal.

## Comparison and insights

The Overview compares the selected period with the immediately preceding interval of the same number of calendar days. Comparison values use the same pipeline, stage, owner, permission, and date-boundary rules.

Insights are deterministic and explainable. They report the two compared Ticket-creation counts, overdue Follow Up count, the largest active stage with its average age, and outcome sample size/win rate. The UI explicitly identifies them as rules-based, not AI-generated. Small outcome samples are described as insufficient rather than presented as a reliable trend.

## RPC contracts

### `get_crm_report_filter_options()`

Returns the reporting timezone, active pipelines and stages, and only owners/managers represented in the caller's authorized Ticket scope.

### `get_crm_reports_overview(p_from, p_to, p_pipeline_id, p_stage, p_owner_id)`

Returns period metadata, comparison-period metadata, KPI values and previous values, chart series, insights, and metric definitions.

### `list_crm_report_records(p_report_key, p_from, p_to, p_pipeline_id, p_stage, p_owner_id, p_sort, p_direction, p_page, p_page_size)`

Returns the stable column description, authorized records, total count, current page, page size, and page count. Page size is bounded to 1–200. The report key, range, pipeline, stage, owner, sort, and direction are validated by PostgreSQL.

## Export

CSV export retrieves all pages of the same authorized, server-filtered report. It does not export merely the visible page. Fields are quoted, UTF-8 BOM is included for spreadsheet compatibility, values beginning with `=`, `+`, `-`, or `@` are prefixed to prevent formula execution, and filenames contain only a normalized report name and date range.

Very large asynchronous exports and export audit events are not implemented because LeadSphere has no global export-job or reporting-audit subsystem. The current implementation is suitable for the RPC's paginated operational data and can later move to a background export job without changing metric definitions.

## Database change

Migration: `supabase/migrations/20260827000100_reports_and_insights.sql`

It adds one partial Ticket creation-date index, two private reporting helpers, and three authenticated entry RPCs. It does not rewrite or delete existing CRM data.

Apply the migration from the LeadSphere repository root using the project's normal linked Supabase migration workflow before using the new screen against a deployed environment.

## Adding a future standard report

1. Add a validated key and its columns/filter branch to `list_crm_report_records`.
2. Add any centralized aggregate or series required by `get_crm_reports_overview`.
3. Add catalog metadata to `frontend/src/config/reports.js`.
4. Map the report to an existing accessible chart or add a focused chart component in `ReportsWorkspace.jsx`.
5. Add authorization, boundary, aggregation, drill-down, empty-state, pagination, and export contract tests.

Add tenant identifiers to the CRM schema and every reporting helper before offering LeadSphere as a multi-tenant service. A frontend-only tenant filter is not sufficient isolation.
