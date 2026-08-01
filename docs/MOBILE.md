# LeadSphere Mobile

LeadSphere Mobile is an Expo/React Native TypeScript application for Android and iOS. Version 1 supports the existing Sales Executive authentication and access shell. Firebase Hosting continues to host only the React web application; native builds are APK/AAB and IPA artifacts.

## Verified Sales Executive feature inventory

The repository was inspected before mobile implementation.

| Area                                | Existing web/backend state                                   | Mobile treatment                                                                          |
| ----------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Email/password login                | Implemented with Supabase Auth                               | Implemented with the same Supabase account                                                |
| Password recovery                   | Implemented on web                                           | Implemented with `leadsphere://reset-password` deep link                                  |
| Session restoration/refresh/logout  | Implemented on web                                           | Implemented with encrypted native persistence and AppState refresh control                |
| Trusted profile, roles, permissions | Implemented in PostgreSQL and NestJS `/api/authorization/me` | Implemented; mobile never trusts user metadata                                            |
| Role restriction                    | RBAC implemented                                             | Mobile permits active `sales_executive` accounts only and provides logout for other roles |
| Overview                            | Implemented as an empty operational shell                    | Implemented as Home without fake metrics                                                  |
| Profile/access summary              | Web header displays trusted profile/role                     | Implemented as Profile with logout                                                        |
| Leads                               | Web page is a placeholder; no business table/API             | Not exposed as a mobile feature                                                           |
| Customers/accounts/contacts         | Web page is a placeholder; no business table/API             | Not exposed as a mobile feature                                                           |
| Deals/pipeline                      | Web page is a placeholder; no business table/API             | Not exposed as a mobile feature                                                           |
| Activities/follow-ups/reminders     | Web page is a placeholder; no business table/API             | Not exposed as a mobile feature                                                           |
| Team Management                     | Implemented, but Sales Executives have no permission         | Not exposed                                                                               |

Permission definitions for future Sales Executive features already exist in `20260731000200_granular_rbac_scopes.sql`, but permission definitions alone are not operational CRM features. No separate tables, APIs, or fake data were added by the mobile work.

## Project structure

```text
mobile/
  App.tsx, app.config.ts, eas.json
  src/
    auth/              session and trusted access lifecycle
    authorization/     can, hasRole, getScope, record scope, gates
    components/        reusable native UI
    config/            validated public environment
    hooks/             permission hooks
    navigation/        auth/main navigation and feature inventory
    screens/           Login, Recovery, Reset, Home, Profile
    services/          Supabase, NestJS API, secure storage, deep links
    theme/             LeadSphere design tokens
    types/             API and navigation contracts
    utils/             safe error mapping
    validation/        authentication validation
  firebase/            placeholder Android/iOS registration files
  distribution/        tester and release-note templates
```

## Environment configuration

Copy `mobile/.env.example` to `mobile/.env` and set:

- `EXPO_PUBLIC_SUPABASE_URL` — existing Supabase project URL.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — existing public publishable key.
- `EXPO_PUBLIC_API_URL` — NestJS base URL without `/api`.
- `EXPO_PUBLIC_APP_ENV` — `development`, `testing`, or `production`.
- `EXPO_PUBLIC_AUTH_REDIRECT_URL` — normally `leadsphere://reset-password`.
- `EXPO_PUBLIC_EAS_PROJECT_ID` — added after `eas init`.

Only public values use the `EXPO_PUBLIC_` prefix. Never add the service-role key, PostgreSQL connection string, Firebase service account, passwords, or signing credentials.

For a physical device, `localhost` points at the phone. During development use the computer's LAN address, for example `http://192.168.1.100:3000`, start NestJS, and allow TCP port 3000 through the local firewall. Production configuration rejects localhost and requires HTTPS.

## Supabase setup

1. Use the same project as the web application.
2. Keep Email/Password authentication enabled.
3. In Authentication > URL Configuration, add `leadsphere://reset-password` as an allowed redirect URL.
4. Keep the existing web redirects and invitation URLs. Mobile invitation onboarding is not implemented.
5. Do not add a mobile-only account or role. The existing `profiles`, `user_roles`, `roles`, `role_permissions`, and `teams` records remain authoritative.

## NestJS setup

The existing endpoint `GET /api/authorization/me` is used to load the current profile, roles, teams, and permissions. Every request sends the Supabase bearer token; `AuthGuard` verifies it and authorization is resolved from trusted database records.

Run the backend from the repository root:

```powershell
npm run dev:backend
```

For production, deploy NestJS to a public HTTPS service and set `EXPO_PUBLIC_API_URL` to that origin. Native clients are not protected by browser CORS; authentication and permission guards remain mandatory.

## Local development

```powershell
cd mobile
npm install
npx expo install --fix
npm run start
```

Press `a` for an Android emulator or scan the Expo development QR code from a device on the same network. For a full development client:

```powershell
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile development
```

Use a development or standalone build when testing the custom-scheme password-recovery callback; Expo Go does not represent the final installed app's deep-link registration.

On macOS, press `i` to use the iOS Simulator. Windows cannot run the iOS Simulator or Xcode; use EAS cloud builds or a Mac:

```bash
npx eas-cli@latest build --platform ios --profile development-simulator
```

## Production and preview builds

Confirm the placeholder identifiers in `app.config.ts` before the first signed build:

- Production Android/iOS: `com.eldream.leadsphere`
- Testing Android/iOS: `com.eldream.leadsphere.testing`

Then configure Expo and store public environment values in the corresponding EAS environments:

```powershell
cd mobile
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
npx eas-cli@latest build --platform android --profile production
npx eas-cli@latest build --platform ios --profile production
```

Preview produces an installable Android APK and an internal iOS build. Production uses the store format (Android AAB and iOS archive/IPA). Do not submit builds until developer accounts and explicit release approval are available.

## Firebase App Distribution

Firebase is used only for pre-release binary distribution. It is not used for authentication or application data.

1. In the existing Firebase project, register Android applications for `com.eldream.leadsphere.testing` and, when ready, `com.eldream.leadsphere`.
2. Register iOS applications for the matching bundle identifiers.
3. Record each Firebase App ID from Project Settings. The example files in `mobile/firebase` describe the expected registration shape; real downloaded configuration files are git-ignored and are not required at runtime unless a Firebase SDK is added later.
4. Open App Distribution in Firebase and enable it for each registered app.
5. Add testers or create a tester group such as `eldream-qa`.
6. Build a preview APK/IPA with EAS and download the artifact.
7. Update `mobile/distribution/release-notes.txt` and distribute:

```powershell
firebase login
firebase appdistribution:distribute path\to\LeadSphere.apk --app YOUR_ANDROID_FIREBASE_APP_ID --groups eldream-qa --release-notes-file mobile\distribution\release-notes.txt
firebase appdistribution:distribute path\to\LeadSphere.ipa --app YOUR_IOS_FIREBASE_APP_ID --groups eldream-qa --release-notes-file mobile\distribution\release-notes.txt
```

Testers accept the Firebase invitation and install from the tester experience. iOS devices must be included in the provisioning profile for ad-hoc distribution.

## Verification

```powershell
npm run typecheck --prefix mobile
npm run lint --prefix mobile
npm run test --prefix mobile
npm run validate:config --prefix mobile
npm run export:android --prefix mobile
npm test
npm run build:all
```

## Adding other roles later

1. Implement the role's web/database/backend feature first, including record tables, business validation, permission guard, `DataScopeResolver`, and RLS.
2. Add a native screen that calls the same trusted API; do not duplicate business rules.
3. Add the screen to `IMPLEMENTED_ITEMS` only after the feature exists.
4. Gate navigation and actions by granular permissions, not role string checks.
5. Extend `decideMobileAccess` to support a new role experience and add tests for unsupported and supported roles.
6. Re-run backend authorization tests, mobile record-scope tests, and manual modified-ID tests.
