# Deploy the AI Assistant with Supabase (no Vercel update needed)

The web frontend calls `supabase.functions.invoke('ai-assistant')` using the current
user session. Existing CRM traffic continues using its previous services. The original
NestJS assistant implementation is retained as an alternative, but the frontend no
longer calls its endpoints. Do not put an AI key in any VITE variable.

## Supabase secrets

Open your project's **Edge Functions → Secrets** and add:

- `OPENAI_API_KEY`: your OpenAI API key (enter only in Supabase).
- `AI_ASSISTANT_ENABLED`: `true` (set `false` to disable responses).
- `OPENAI_MODEL`: `gpt-4.1-mini`, or another Responses/structured-output compatible model.
- `AI_ALLOWED_ORIGINS`: comma-separated frontend origins, with no trailing paths.
  For this project: `https://leadsphere-v2-0-1.web.app,https://leadsphere-v2-0-1.firebaseapp.com,http://localhost:5173`.

Supabase supplies `SUPABASE_URL` and `SUPABASE_ANON_KEY`. If the legacy anon key is
unavailable, use `AI_SUPABASE_PUBLISHABLE_KEY` or the platform-provided
`SUPABASE_PUBLISHABLE_KEYS.default`. No service-role key is used by the assistant.

## Deploy from the project root

```powershell
npx supabase login
npx supabase link --project-ref tgusgekiyadxjhbttski
npx supabase db push --dry-run
```

Review the dry run with the team. If other unrelated migrations are pending, do not
apply them just to enable AI. Apply only the new usage-limit SQL:

```powershell
npx supabase db query --linked --file supabase/migrations/20260913000100_ai_assistant_usage.sql
npx supabase migration repair 20260913000100 --status applied --linked
npx supabase functions deploy ai-assistant --project-ref tgusgekiyadxjhbttski --use-api
npm run firebase:deploy
```

The SQL can also be run in the Supabase SQL Editor; record its applied version in
migration history afterwards. The migration adds only an AI usage table and two RPCs;
it does not change CRM records. Function deployment uses the API and requires no Docker.
The final command builds and deploys the frontend to Firebase Hosting. VITE_API_URL
stays as it is for your teammate's existing backend. VITE_AI_ASSISTANT_ENABLED=false
can hide the assistant button entirely on the next frontend build.

## Authentication and limits

`verify_jwt=false` in supabase/config.toml disables only the platform's legacy JWT
check. The function itself requires and verifies the user's token against Supabase Auth
on **every** request, including status. The same token is used for all database RPCs,
which enforce ticket access. An unauthenticated request receives 401. The OpenAI key
is read only from server-side secrets. CORS permits only configured browser origins.

Quota is shared across Edge instances: at most 20 requests per user per
one-hour window, with one active request and an expiring 50-second lease. A completed
or failed model call releases its lease; failed attempts still count toward the limit.
RLS blocks direct access to the quota table. The claim RPC checks ticket access and
uses an atomic upsert. The release RPC affects only the caller's matching lease.
Provider project spending limits should also be set for an overall spending cap.

Context remains bounded and read-only: ticket overview, recent notes, recent non-stage
activity, and follow-ups. Contacts, request metadata and attachments are excluded.
Notes and questions can contain personal data; enabling AI allows this selected content
to be sent to OpenAI. Responses use store=false, which does not imply zero provider
retention. The UI shows source excerpts, timestamps and limitations. No chat is saved
in the CRM. Closing the panel clears its chat. No emails or CRM updates are performed
automatically. Browser Stop aborts the browser request, but a provider request already
running may finish or time out before the lease is released.

## Verification

```powershell
node --test supabase/tests/ai-assistant.test.mjs
node --test frontend/test/assistant-transport.test.js
npm run build
```

After deployment and secret setup: sign into LeadSphere, open a ticket, click AI
Assistant, summarize, ask a question, inspect a source, and review an email draft.
Test another user's permissions and disable AI_ASSISTANT_ENABLED to confirm normal
CRM work continues. Missing/disabled AI or provider failures affect only the assistant.

References: [Supabase deployment](https://supabase.com/docs/guides/functions/deploy),
[user-scoped authentication](https://supabase.com/docs/guides/functions/auth-legacy-jwt),
[secrets](https://supabase.com/docs/guides/functions/secrets).
