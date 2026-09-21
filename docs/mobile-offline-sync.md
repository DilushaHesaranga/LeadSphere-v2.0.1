# Mobile offline data entry — LeadSphere 2.1.0 (build 2)

## Android delivery

EAS internal preview build `e603931b-2583-46b9-8dbc-7d3d8e816c59` completed successfully; version 2.1.0, Android versionCode 2, application ID `com.eldream.leadsphere.testing`.

[Expo build/download page](https://expo.dev/accounts/dilushahesarangas-team/projects/leadsphere-mobile/builds/e603931b-2583-46b9-8dbc-7d3d8e816c59)

The build used the working-tree changes (the displayed Git commit is the unchanged base commit). No Git commit, GitHub push, public store submission, or OTA update was made.

EAS Expo Doctor passed 20/21 checks: the remaining check reports 11 existing Expo/React Native packages behind recommended patch versions. Native compilation completed despite this warning. Dependency installation also reported audit findings (mobile: 13 moderate and 8 high; root: 12 moderate and 3 high); no broad/forced dependency upgrade was applied as part of this feature.

## Scope and architecture

The existing Expo/React Native mobile app uses Supabase authentication, a NestJS authorization endpoint, and existing Supabase CRM RPCs. No separate application or alternate authorization system was added.

SQLCipher-backed Expo SQLite stores a per-account/project cache and durable mutation outbox. Its random encryption key is stored in Expo SecureStore. Plaintext passwords are never saved. Native storage fails closed if SQLCipher is unavailable, so Expo Go is not supported for this feature: install the new native preview build.

The application is currently single-company; there is no organisation ID in its schema. Isolation therefore uses the Supabase project URL plus authenticated user ID, rather than inventing an organisation field.

## Supported offline actions

- Add ticket notes.
- Create one-off or recurring follow-ups.
- Edit follow-ups and recurrence frequency.
- Complete or cancel a follow-up occurrence.
- Stop a recurring follow-up series.
- Move a ticket through permitted pipeline stages.

Previously loaded screens and records can be read offline. Tickets must have been loaded online before editing offline. Cached pipeline cards also support stage moves. Phone/email links remain device actions rather than queued CRM changes.

## Synchronization and security

- An unexpired, previously verified session and cached mobile permissions are required for offline access.
- Mutations are saved before the UI reports success; they appear as pending until the server acknowledges them.
- Reconnection, app start/resume and the Profile retry button trigger synchronization while the application is active. The server response—not NetInfo alone—confirms success.
- Operations are ordered per ticket. A failed/conflicting operation blocks later operations for that ticket, but not unrelated tickets.
- Automatic retries are bounded to five attempts with exponential backoff and jitter. Permission and version errors require review rather than repeated submission.
- The authenticated server RPC derives identity from auth.uid(), checks active-account status and calls the existing authorization-protected CRM functions.
- Transactional receipts, a user/mutation primary key and advisory transaction locks prevent repeated side effects after timeouts or replay. Follow-up and series row locks plus expected timestamps protect mutable data. Pipeline changes reuse the existing version check.
- Conflicts retain the local proposal and leave server data unchanged. Profile displays the proposal/error; review the current server record, keep the failed entry as history to unblock the ticket, then submit a corrected change. There is no silent last-write-wins merge.
- Signing out removes active authorization and cached reads but retains encrypted pending work. Another account cannot view or send that work. The original account must sign in online before sending it again. An already-dispatched request may finish under its original token; no subsequent request is sent anonymously.

## Database and files

Migration: `supabase/migrations/20260920000200_mobile_offline_sync.sql`.
It adds the private `crm_mobile_mutations` receipt table and `sync_crm_mobile_mutation` RPC. Existing business rules and RLS are retained. The migration was deployed transactionally through the authenticated Supabase SQL editor, including its migration-history entry, after direct CLI database connectivity failed. Verified: receipt RLS enabled, authenticated direct table reads denied, authenticated RPC enabled, anonymous RPC denied.

Core implementation: `mobile/src/offline/` (database, runtime, engine, synchronization manager, status UI and tests).
Integration: mobile AuthContext, CRM/API services, App, FollowUpCard, FollowUps/TicketDetail/Pipeline/Profile screens, CRM types and native app configuration.
Dependencies: expo-sqlite, expo-crypto, @react-native-community/netinfo; PGlite is a root development dependency for database tests.

## Automated verification

From `mobile/`:

```text
npm run typecheck
npm run lint
npm test -- --no-cache
npm run export:android
npm run export:ios
```

From the repository root, after `npm install`:

```text
npm run test:mobile-offline-db
```

Results: mobile 17 suites / 71 tests passed; PostgreSQL integration 7 tests passed; TypeScript, ESLint, Android and iOS JavaScript exports passed. Integration tests run real PostgreSQL via PGlite with the actual mutation wrapper and relevant business functions, but simplified fixture authorization helpers. They are not a substitute for real-device end-to-end QA.

Coverage includes cached-session validation, pending creation, queue restart recovery, replay/duplicate prevention, retry limits, permission rejection, timestamp conflicts, account isolation, logout stopping dispatch, recurrence replay, and receipt-table access restrictions.

## Limitations and required physical-device QA

- Synchronization is foreground/resume driven, not guaranteed while the OS has terminated the app.
- An expired session requires internet authentication; offline access is not extended by storing passwords.
- Existing server rules reject a newly queued follow-up if its scheduled date is already past at synchronization time. The rejected entry remains available for correction; its date is never silently changed.
- Only cached records/search results are available without a network connection.
- Synced receipts/history are retained for idempotency/audit; no automatic retention cleanup is introduced.
- Uninstalling the app or clearing device storage removes pending device data.
- SQLCipher encryption, process-kill recovery, airplane-mode UI, and reconnection on actual Android/iOS devices still require manual verification. Automated persistence tests use a persistent test store, not a native device filesystem.
- iOS internal distribution is blocked by missing Apple signing/provisioning credentials and encryption-compliance configuration. No IPA has been produced.

Physical-device acceptance: sign in and open a ticket; enable airplane mode; add a note and future follow-up; force-close/reopen; confirm both remain pending; reconnect and verify exactly one of each in the web app. Repeat with logout/other-account/original-account, permission removal, and a concurrent web edit to verify isolation and conflicts.
