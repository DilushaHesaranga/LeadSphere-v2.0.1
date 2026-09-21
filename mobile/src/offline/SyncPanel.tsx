import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import {
  dismissMutation,
  listQueue,
  subscribeOffline,
  syncEngine,
} from "./runtime";
import type { Mutation } from "./types";
import { useAuth } from "@/auth/AuthContext";

export function SyncPanel() {
  const { session, refreshAccess } = useAuth();
  const [items, setItems] = useState<Mutation[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const load = () => {
      void listQueue()
        .then((result) => {
          if (alive) setItems(result);
        })
        .catch(() => {
          if (alive) setError("Saved changes could not be loaded.");
        });
    };
    load();
    const remove = subscribeOffline(load);
    return () => {
      alive = false;
      remove();
    };
  }, [session?.user.id]);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Saved changes</Text>
      <Notice message="Pending changes stay encrypted on this device after sign out. Only your account can synchronize them. Keep the app open after reconnecting. Conflicts preserve your entry; review the server record before entering a corrected change." />
      {error ? <Notice tone="error" message={error} /> : null}
      {items
        .slice(-30)
        .reverse()
        .map((item) => (
          <View
            key={item.id}
            style={{
              padding: 12,
              borderWidth: 1,
              borderColor: "#D9DDE4",
              borderRadius: 8,
              gap: 5,
            }}
          >
            <Text style={{ fontWeight: "700" }}>
              {item.operation.replace(/_crm_|_/g, " ")} · #
              {item.ticketId.slice(0, 8)}
            </Text>
            <Text>
              {
                {
                  pending: "Pending sync",
                  syncing: "Syncing",
                  synced: "Synced",
                  failed: "Sync failed",
                  conflict: "Conflict — review required",
                  dismissed: "Kept as local history",
                }[item.status]
              }
            </Text>
            <Text>
              {String(
                item.payload.p_purpose ||
                  item.payload.p_content ||
                  item.payload.p_stage_slug ||
                  item.payload.p_scheduled_at ||
                  "",
              )}
            </Text>
            {item.payload.p_type ? (
              <Text>
                Type: {String(item.payload.p_type)} · Date:{" "}
                {String(item.payload.p_scheduled_at)}
              </Text>
            ) : null}
            {item.payload.p_frequency ? (
              <Text>Recurrence: {String(item.payload.p_frequency)}</Text>
            ) : null}
            {item.error ? <Text>{item.error}</Text> : null}
            {item.result ? (
              <Text>
                Server record: {String(item.result.id || item.entityId)}
              </Text>
            ) : null}
            {(item.status === "failed" || item.status === "conflict") &&
            !item.retryable ? (
              <Button
                label="Keep as history and unblock ticket"
                variant="secondary"
                onPress={() => {
                  void dismissMutation(item.id);
                }}
              />
            ) : null}
          </View>
        ))}
      {!items.length ? <Text>No saved changes.</Text> : null}
      <Button
        label="Retry synchronization"
        onPress={() => {
          void refreshAccess()
            .then(() => syncEngine.retry())
            .catch(() =>
              setError("Unable to synchronize. Connect and sign in again."),
            );
        }}
      />
    </View>
  );
}
