# Hosting the LeadSphere NestJS API on Vercel

## Deployment model

The backend is a separate Vercel project whose Root Directory is `backend`. Vercel detects the conventional `src/main.ts` NestJS entry point and packages the application as one Node.js Function. Firebase continues to host only the React frontend.

Current production API origin: `https://leadsphere-api.vercel.app`

Current health endpoint: `https://leadsphere-api.vercel.app/api/health`

```text
Firebase Hosting (React)
        |
        | HTTPS + Supabase access token
        v
Vercel Function (NestJS /api/*)
        |
        v
Supabase Auth + PostgreSQL
```

## Create the Vercel project

1. Open Vercel and import `DilushaHesaranga/LeadSphere-v2.0.1`.
2. Choose a backend-specific project name such as `leadsphere-api`.
3. Set **Root Directory** to `backend`.
4. Leave Framework Preset as **NestJS**.
5. Do not override the install, build, or output commands. `backend/package.json` provides `vercel-build`, and Vercel handles the function output.
6. Add the environment variables below before the first production deployment.

## Environment variables

Set these in Vercel for Production and Preview. Development values can remain in the ignored local `backend/.env` file.

| Variable | Production value/purpose |
| --- | --- |
| `SUPABASE_URL` | The LeadSphere Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable browser key, used to validate caller access tokens |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only secret/service-role key; never expose it to React or use a `VITE_` prefix |
| `FRONTEND_URL` | Canonical Firebase origin, normally `https://leadsphere-v2-0-1.web.app` |
| `CORS_ORIGINS` | Comma-separated allowed origins; include the canonical Firebase origin and any approved custom frontend domain |
| `INVITATION_EXPIRY_HOURS` | `24` unless ElDream chooses another policy |

Do not set `PORT` in Vercel. Vercel supplies the runtime port and manages the NestJS server lifecycle.

The application rejects a production cold start when required variables are absent, when Supabase or frontend URLs do not use HTTPS, or when the publishable key is incorrectly reused as the service-role key.

## Frontend connection

After Vercel assigns the backend domain, update the production frontend build variable:

```env
VITE_API_URL=https://YOUR-LEADSPHERE-API.vercel.app
```

Do not append `/api`; `frontend/src/utils/api.js` already appends it.

Rebuild and deploy Firebase Hosting after changing `VITE_API_URL`:

```powershell
npm run firebase:deploy
```

If a custom Vercel domain is added later, update `VITE_API_URL` and redeploy Firebase. If the Firebase frontend receives a custom domain, add that exact origin to `CORS_ORIGINS` and update `FRONTEND_URL` when it becomes canonical.

## Verification

Check the dependency-free health endpoint:

```text
https://YOUR-LEADSPHERE-API.vercel.app/api/health
```

Expected response:

```json
{"status":"ok","service":"leadsphere-api"}
```

Then sign into the Firebase application and verify Team Management can load roles and members. A `401` without a bearer token on protected endpoints is expected; a browser CORS error indicates the frontend origin is missing from `CORS_ORIGINS`.

## Operational notes

- The API is stateless and safe for serverless horizontal scaling.
- Supabase remains the durable state and authorization boundary.
- Do not store files or runtime state in the function filesystem. Vercel Functions provide only ephemeral writable scratch space.
- Cold starts are possible after periods without traffic; the health route helps separate boot failures from authenticated Supabase failures.
- Change Vercel secrets through Project Settings and redeploy. Never commit `.env` or `.vercel` data.
