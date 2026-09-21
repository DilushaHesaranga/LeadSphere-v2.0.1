# Browser checks

The existing browser-testing folder is reused for both the original Dashboard QA
script and the lecturer-friendly Sprint 2 Playwright suite.

Run the 12 Sprint 2 tests from the repository root:

```text
npm run test:e2e
npm run test:e2e:report
```

`npm run test:e2e` first verifies that the matching Playwright Chromium runtime
is installed for the operating-system user running the command. This prevents a
browser installed by another Windows account or automation sandbox from causing
all tests to fail before they start.

The Sprint 2 suite uses `playwright.config.js`, Chromium, synthetic authentication,
realistic seeded fixtures, and intercepted Supabase/AI responses. It does not use
production data, send email, or consume AI credits.

## Original Dashboard browser checks

Run from the repository root:

```text
node frontend/e2e/dashboard.spec.mjs
```

The checks start a separate local Vite instance on port 4179, launch headless Chrome,
and use a synthetic Supabase session. Every Supabase request is intercepted; no live
account, database, API key, or AI service is used. Unexpected external requests fail
the checks. The server and browser close when the script finishes.

Install Playwright locally or set `PLAYWRIGHT_MODULE_DIR` to a directory containing
the Playwright package. On the Codex Windows workspace, the script also supports
the existing bundled runtime. Chrome must be installed. Screenshots are written to
the ignored `supabase/.temp/dashboard-qa` directory.

The script covers desktop, mobile and dark layouts; filter submission and date
validation; separate currency totals; ticket drilldown; retry after a failed
request; empty data; independent dashboard, report and ticket permissions; and
recorded deal value edits.
It also checks that `/console` remains the Overview welcome page and that the
separate `/console/dashboard` route and Dashboard navigation are available only
to Marketing Managers, Sales Managers, Delivery Managers, and Leadership with
`dashboards.read`. System Administrators alone, executives, viewers, unknown roles,
and users without roles are denied even if they have `dashboards.read`. The denied
scenarios must never request dashboard data. Multiple active roles are supported
when at least one allowed role is present.
Fixture-based browser checks verify the user interface; database permission and
aggregation checks are separate.
