import {
  NavigationContainer,
  useNavigationContainerRef,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { useCallback, useRef } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { enableScreens } from "react-native-screens";

import { AuthProvider } from "@/auth/AuthContext";
import { RootNavigator } from "@/navigation/RootNavigator";
import { PushNotificationManager } from "@/notifications/PushNotificationManager";
import type { MainTabParamList } from "@/types/navigation";

enableScreens(true);

export default function App() {
  const navigationRef = useNavigationContainerRef<MainTabParamList>();
  const pendingTicketId = useRef<string | null>(null);

  const openPendingTicket = useCallback(() => {
    if (!navigationRef.isReady() || !pendingTicketId.current) return;
    const ticketId = pendingTicketId.current;
    pendingTicketId.current = null;
    navigationRef.navigate("Work", {
      screen: "TicketDetail",
      params: { ticketId },
    });
  }, [navigationRef]);

  const handleNotificationTicket = useCallback(
    (ticketId: string) => {
      pendingTicketId.current = ticketId;
      openPendingTicket();
    },
    [openPendingTicket],
  );

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <PushNotificationManager onOpenTicket={handleNotificationTicket} />
        <NavigationContainer ref={navigationRef} onReady={openPendingTicket}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
