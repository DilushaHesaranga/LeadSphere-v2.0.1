# LeadSphere

LeadSphere is ElDream's CRM foundation. It uses React and Vite for the web application, NestJS for privileged server operations, Supabase Auth and PostgreSQL with Row Level Security for identity and authorization, and Firebase Hosting for the built static web application only.

The repository also contains an Expo/React Native TypeScript mobile application in `mobile/`. Its first release supports the existing Sales Executive authentication and access shell without inventing CRM modules that are still placeholders on the web. Setup, build, security, and Firebase App Distribution instructions are in `docs/MOBILE.md`.

## Architecture

```text
Firebase Hosting -> React/Vite -> Supabase Auth + Supabase PostgreSQL/RLS
                              -> NestJS API -> Supabase service role (server only)
```

Firebase Auth, Firebase databases, Firebase Functions, and Prisma are intentionally not used. The NestJS API must be hosted separately from Firebase Hosting for production because Firebase Hosting serves only `frontend/dist`.

## 1. Configure Supabase

1. Open the Supabase SQL Editor for the project.
2. Run the migrations in filename order:
   - `supabase/migrations/20260731000100_rbac_and_invitations.sql`
   - `supabase/migrations/20260731000200_granular_rbac_scopes.sql`
   - `supabase/migrations/20260802000100_profile_preferences_and_avatars.sql`
   - `supabase/migrations/20260803000100_case_ticket_management.sql`
   - `supabase/migrations/20260803000200_case_ticket_activity_hardening.sql`
   - `supabase/migrations/20260803000300_global_visibility_and_deletion_approval.sql`
   - `supabase/migrations/20260803000400_multi_assignee_ticket_creation.sql`
3. In **Authentication > Providers > Email**, turn off public email sign-up. Administrator invitations continue to be created through the trusted server.
4. In **Authentication > URL Configuration**, set the Site URL to the production Firebase Hosting URL and add these redirect URLs:
   - `http://localhost:5173/accept-invite`
   - `http://localhost:5173/reset-password`
   - `https://YOUR_FIREBASE_DOMAIN/accept-invite`
   - `https://YOUR_FIREBASE_DOMAIN/reset-password`
5. In **Authentication > Email Templates > Invite user**, paste `supabase/templates/invite.html`.

The migrations create profiles, granular scoped permissions, teams, memberships, invitations, trusted authorization functions, the invitation-acceptance RPC, Case/Ticket workflows, and RLS policies. A recipient never selects their own role. The role stored in `public.invitations` by the trusted server is assigned atomically when the recipient accepts. The authorization matrix is in `docs/RBAC.md`; the Case/Ticket data model and department-manager setup are in `docs/CASE_TICKET_MANAGEMENT.md`.

## 2. Create the first System Admin

Create the first user in **Supabase Authentication > Users**, then run this once in the SQL Editor after replacing the email:

```sql
insert into public.user_roles (user_id, role_id, assigned_by, status)
select u.id, r.id, u.id, 'active'
from auth.users u
cross join public.roles r
where lower(u.email) = lower('ADMIN@ELDREAM.COM')
  and r.slug = 'system_admin'
on conflict (user_id, role_id)
do update set status = 'active';
```

`system_admin` is deliberately not assignable in the invitation dropdown. This prevents one administrator from casually creating another full platform administrator through the normal UI.

## 3. Environment files

Copy `frontend/.env.example` to `frontend/.env` and fill in the public browser values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_API_URL=http://localhost:3000
```

Copy `backend/.env.example` to `backend/.env` and fill in the server values:

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_OR_SECRET_KEY
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
INVITATION_EXPIRY_HOURS=24
PORT=3000
```

Never place `SUPABASE_SERVICE_ROLE_KEY` in the frontend, Firebase Hosting configuration, source control, or any variable prefixed with `VITE_`. It bypasses RLS and belongs only in the deployed NestJS API's secret storage.

## 4. Run locally

From `LeadSphere`:

```powershell
npm run dev:backend
```

Open a second terminal in the same folder:

```powershell
npm run dev:frontend
```

The web application runs at `http://localhost:5173`; the API runs at `http://localhost:3000/api`.

## 5. Build, test, and deploy

```powershell
npm test
npm run build:all
npm run firebase:deploy
```

Before the Firebase deployment, set `VITE_API_URL` to the HTTPS URL of the separately deployed NestJS API and set the backend's `FRONTEND_URL` and `CORS_ORIGINS` to the Firebase Hosting origin. Firebase Hosting keeps clean URLs working through its SPA rewrite and applies long-lived caching only to Vite's fingerprinted assets.

## Authorization model

- Supabase Auth determines who the signed-in user is.
- `user_roles`, `roles`, `permissions`, and scoped `role_permissions` determine what the user can do and which records are in scope.
- React hides navigation the user cannot use, but this is only a convenience.
- NestJS checks granular permissions such as `team.members.invite` before using the service-role key.
- PostgreSQL RLS and security-definer functions remain the final enforcement boundary.
- Disabled profiles or memberships lose permission checks immediately.

Assignable roles are Marketing Executive, Sales Executive, Sales Manager, Delivery Manager, and Leadership. System Admin remains protected and non-assignable through the normal invitation flow. Legacy Marketing Manager and Viewer records are retained but disabled for new assignment so existing databases can migrate safely.
