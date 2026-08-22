import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";

import { useAuth } from "@/auth/AuthContext";
import { ticketIdFromNotificationData } from "@/notifications/notificationRouting";
import {
  configureNotificationPresentation,
  registerCurrentPushDevice,
} from "@/services/pushNotifications";

interface PushNotificationManagerProps {
  onOpenTicket(ticketId: string): void;
}

export function PushNotificationManager({
  onOpenTicket,
}: PushNotificationManagerProps) {
  const { session, status } = useAuth();
  const handledResponse = useRef<string | null>(null);

  useEffect(() => {
    configureNotificationPresentation();
  }, []);

  useEffect(() => {
    if (status !== "ready" || !session?.user.id) return;
    void registerCurrentPushDevice().catch((error: unknown) => {
      console.warn(
        "Push notification registration failed.",
        error instanceof Error ? error.message : error,
      );
    });
  }, [session?.user.id, status]);

  useEffect(() => {
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      if (handledResponse.current === identifier) return;
      handledResponse.current = identifier;
      const ticketId = ticketIdFromNotificationData(
        response.notification.request.content.data ?? {},
      );
      if (ticketId) onOpenTicket(ticketId);
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) handleResponse(response);
    });

    return () => subscription.remove();
  }, [onOpenTicket]);

  return null;
}
