import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { secureSessionStorage } from "@/services/secureSessionStorage";
import { supabase } from "@/services/supabase";
import { createRequestId } from "@/utils/requestId";

const DEVICE_ID_KEY = "mobile-push-device-id";

export type PushRegistrationResult =
  | "registered"
  | "permission-denied"
  | "unsupported";

async function deviceId(): Promise<string> {
  const existing = await secureSessionStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = createRequestId();
  await secureSessionStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

function easProjectId(): string {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) throw new Error("The EAS project ID is not configured.");
  return projectId;
}

export function configureNotificationPresentation(): void {
  Notifications.setNotificationHandler({
    async handleNotification() {
      return {
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      };
    },
  });
}

export async function registerCurrentPushDevice(): Promise<PushRegistrationResult> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    return "unsupported";
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "LeadSphere notifications",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B82F6",
    });
  }

  let permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== "granted") {
    permissions = await Notifications.requestPermissionsAsync();
  }
  if (permissions.status !== "granted") return "permission-denied";

  const token = await Notifications.getExpoPushTokenAsync({
    projectId: easProjectId(),
  });
  const { error } = await supabase.rpc("register_mobile_push_device", {
    p_device_id: await deviceId(),
    p_expo_push_token: token.data,
    p_platform: Platform.OS,
  });
  if (error) throw new Error(error.message || "Push registration failed.");
  return "registered";
}

export async function unregisterCurrentPushDevice(): Promise<void> {
  const storedDeviceId = await secureSessionStorage.getItem(DEVICE_ID_KEY);
  if (!storedDeviceId) return;
  const { error } = await supabase.rpc("unregister_mobile_push_device", {
    p_device_id: storedDeviceId,
  });
  if (error) throw new Error(error.message || "Push unregistration failed.");
}
