import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { FollowUpCard } from "@/components/FollowUpCard";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, spacing } from "@/theme/tokens";
import type { FollowUp, FollowUpStatus } from "@/types/crm";
import { formatDateTime } from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";

const STATUS_OPTIONS = [
  { label: "Pending", value: "PENDING" },
  { label: "Completed", value: "COMPLETED" },
] as const;

export function FollowUpsScreen() {
  const { session } = useAuth();
  const [status, setStatus] = useState<Extract<FollowUpStatus, "PENDING" | "COMPLETED">>("PENDING");
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      const userId = session?.user.id;
      if (!userId) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await loadCachedResource(userId, `follow-ups:${status}`, () =>
          crmService.listAssignedFollowUps(status),
        );
        setItems(result.data);
        setCachedAt(result.cachedAt);
      } catch (nextError) {
        setError(friendlyRequestError(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session?.user.id, status],
  );

  useEffect(() => {
    const loadInitial = async () => {
      await load();
    };
    void loadInitial();
  }, [load]);

  const complete = async (item: FollowUp) => {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await crmService.completeFollowUp(item.id);
      setMessage("Follow-up completed and synchronized.");
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setBusyId("");
    }
  };

  const confirmCancel = (item: FollowUp) => {
    Alert.alert(
      "Cancel this follow-up?",
      "It will remain in the Ticket history, but no longer appear as pending.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel follow-up",
          style: "destructive",
          onPress: () => {
            setBusyId(item.id);
            setError("");
            void crmService
              .cancelFollowUp(item.id)
              .then(async () => {
                setMessage("Follow-up cancelled and synchronized.");
                await load(true);
              })
              .catch((nextError) => setError(friendlyRequestError(nextError)))
              .finally(() => setBusyId(""));
          },
        },
      ],
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>NEXT ACTIONS</Text>
          <Text style={styles.title}>Follow-ups</Text>
          <Text style={styles.description}>
            Calls, emails, and meetings for Tickets currently assigned to you.
          </Text>
        </View>
        <SegmentedControl label="Follow-up status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        {cachedAt ? <Notice message={`Offline view from ${formatDateTime(cachedAt)}. Completion actions require a connection.`} /> : null}
        {error ? <Notice tone="error" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {!loading
          ? items.map((item) => (
              <FollowUpCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onComplete={status === "PENDING" && !cachedAt ? () => void complete(item) : undefined}
                onCancel={status === "PENDING" && !cachedAt ? () => confirmCancel(item) : undefined}
              />
            ))
          : null}
        {!loading && !items.length ? (
          <EmptyState
            title={`No ${status.toLowerCase()} follow-ups`}
            message={status === "PENDING" ? "Schedule the next action from an assigned Ticket." : "Completed follow-ups will appear here."}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
});
