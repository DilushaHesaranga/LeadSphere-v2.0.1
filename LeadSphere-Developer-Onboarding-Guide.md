# LeadSphere Developer Onboarding Guide

This guide is for onboarding a new developer to the LeadSphere project on Windows. It separates the actions required from the current administrator and the new developer.

## A. Current Administrator Checklist

### 1. Grant the required access

- **GitHub:** Add the developer to `DilushaHesaranga/LeadSphere-v2.0.1` with **Write** access.
- **Supabase:** Invite the developer to the LeadSphere Supabase project. Use project-scoped **Developer** access where available.
- **Firebase:** Grant only the permissions needed for the developer's work. For preview hosting deployments, use **Firebase Hosting Admin**. Add App Distribution access only if the developer will manage tester builds.
- **Vercel:** Add the developer to the `leadsphere-api` project with **Developer** access.
- **Expo/EAS:** Add the developer to the `dilushahesarangas-team` organization with **Developer** access.
- **Codex/ChatGPT:** Add the developer as a normal workspace member if organizational access is required.

> **Security warning:** Do not share the current Codex task with the new developer because its history may contain credentials or other sensitive setup information. Create a new sanitized onboarding task or share this guide instead.

### 2. Prepare development environment values

Provide the developer with the approved development values through a secure password manager or secret-sharing tool. Do not send secrets through email, chat, Git commits, screenshots, or shared Codex tasks.

Required frontend values:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_API_URL
```

Required backend values:

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
FRONTEND_URL
CORS_ORIGINS
INVITATION_EXPIRY_HOURS
PORT
```

Required mobile values:

```text
EXPO_PUBLIC_APP_ENV
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_AUTH_REDIRECT_URL
```

Build-only value:

```text
GOOGLE_SERVICES_JSON
```

The Supabase publishable keys and all `EXPO_PUBLIC_*`/`VITE_*` values are exposed to the client by design. They are not substitutes for backend authorization or Row-Level Security. The Supabase service-role key is highly sensitive and must only be used by the backend.

### 3. Confirm project information

- GitHub repository: `https://github.com/DilushaHesaranga/LeadSphere-v2.0.1.git`
- Main branch: `main`
- Firebase project: `leadsphere-v2-0-1`
- Vercel backend project: `leadsphere-api`
- Production API: `https://leadsphere-api.vercel.app`
- Expo organization: `dilushahesarangas-team`
- Expo project: `leadsphere-mobile`
- Supabase project reference: provide the approved development project reference securely.

### 4. Confirm approved deployment boundaries

- Tell the developer whether they may deploy to shared development, preview, or production environments.
- Require approval before database migrations are pushed to a remote Supabase project.
- Require approval before Firebase production hosting deployment.
- Require approval before Vercel production deployment.
- Require approval before starting paid EAS builds.

## B. New Developer Checklist

### 1. Install the required software

Install the following software:

- Git for Windows
- Node.js 24.x
- Visual Studio Code
- A modern web browser

Optional software:

- Android Studio, only when using a local Android emulator
- Docker Desktop, only for Supabase local development or workflows that explicitly require Docker

Java, Flutter, and Xcode are not required for the standard remote EAS build workflow. An iOS device or macOS environment may still be required for some Apple-specific testing tasks.

### 2. Verify the software in Windows Command Prompt

Open **Command Prompt** and run:

```bat
git --version
node --version
npm --version
```

Node should report version 24.x. If multiple Node versions are needed, install nvm-windows and select Node 24 before continuing.

Configure your Git identity:

```bat
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
```

### 3. Clone the repository

Choose a local development folder, then run:

```bat
git clone https://github.com/DilushaHesaranga/LeadSphere-v2.0.1.git
cd LeadSphere-v2.0.1
git switch main
git pull --ff-only origin main
```

### 4. Install project dependencies

Run these commands from the repository root:

```bat
npm ci
cd frontend
npm ci
cd ..\backend
npm ci
cd ..\mobile
npm ci
cd ..
```

Use `npm ci` for a clean installation based on the committed lockfiles. Do not run `npm audit fix --force` without review because it may introduce breaking dependency changes.

### 5. Sign in to development services

From the repository root, run only the tools needed for your assigned work:

```bat
npx firebase-tools login
npx supabase@latest login
npx vercel@latest login
cd mobile
npx eas-cli@latest login
cd ..
```

Sign in using your own account. Do not use another developer's login credentials.

### 6. Configure Supabase safely

Link the local repository to the approved Supabase development project:

```bat
npx supabase@latest link --project-ref YOUR_APPROVED_PROJECT_REF
```

Check pending migrations without modifying the remote database:

```bat
npx supabase@latest db push --linked --dry-run
```

> Do not run a real remote database push until the project administrator has reviewed and approved the migrations and target project.

### 7. Configure Firebase safely

The repository currently identifies `leadsphere-v2-0-1` as its default Firebase project. Confirm with the administrator whether this is development or production before deploying.

List accessible projects:

```bat
npx firebase-tools projects:list
```

Use an explicit approved project for local preview work:

```bat
npx firebase-tools use YOUR_APPROVED_FIREBASE_PROJECT
```

Do not deploy to production without approval.

### 8. Configure Vercel

The NestJS backend is hosted as the `leadsphere-api` Vercel project. The Vercel project root must be `backend`.

```bat
cd backend
npx vercel@latest link
npx vercel@latest pull --environment=development
cd ..
```

Select the existing `leadsphere-api` project. Do not create a duplicate project.

### 9. Confirm Expo/EAS configuration

The mobile app is already connected to the existing Expo project. Do not run `eas init` again.

```bat
cd mobile
npx eas-cli@latest whoami
npx eas-cli@latest project:info
cd ..
```

Confirm that the project belongs to `dilushahesarangas-team` and is named `leadsphere-mobile`.

### 10. Create local environment files

Copy each example file before entering the secure values supplied by the administrator:

```bat
copy frontend\.env.example frontend\.env
copy backend\.env.example backend\.env
copy mobile\.env.example mobile\.env
```

If an example file is unavailable, ask the administrator for the approved template. Never copy production secrets from another developer's computer.

Environment files are intentionally ignored by Git. Before committing, verify that no `.env` file, service-role key, password, access token, or Firebase service credential is staged.

### 11. Run LeadSphere locally

Use three Command Prompt windows.

Backend, from the repository root:

```bat
npm run dev:backend
```

Frontend, from the repository root:

```bat
npm run dev:frontend
```

Mobile, from the repository root:

```bat
npm run dev:mobile
```

The frontend normally opens through the local Vite address. The mobile app starts through Expo. Keep the NestJS backend running while testing features that use its API.

### 12. Run verification checks

From the repository root:

```bat
npm test
npm run build
```

Run the complete cross-project checks when required:

```bat
npm run test:all
npm run build:all
npm run mobile:check
```

The expected result is that tests, type checking, linting, web/backend builds, and mobile validation finish without new errors.

### 13. Verify the application manually

- Sign in with a development test user supplied by the administrator.
- Confirm that the correct role and permissions load.
- Open Overview, Cases, Leads, Customers, Follow Ups, Pipeline, Timeline, Reports and Insights, and Permissions where the role allows access.
- Confirm that tickets and assignments load correctly.
- Create and update only test records in the approved development environment.
- Verify that follow-up creation respects ticket assignment and role permissions.
- Confirm that notifications appear only for the appropriate users.
- Check the frontend in both light and dark mode.
- Test the mobile app on a physical Android device or emulator when mobile changes are included.

### 14. Use the normal Git workflow

Create a branch for each task:

```bat
git switch main
git pull --ff-only origin main
git switch -c feature/short-description
```

Before committing:

```bat
git status
git diff --check
```

Commit and push the branch:

```bat
git add PATHS_YOU_CHANGED
git commit -m "Describe the change"
git push -u origin feature/short-description
```

Open a pull request and request review. Do not commit directly to `main` unless the team has explicitly approved that workflow.

### 15. Deploy previews only when authorized

Firebase Hosting preview:

```bat
npm run build
npx firebase-tools hosting:channel:deploy YOUR_PREVIEW_CHANNEL --project YOUR_APPROVED_FIREBASE_PROJECT
```

Vercel backend preview:

```bat
cd backend
npx vercel@latest
cd ..
```

EAS Android preview build:

```bat
cd mobile
npx eas-cli@latest build --platform android --profile preview
cd ..
```

Preview deployments may use shared cloud resources or consume build allowances. Get administrator approval before running them.

## Information the Administrator Must Still Confirm

- The correct Supabase development project reference.
- Whether the checked-in Firebase default is safe for development or is production-only.
- The approved development URLs for the frontend and backend.
- The approved local values for `FRONTEND_URL`, `CORS_ORIGINS`, and redirect URLs.
- The test accounts and roles the developer may use.
- Whether the developer may run remote migrations.
- Whether the developer may create Firebase, Vercel, or EAS preview deployments.
- The team's branch naming, pull-request review, and release approval rules.
- Which CLI versions are approved where the repository does not pin a version.

