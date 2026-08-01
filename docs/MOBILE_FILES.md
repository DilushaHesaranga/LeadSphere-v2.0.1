# LeadSphere Mobile change manifest

## Changed existing files

- `README.md`
- `package.json`
- `backend/src/app.module.ts` (restored the missing final newline required by the existing lint configuration)

## Created documentation

- `docs/MOBILE.md`
- `docs/MOBILE_FILES.md`

## Created mobile configuration

- `mobile/.easignore`
- `mobile/.env.example`
- `mobile/App.tsx`
- `mobile/app.config.ts`
- `mobile/eas.json`
- `mobile/eslint.config.js`
- `mobile/expo-env.d.ts`
- `mobile/index.ts`
- `mobile/package.json`
- `mobile/tsconfig.json`

## Created distribution preparation

- `mobile/distribution/release-notes.txt`
- `mobile/distribution/testers.example.txt`
- `mobile/firebase/GoogleService-Info.plist.example`
- `mobile/firebase/google-services.json.example`

## Created mobile application source

- `mobile/src/auth/AuthContext.tsx`
- `mobile/src/authorization/mobileAccess.test.ts`
- `mobile/src/authorization/mobileAccess.ts`
- `mobile/src/authorization/PermissionGate.tsx`
- `mobile/src/authorization/permissions.ts`
- `mobile/src/authorization/policy.test.ts`
- `mobile/src/authorization/policy.ts`
- `mobile/src/authorization/rbacContract.test.ts`
- `mobile/src/components/Brand.tsx`
- `mobile/src/components/Button.tsx`
- `mobile/src/components/Notice.tsx`
- `mobile/src/components/Screen.tsx`
- `mobile/src/components/StateView.tsx`
- `mobile/src/components/TextField.tsx`
- `mobile/src/config/env.ts`
- `mobile/src/hooks/usePermissions.ts`
- `mobile/src/navigation/navigationModel.test.ts`
- `mobile/src/navigation/navigationModel.ts`
- `mobile/src/navigation/RootNavigator.tsx`
- `mobile/src/screens/ForgotPasswordScreen.tsx`
- `mobile/src/screens/HomeScreen.tsx`
- `mobile/src/screens/LoginScreen.tsx`
- `mobile/src/screens/ProfileScreen.tsx`
- `mobile/src/screens/ResetPasswordScreen.tsx`
- `mobile/src/services/api.ts`
- `mobile/src/services/authLinks.test.ts`
- `mobile/src/services/authLinks.ts`
- `mobile/src/services/secureSessionStorage.ts`
- `mobile/src/services/supabase.ts`
- `mobile/src/theme/tokens.ts`
- `mobile/src/types/authorization.ts`
- `mobile/src/types/navigation.ts`
- `mobile/src/utils/errors.test.ts`
- `mobile/src/utils/errors.ts`
- `mobile/src/validation/auth.test.ts`
- `mobile/src/validation/auth.ts`
