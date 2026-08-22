import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { PERMISSIONS } from "@/authorization/permissions";
import { ProtectedScreen } from "@/authorization/PermissionGate";
import { Brand } from "@/components/Brand";
import { EmptyState } from "@/components/EmptyState";
import { FollowUpCard } from "@/components/FollowUpCard";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, radius, spacing } from "@/theme/tokens";
import type { DashboardData } from "@/types/crm";
import { formatDateTime, isOverdue, isToday } from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";

export function HomeScreen() {
  const { authorization, session } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const firstName = authorization.profile?.display_name?.split(" ")[0];

  const load = useCallback(
    async (refresh = false) => {
      const userId = session?.user.id;
      if (!userId) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await loadCachedResource(userId, "dashboard", () =>
          crmService.dashboard(),
        );
        setData(result.data);
        setCachedAt(result.cachedAt);
      } catch (nextError) {
        setError(friendlyRequestError(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session?.user.id],
  );

  useEffect(() => {
    const loadInitial = async () => {
      await load();
    };
    void loadInitial();
  }, [load]);

  const summary = useMemo(() => {
    const followUps = data?.pendingFollowUps ?? [];
    return {
      today: followUps.filter((item) => isToday(item.scheduledAt)).length,
      overdue: followUps.filter((item) => isOverdue(item.scheduledAt)).length,
      assigned: data?.pipeline.totalCount ?? 0,
      open:
        data?.pipeline.stages
          .filter((stage) => stage.category === "open")
          .reduce((total, stage) => total + stage.totalCount, 0) ?? 0,
    };
  }, [data]);

  return (
    <ProtectedScreen permission={PERMISSIONS.CONSOLE_ACCESS}>
      <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
        <View style={styles.page}>
          <Brand />
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>TODAY&apos;S SALES WORKSPACE</Text>
            <Text style={styles.title}>
              Good to see you{firstName ? `, ${firstName}` : ""}.
            </Text>
            <Text style={styles.description}>
              Your live pipeline, assigned work, and next actions in one place.
            </Text>
          </View>
          {cachedAt ? (
            <Notice
              message={`Offline view from ${formatDateTime(cachedAt)}. Pull down when connected to refresh.`}
            />
          ) : null}
          {error ? <Notice tone="error" message={error} /> : null}
          {loading ? (
            <ActivityIndicator
              accessibilityLabel="Loading dashboard"
              size="large"
              color={colors.primary}
            />
          ) : null}
          {!loading && data ? (
            <>
              <View style={styles.metrics}>
                <Metric label="Today" value={summary.today} tone="accent" />
                <Metric
                  label="Overdue"
                  value={summary.overdue}
                  tone={summary.overdue ? "danger" : "normal"}
                />
                <Metric label="Assigned" value={summary.assigned} tone="normal" />
                <Metric label="Open pipeline" value={summary.open} tone="normal" />
              </View>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Next follow-ups</Text>
                  <Text style={styles.sectionMeta}>
                    {data.pendingFollowUps.length} pending
                  </Text>
                </View>
                {data.pendingFollowUps
                  .slice(0, 3)
                  .map((item) => <FollowUpCard key={item.id} item={item} />)}
                {!data.pendingFollowUps.length ? (
                  <EmptyState
                    title="No pending follow-ups"
                    message="Scheduled calls, emails, and meetings will appear here."
                  />
                ) : null}
              </View>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Recent notifications</Text>
                  <Text style={styles.sectionMeta}>
                    {data.notifications.unreadCount} unread
                  </Text>
                </View>
                {data.notifications.items.slice(0, 4).map((item) => (
                  <View
                    key={item.id}
                    style={[styles.notification, !item.readAt && styles.unread]}
                  >
                    <Text style={styles.notificationTitle}>{item.title}</Text>
                    <Text style={styles.notificationMessage}>{item.message}</Text>
                    <Text style={styles.notificationDate}>
                      {formatDateTime(item.createdAt)}
                    </Text>
                  </View>
                ))}
                {!data.notifications.items.length ? (
                  <EmptyState
                    title="No notifications"
                    message="Important assignment and workflow updates will appear here."
                  />
                ) : null}
              </View>
            </>
          ) : null}
        </View>
      </Screen>
    </ProtectedScreen>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "normal" | "accent" | "danger";
}) {
  return (
    <View
      style={[
        styles.metric,
        tone === "accent" && styles.metricAccent,
        tone === "danger" && styles.metricDanger,
      ]}
    >
      <Text style={[styles.metricValue, tone !== "normal" && styles.metricLight]}>
        {value}
      </Text>
      <Text style={[styles.metricLabel, tone !== "normal" && styles.metricLight]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.xl },
  heading: { gap: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  metric: {
    width: "48%",
    minHeight: 96,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: "center",
    gap: spacing.xs,
  },
  metricAccent: { backgroundColor: colors.primary, borderColor: colors.primary },
  metricDanger: { backgroundColor: colors.danger, borderColor: colors.danger },
  metricValue: { color: colors.ink, fontSize: 28, fontWeight: "900" },
  metricLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  metricLight: { color: colors.white },
  section: { gap: spacing.sm },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  sectionMeta: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  notification: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.xs,
  },
  unread: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  notificationTitle: { color: colors.ink, fontWeight: "800" },
  notificationMessage: { color: colors.inkMuted, lineHeight: 20 },
  notificationDate: { color: colors.disabled, fontSize: 11 },
});
