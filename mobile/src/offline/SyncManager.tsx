import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { useAuth } from "@/auth/AuthContext";
import { setConnectivity, syncEngine } from "./runtime";

export function SyncManager() {
  const { session, refreshAccess } = useAuth();
  const refresh = useRef(refreshAccess);
  useEffect(() => {
    refresh.current = refreshAccess;
  }, [refreshAccess]);
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    const attempt = () => {
      if (!stopped && AppState.currentState === "active")
        void syncEngine.run().catch(() => undefined);
    };
    const subscription = NetInfo.addEventListener((state) => {
      const available =
        state.isConnected !== false && state.isInternetReachable !== false;
      setConnectivity(available);
      if (available) {
        void refresh.current();
        attempt();
      }
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh.current();
        attempt();
      }
    });
    const timer = setInterval(attempt, 15000);
    attempt();
    return () => {
      stopped = true;
      subscription();
      app.remove();
      clearInterval(timer);
    };
  }, [userId]);
  return null;
}
