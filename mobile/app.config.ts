import type { ConfigContext, ExpoConfig } from "expo/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? "development";
const isProduction = appEnvironment === "production";

function resolveGoogleServicesFile(): string {
  const configuredValue = process.env.GOOGLE_SERVICES_JSON;

  if (!configuredValue) {
    return "./firebase/google-services.json";
  }

  if (!configuredValue.trimStart().startsWith("{")) {
    return configuredValue;
  }

  const generatedPath = join(process.cwd(), ".expo", "google-services.json");
  mkdirSync(dirname(generatedPath), { recursive: true });
  writeFileSync(generatedPath, configuredValue, {
    encoding: "utf8",
    mode: 0o600,
  });

  return generatedPath;
}

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
    googleServicesFile: resolveGoogleServicesFile(),
  },
  plugins: [
    [
      "expo-notifications",
      {
        defaultChannel: "default",
        color: "#3B82F6",
      },
    ],
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
