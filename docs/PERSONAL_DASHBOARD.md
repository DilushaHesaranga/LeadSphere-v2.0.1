# Personal CRM dashboard

CRM Dashboard is personal for Marketing Executives, Sales Executives, Marketing Managers, Sales Managers, Delivery Managers, and Leadership. System Admin alone does not grant access. A user also needs dashboard and ticket-read permissions.

The database derives identity from the authenticated session. Current ticket assignment, responsible management, or current case account ownership is required, together with ticket-read access. Creator status alone and broad team/company permissions do not expand personal scope. Deleted cases/tickets and archived tickets are excluded. Removed assignments stop qualifying. The endpoint accepts no user ID or owner override.

Reports & Insights retains its existing permissions and reporting scope. Its Sales performance tab remains management-only.

## Expected value and scoring

Only active tickets in open stages enter the revenue estimate and call queue. Each known value is multiplied by the displayed estimated win probability. Currencies remain separate; unknown amounts are excluded and counted separately; recorded zero is valid.

The browser trains a categorical Naive Bayes model with Laplace smoothing on up to 500 recent won/lost outcomes within the caller's personal scope. It uses age bands, completed follow-up count bands, and currency-specific order-of-magnitude deal-size bands. Historical age and interaction counts stop at the outcome. A deal value modified after the outcome is unknown for training, since historical value snapshots are unavailable. No shared cache, persisted model, paid API, or external AI service is used.

Training requires at least 20 outcomes, 5 wins, and 5 losses. Below that threshold the UI explicitly labels a provisional stage-based estimate: stage probability + up to 10 points for completed follow-ups − up to 15 points for age. All estimates are bounded to 5–95%. These outputs are experimental, uncalibrated estimates, not validated financial forecasts. The sample threshold is an operational guard, not evidence of accuracy. Historical feature snapshots and a held-out evaluation should be introduced before relying on predictions for financial planning.

The call queue sorts by probability descending, overdue follow-ups descending, then stable ticket ID. It does not compare monetary amounts across currencies. Multiple contacts require a choice. Call checks current ownership and active stage again on the server, records an existing communication-launch event, and opens the device dialer. It does not place an automatic call or claim the conversation completed.

## Verification

`frontend/test/win-scoring.test.js` covers fallback, learned evidence, unseen categories, bounds, priority ordering, currencies, and missing/zero amounts. `supabase/tests/personal-dashboard.sql` runs in a transaction as database owner to verify real account scopes, privileges, personal totals, and rejection of unowned calls. Run it in a rollback transaction for audit-only use. Frontend access tests distinguish personal dashboard roles from management reporting roles.
