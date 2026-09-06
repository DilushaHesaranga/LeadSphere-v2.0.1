import Ionicons from "@expo/vector-icons/Ionicons";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { PERMISSIONS } from "@/authorization/permissions";
import { EmptyState } from "@/components/EmptyState";
import { FollowUpCard } from "@/components/FollowUpCard";
import { FollowUpEditorModal } from "@/components/FollowUpEditorModal";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import {
  FOLLOW_UP_STATUS_OPTIONS,
  groupFollowUps,
  hasFollowUpCreatorRole,
} from "@/config/followUps";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, radius, spacing } from "@/theme/tokens";
import type { FollowUp, FollowUpStatus } from "@/types/crm";
import type { MainTabParamList } from "@/types/navigation";
import { formatDateTime } from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";

type Props = BottomTabScreenProps<MainTabParamList, "FollowUps">;
type FollowUpView = FollowUpStatus | "ALL";
type EditorState = "create" | FollowUp | null;

export function FollowUpsScreen({ navigation }: Props) {
  const { authorization, can, session } = useAuth();
  const [status, setStatus] = useState<FollowUpView>("ALL");
  const [items, setItems] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [busyId, setBusyId] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const mayCreate = hasFollowUpCreatorRole(authorization.roles) && !cachedAt;
  const mayManage = can(PERMISSIONS.TICKET_NOTES_CREATE) && !cachedAt;

  const load = useCallback(
    async (refresh = false) => {
      const userId = session?.user.id;
      if (!userId) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await loadCachedResource(
          userId,
          `follow-ups:${status}`,
          () => crmService.listFollowUps(status === "ALL" ? null : status),
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
      const result = await crmService.completeFollowUp(item.id);
      setMessage(
        result.nextFollowUpId
          ? "Follow Up completed. The next recurring occurrence was scheduled."
          : "Follow Up completed.",
      );
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setBusyId("");
    }
  };

  const cancel = async (item: FollowUp) => {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await crmService.cancelFollowUp(item.id);
      setMessage("Follow Up cancelled. Its history was preserved.");
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setBusyId("");
    }
  };

  const stopSeries = async (item: FollowUp) => {
    if (busyId || !item.seriesId) return;
    setBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await crmService.stopFollowUpSeries(item.seriesId);
      setMessage("Recurring series stopped. Existing history was preserved.");
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setBusyId("");
    }
  };

  const confirmCancel = (item: FollowUp) => {
    Alert.alert(
      "Cancel Follow Up?",
      `Cancel the Follow Up scheduled for ${formatDateTime(item.scheduledAt)}? Its history will remain available.`,
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Cancel Follow Up",
          style: "destructive",
          onPress: () => void cancel(item),
        },
      ],
    );
  };

  const confirmStop = (item: FollowUp) => {
    Alert.alert(
      "Stop recurring series?",
      "No new occurrences will be created. Existing Follow Up history will remain available.",
      [
        { text: "Keep recurring", style: "cancel" },
        {
          text: "Stop recurrence",
          style: "destructive",
          onPress: () => void stopSeries(item),
        },
      ],
    );
  };

  const openTicket = (item: FollowUp) => {
    navigation.navigate("Work", {
      screen: "TicketDetail",
      params: { ticketId: item.ticketId, companyName: item.companyName },
    });
  };

  const groups = groupFollowUps(items);

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
        <View style={styles.page}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>CUSTOMER ACTION SCHEDULE</Text>
            <Text style={styles.title}>Follow Ups</Text>
            <Text style={styles.description}>
              Upcoming and historical Follow Ups from every Ticket you are
              authorised to access.
            </Text>
            {mayCreate ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setEditor("create")}
                style={({ pressed }) => [
                  styles.createButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons color={colors.white} name="add" size={21} />
                <Text style={styles.createButtonText}>Create Follow Up</Text>
              </Pressable>
            ) : null}
          </View>

          <SegmentedControl
            label="Follow Up status"
            onChange={setStatus}
            options={FOLLOW_UP_STATUS_OPTIONS}
            value={status}
          />
          {cachedAt ? (
            <Notice
              message={`Offline view from ${formatDateTime(cachedAt)}. Follow Up changes require a connection.`}
            />
          ) : null}
          {error ? <Notice tone="error" message={error} /> : null}
          {message ? <Notice tone="success" message={message} /> : null}
          {loading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : null}

          {!loading
            ? groups.map((group) => (
                <View key={group.ticketId} style={styles.group}>
                  <View style={styles.groupHeading}>
                    <View style={styles.groupCopy}>
                      <Text style={styles.groupMeta}>
                        {group.companyName} · Ticket {group.ticketNumber}
                      </Text>
                      <Text style={styles.groupTitle}>{group.ticketTitle}</Text>
                    </View>
                    <Pressable
                      accessibilityLabel={`Open ${group.ticketTitle}`}
                      accessibilityRole="button"
                      onPress={() => {
                        const firstItem = group.items[0];
                        if (firstItem) openTicket(firstItem);
                      }}
                      style={styles.openGroupButton}
                    >
                      <Ionicons
                        color={colors.primary}
                        name="arrow-forward"
                        size={19}
                      />
                    </Pressable>
                  </View>
                  {group.items.map((item, index) => (
                    <View key={item.id} style={styles.sequenceItem}>
                      <Text style={styles.sequenceLabel}>
                        Follow Up {index + 1}
                      </Text>
                      <FollowUpCard
                        busy={busyId === item.id}
                        item={item}
                        onCancel={
                          item.status === "PENDING" && mayManage
                            ? () => confirmCancel(item)
                            : undefined
                        }
                        onComplete={
                          item.status === "PENDING" && mayManage
                            ? () => void complete(item)
                            : undefined
                        }
                        onEdit={
                          item.status === "PENDING" && mayManage
                            ? () => setEditor(item)
                            : undefined
                        }
                        onOpenTicket={() => openTicket(item)}
                        onStopSeries={
                          item.status === "PENDING" &&
                          item.recurring &&
                          item.seriesActive &&
                          mayManage
                            ? () => confirmStop(item)
                            : undefined
                        }
                      />
                    </View>
                  ))}
                </View>
              ))
            : null}

          {!loading && !items.length ? (
            <EmptyState
              title={`No ${status === "ALL" ? "" : `${status.toLowerCase()} `}Follow Ups`}
              message={
                mayCreate
                  ? "Create a Follow Up to keep the next customer action visible."
                  : "Follow Ups will appear here when they are scheduled."
              }
            />
          ) : null}
        </View>
      </Screen>
      {editor ? (
        <FollowUpEditorModal
          followUp={editor !== "create" ? editor : null}
          onClose={() => setEditor(null)}
          onSaved={async (editing) => {
            setEditor(null);
            setMessage(editing ? "Follow Up updated." : "Follow Up created.");
            await load(true);
          }}
          visible
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  createButton: {
    minHeight: 48,
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  createButtonText: { color: colors.white, fontSize: 15, fontWeight: "800" },
  group: { gap: spacing.md },
  groupHeading: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  groupCopy: { flex: 1, gap: spacing.xs },
  groupMeta: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  groupTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  openGroupButton: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  sequenceItem: { gap: spacing.sm },
  sequenceLabel: {
    color: colors.inkMuted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  pressed: { opacity: 0.78 },
});
