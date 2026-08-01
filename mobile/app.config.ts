import type { ConfigContext, ExpoConfig } from "expo/config";

const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const isProduction = appEnvironment === "production";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: isProduction ? "LeadSphere" : `LeadSphere ${appEnvironment}`,
  slug: "leadsphere-mobile",
  owner: "dilushahesarangas-team",
  scheme: "leadsphere",
  version: "2.0.1",
  orientation: "portrait",
  userInterfaceStyle: "light",
  platforms: ["android", "ios"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: isProduction
      ? "com.eldream.leadsphere"
      : `com.eldream.leadsphere.${appEnvironment}`,
    buildNumber: "1",
  },
  android: {
    package: isProduction
      ? "com.eldream.leadsphere"
      : `com.eldream.leadsphere.${appEnvironment}`,
    versionCode: 1,
  },
  plugins: [
    [
      "expo-secure-store",
      {
        configureAndroidBackup: true,
      },
    ],
  ],
  runtimeVersion: {
    policy: "nativeVersion",
  },
  extra: {
    appEnvironment,
    eas: {
      projectId: "1170b74b-4653-4652-aa88-4115bc909aba",
    },
  },
});
