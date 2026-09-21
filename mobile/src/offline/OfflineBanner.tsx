import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { activeOfflineUser, isOffline, subscribeOffline } from "./runtime";

export function OfflineBanner() {
  const [offline, setOffline] = useState(() => Boolean(activeOfflineUser()) && isOffline());
  useEffect(() => subscribeOffline(() => setOffline(Boolean(activeOfflineUser()) && isOffline())), []);
  return offline ? <View accessibilityRole="alert" style={{ backgroundColor: "#FFF4D6", padding: 10 }}>
    <Text style={{ color: "#664B00", textAlign: "center" }}>Offline · Showing cached records. Saved changes wait to sync. Review them in Profile.</Text>
  </View> : null;
}
