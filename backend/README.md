# LeadSphere API

This directory contains the NestJS API used for privileged LeadSphere team and invitation operations. Production hosting uses one native NestJS Vercel Function; local development continues to use the Nest CLI.

## Local development

Copy `.env.example` to `.env`, provide the required values, and run:

```powershell
npm install
npm run start:dev
```

The API is available at `http://localhost:3000/api` and the lightweight health endpoint is `http://localhost:3000/api/health`.

## Checks

```powershell
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
npm run build
```

## Vercel

Vercel recognizes `src/main.ts` as the NestJS entry point. `vercel.json` selects native NestJS framework handling; no custom Express adapter, catch-all API file, or legacy `builds` configuration is used.

Create a separate Vercel project for this directory and set its **Root Directory** to `backend`. Add the production variables described in [`../docs/VERCEL_BACKEND.md`](../docs/VERCEL_BACKEND.md), deploy, and use the resulting HTTPS origin as the frontend's `VITE_API_URL`.

Do not include `/api` in `VITE_API_URL`; the frontend API client adds that prefix itself.

## Optional AI Assistant

**Deployment update:** The frontend now uses the Supabase Edge Function. See
[Supabase setup](../supabase/AI_ASSISTANT_SETUP.md). No Vercel backend update is
required for that route. The instructions below describe the retained NestJS alternative.

The ticket details page includes an AI Assistant panel with summaries, contextual chat,
and editable email drafts. Opening a draft in Gmail does not send it or complete a follow-up.
The assistant never mutates CRM records. Closing the panel clears its in-memory chat.

Enable on the **backend** with:

```dotenv
AI_ASSISTANT_ENABLED=true
OPENAI_API_KEY=<set in your hosting provider's secret settings>
OPENAI_MODEL=gpt-4.1-mini
```

Keep the key out of frontend/VITE variables and source control. The defaults are disabled;
missing AI configuration does not prevent backend startup. Set
`VITE_AI_ASSISTANT_ENABLED=false` when building the frontend to hide its entry point.
The frontend's `VITE_API_URL` must point to this deployed backend, and its origin must be
allowed by the backend's `CORS_ORIGINS`. Deploy both backend and frontend for this feature;
Firebase Hosting alone only deploys the frontend. No database migration is needed.

Implementation uses the OpenAI Responses API with `store: false` and a structured output
schema ([official documentation](https://developers.openai.com/api/docs/guides/structured-outputs)).
Use a model that supports Responses structured outputs. No API key or live provider is
needed to run the mocked tests.

Every request verifies authentication and `tickets.read`, then calls the existing ticket
and follow-up RPCs with the caller's JWT and publishable key. Service-role credentials are
not used for assistant context. Client-supplied context and source URLs are ignored. Only
server-selected overview fields, 12 recent notes (1500 characters each), 15 recent non-stage
activity entries, and 20 follow-ups (pending first) are included. Contacts, attachments,
permission-request details, stage transition history and timeline communications are excluded.
Notes/questions may contain personal data: enable only when your organisation permits sharing
these records with the configured AI provider. `store: false` is not a guarantee of zero
provider retention. Source IDs are validated against retrieved records; generated claims still
need human review. Source buttons open the corresponding ticket tab, with the specific excerpt
shown in the panel. Responses include generation/retrieval timestamps and context limits.

Requests have bounded input/output, 8-second per-RPC and 25-second model timeouts. The UI has
stop, retry and independent unavailable states. Process-local safeguards allow 20 requests
per user per hour, one active request per user and four active requests overall. These limits
reset on restart and are not shared across replicas: configure provider project spend limits
and a shared gateway rate limit before running multiple instances. Stopping/closing the UI
aborts the browser request; an already-started model request may continue until its timeout.
No automatic retry incurs additional model usage. Chat is not written to the CRM or browser
storage, and only the last eight chat messages are included in each request.

Verification: run `npm test -- --runInBand` and `npm run build` in backend; run frontend tests
and build separately. For a live smoke test after configuration, open a ticket, summarize it,
check source records, ask a follow-up question, and review an email draft. Disable the backend
flag and verify ticket editing, notes and follow-ups still work while the assistant is unavailable.
