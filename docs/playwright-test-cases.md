# LeadSphere Sprint 2 — Playwright Test Cases

The tests use a synthetic Sales Manager session and realistic, deterministic CRM fixtures. All Supabase and AI calls are intercepted locally, so the run does not modify production records, send an email, or consume AI credits. An invalid or incomplete action is marked **Pass** when LeadSphere correctly blocks it or shows the intended error.

Performance threshold: the feature must become usable within 5 seconds on the local automated test environment. The AI loading indicator must appear within 2 seconds.

| Test ID | Feature | Category | Objective | Preconditions | Test data | Short test steps | Expected result | Actual result | Status |
|---|---|---|---|---|---|---|---|---|---|
| DASH-01 | Dashboard | Valid data | Confirm realistic dashboard information is displayed. | Synthetic Sales Manager is authenticated; seeded dashboard response is available. | 26 tickets; Enterprise sales pipeline. | Open CRM Dashboard; inspect summary and pipeline. | Heading, ticket total and pipeline data are visible. | Heading, 26-ticket total and Enterprise sales pipeline displayed. | Pass |
| DASH-02 | Dashboard | Invalid data | Confirm a failed dashboard service response is handled safely. | Authenticated dashboard user; dashboard request returns HTTP 503. | Synthetic service failure. | Open Dashboard; wait for failure response. | “Dashboard unavailable”, safe error text and Retry button appear. | Safe unavailable state and Retry button displayed; no uncaught error. | Pass |
| DASH-03 | Dashboard | Validation | Confirm an invalid custom date range is rejected locally. | Dashboard has loaded. | From 2026-09-20; To 2026-09-01. | Choose Custom; enter dates; apply filters. | Date-order message appears and no new dashboard request is sent. | Correct date-order message displayed; request count did not increase. | Pass |
| DASH-04 | Dashboard | Non-functional | Confirm the dashboard loads promptly without uncaught errors. | Local test server and fixture responses are available. | Five-second limit. | Open Dashboard; wait for a usable summary card and filter form. | Usable within 5 seconds; no page error. | Usable within the limit with filters visible and no page error. | Pass |
| EMAIL-01 | Email Templates | Valid data | Confirm a realistic follow-up template prepares a Gmail draft for review. | Pending email follow-up is visible; external window is safely captured. | customer@example.test; “Playwright Test Template”; realistic body. | Open Email template; enter data; choose Send email. | Exactly one Gmail compose URL contains the entered recipient, subject and message. No email is sent. | One captured Gmail draft contained the correct recipient and subject; no external email was sent. | Pass |
| EMAIL-02 | Email Templates | Invalid data | Confirm an unsupported recipient format is rejected. | Email template is open. | `not-an-email`. | Replace recipient; choose Send email. | Browser email validation fails and no Gmail draft opens. | Email type validation rejected the value; no draft opened. | Pass |
| EMAIL-03 | Email Templates | Validation | Confirm the required subject cannot be empty. | Email template is open with a valid recipient. | Empty subject. | Clear Subject; choose Send email. | Required-field validation fails and no Gmail draft opens. | Required-subject validation appeared; no draft opened. | Pass |
| EMAIL-04 | Email Templates | Non-functional | Confirm the template loads promptly and remains editable. | Pending email follow-up fixture is available. | Five-second limit. | Open Follow Ups; locate template fields. | Template is usable within 5 seconds; fields are editable; no page error. | Loaded within the limit with editable recipient and populated subject/message; no page error. | Pass |
| AI-01 | AI Assistant | Valid data | Confirm a CRM question produces a rendered assistant response. | Ticket is available; assistant status is enabled; deterministic response is mocked. | “What should I discuss during the next customer follow-up?” | Open ticket Assistant; submit question. | User message and assistant response render; loading finishes. | User question, assistant answer and AI verification label rendered; one request was made. | Pass |
| AI-02 | AI Assistant | Invalid data | Confirm an assistant service failure is handled gracefully. | Assistant status is enabled; ask request returns HTTP 503. | Unsupported cross-ticket request. | Submit question; observe response handling. | Safe unavailable message and Retry appear; composer becomes usable again. | Safe unavailable alert and Retry appeared; composer recovered. | Pass |
| AI-03 | AI Assistant | Validation | Confirm whitespace-only input cannot be submitted. | Assistant panel is open and available. | Three spaces. | Enter whitespace in question field. | Ask button remains disabled and no request is made. | Ask remained disabled and request count remained zero. | Pass |
| AI-04 | AI Assistant | Non-functional | Confirm responsive loading feedback and recovery. | A controlled assistant response is held until the test releases it. | “Summarize the current ticket status.” | Submit; verify loading; release response; verify usable state. | Loading appears within 2 seconds; response and enabled composer appear within 5 seconds; no page error. | Loading appeared within the threshold; response rendered and composer recovered within 5 seconds without page errors. | Pass |

## Commands

```text
npm run test:e2e
npm run test:e2e:report
```

The generated HTML report is stored in `playwright-report/index.html`.
