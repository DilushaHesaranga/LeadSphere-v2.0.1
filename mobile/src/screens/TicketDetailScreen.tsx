import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { PERMISSIONS } from "@/authorization/permissions";
import { Button } from "@/components/Button";
import { EmptyState } from "@/components/EmptyState";
import { FollowUpCard } from "@/components/FollowUpCard";
import { FollowUpEditorModal } from "@/components/FollowUpEditorModal";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextField } from "@/components/TextField";
import {
  canCreateTicketFollowUp,
  FOLLOW_UP_STATUS_OPTIONS,
} from "@/config/followUps";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, radius, spacing } from "@/theme/tokens";
import type {
  FollowUp,
  FollowUpStatus,
  FollowUpTicketOption,
  TicketDetail,
} from "@/types/crm";
import type { WorkStackParamList } from "@/types/navigation";
import { formatDateTime } from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";

type Props = NativeStackScreenProps<WorkStackParamList, "TicketDetail">;
type FollowUpView = FollowUpStatus | "ALL";
type EditorState = "create" | FollowUp | null;

interface TicketWorkspace {
  ticket: TicketDetail;
  followUps: FollowUp[];
}

export function TicketDetailScreen({ route }: Props) {
  const { ticketId } = route.params;
  const { authorization, can, session } = useAuth();
  const [workspace, setWorkspace] = useState<TicketWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [followUpStatus, setFollowUpStatus] =
    useState<FollowUpView>("ALL");
  const [followUpBusyId, setFollowUpBusyId] = useState("");
  const [editor, setEditor] = useState<EditorState>(null);
  const hasWritePermission = can(PERMISSIONS.TICKET_NOTES_CREATE);

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
          `ticket:${ticketId}`,
          async () => {
            const [ticket, followUps] = await Promise.all([
              crmService.getTicket(ticketId),
              crmService.listFollowUps(null, ticketId),
            ]);
            return { ticket, followUps };
          },
        );
        setWorkspace(result.data);
        setCachedAt(result.cachedAt);
      } catch (nextError) {
        setError(friendlyRequestError(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [session?.user.id, ticketId],
  );

  useEffect(() => {
    const loadInitial = async () => {
      await load();
    };
    void loadInitial();
  }, [load]);

  const editorTicket = useMemo<FollowUpTicketOption | null>(() => {
    const ticket = workspace?.ticket;
    if (!ticket) return null;
    return {
      id: ticket.id,
      number: ticket.id.slice(0, 8),
      title: ticket.projectTitle,
      companyName: ticket.companyName,
      department: ticket.currentDepartment,
      stage: ticket.stageName,
    };
  }, [workspace?.ticket]);

  const addNote = async () => {
    const content = note.trim();
    if (!content || noteBusy) return;
    setNoteBusy(true);
    setError("");
    setMessage("");
    try {
      await crmService.addTicketNote(ticketId, content);
      setNote("");
      setMessage("Note added and synchronized.");
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setNoteBusy(false);
    }
  };

  const completeFollowUp = async (item: FollowUp) => {
    if (followUpBusyId) return;
    setFollowUpBusyId(item.id);
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
      setFollowUpBusyId("");
    }
  };

  const cancelFollowUp = async (item: FollowUp) => {
    if (followUpBusyId) return;
    setFollowUpBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await crmService.cancelFollowUp(item.id);
      setMessage("Follow Up cancelled. Its history was preserved.");
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setFollowUpBusyId("");
    }
  };

  const stopSeries = async (item: FollowUp) => {
    if (followUpBusyId || !item.seriesId) return;
    setFollowUpBusyId(item.id);
    setError("");
    setMessage("");
    try {
      await crmService.stopFollowUpSeries(item.seriesId);
      setMessage("Recurring series stopped. Existing history was preserved.");
      await load(true);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setFollowUpBusyId("");
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
          onPress: () => void cancelFollowUp(item),
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

  if (loading && !workspace) {
    return (
      <Screen scroll={false}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.muted}>Loading Ticket…</Text>
        </View>
      </Screen>
    );
  }

  const ticket = workspace?.ticket;
  if (!ticket) {
    return (
      <Screen>
        <Notice tone="error" message={error || "Ticket could not be loaded."} />
      </Screen>
    );
  }

  const mayAddNote =
    hasWritePermission &&
    ticket.assignedUsers.some(
      (assignedUser) => assignedUser.id === authorization.profile?.id,
    );
  const mayCreateFollowUp =
    !cachedAt &&
    canCreateTicketFollowUp(
      authorization.roles,
      ticket,
      authorization.profile?.id,
    );
  const mayManageFollowUps = hasWritePermission && !cachedAt;
  const visibleFollowUps = workspace.followUps.filter(
    (item) => followUpStatus === "ALL" || item.status === followUpStatus,
  );

  return (
    <>
      <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
        <View style={styles.page}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>
              TICKET · {ticket.currentDepartment.toUpperCase()}
            </Text>
            <Text style={styles.title}>{ticket.projectTitle}</Text>
            <Text style={styles.company}>{ticket.companyName}</Text>
            <View style={styles.stageBadge}>
              <Text style={styles.stageText}>{ticket.stageName}</Text>
              <Text style={styles.stageProbability}>
                {ticket.stageProbability}%
              </Text>
            </View>
          </View>
          {cachedAt ? (
            <Notice
              message={`Offline view from ${formatDateTime(cachedAt)}. Changes are disabled until connected.`}
            />
          ) : null}
          {error ? <Notice tone="error" message={error} /> : null}
          {message ? <Notice tone="success" message={message} /> : null}

          <Section title="Ownership">
            <InfoRow label="Manager" value={ticket.responsibleManagerName} />
            <InfoRow
              label="Assigned"
              value={
                ticket.assignedUsers.map((user) => user.name).join(", ") ||
                "No active assignment"
              }
            />
            <InfoRow label="Status" value={ticket.status} />
          </Section>

          <Section title="Contacts">
            {ticket.contacts.map((contact) => (
              <View key={contact.id} style={styles.contact}>
                <Text style={styles.contactName}>{contact.name}</Text>
                <View style={styles.contactActions}>
                  {contact.phoneNumber ? (
                    <ContactAction
                      label="Call"
                      onPress={() =>
                        void Linking.openURL(`tel:${contact.phoneNumber}`)
                      }
                    />
                  ) : null}
                  {contact.email ? (
                    <ContactAction
                      label="Email"
                      onPress={() =>
                        void Linking.openURL(`mailto:${contact.email}`)
                      }
                    />
                  ) : null}
                </View>
              </View>
            ))}
            {!ticket.contacts.length ? (
              <EmptyState
                title="No contacts"
                message="No contact details are stored for this Ticket."
              />
            ) : null}
          </Section>

          <Section title="Follow Ups">
            <Text style={styles.sectionHelp}>
              Scheduled customer actions for this Ticket.
            </Text>
            {mayCreateFollowUp ? (
              <Button
                label="Create Follow Up"
                onPress={() => setEditor("create")}
                variant="secondary"
              />
            ) : null}
            <SegmentedControl
              label="Follow Up status"
              onChange={setFollowUpStatus}
              options={FOLLOW_UP_STATUS_OPTIONS}
              value={followUpStatus}
            />
            {visibleFollowUps.map((item) => (
              <FollowUpCard
                busy={followUpBusyId === item.id}
                item={item}
                key={item.id}
                onCancel={
                  item.status === "PENDING" && mayManageFollowUps
                    ? () => confirmCancel(item)
                    : undefined
                }
                onComplete={
                  item.status === "PENDING" && mayManageFollowUps
                    ? () => void completeFollowUp(item)
                    : undefined
                }
                onEdit={
                  item.status === "PENDING" && mayManageFollowUps
                    ? () => setEditor(item)
                    : undefined
                }
                onStopSeries={
                  item.status === "PENDING" &&
                  item.recurring &&
                  item.seriesActive &&
                  mayManageFollowUps
                    ? () => confirmStop(item)
                    : undefined
                }
              />
            ))}
            {!visibleFollowUps.length ? (
              <EmptyState
                title={`No ${followUpStatus === "ALL" ? "" : `${followUpStatus.toLowerCase()} `}Follow Ups`}
                message={
                  mayCreateFollowUp
                    ? "Create a call, email, or meeting for this Ticket."
                    : "Follow Ups will appear here when they are scheduled."
                }
              />
            ) : null}
          </Section>

          <Section title="Shared notes">
            {mayAddNote && ticket.status === "active" && !cachedAt ? (
              <View style={styles.noteForm}>
                <TextField
                  label="New note"
                  value={note}
                  onChangeText={setNote}
                  placeholder="Record useful customer context or the next action"
                  multiline
                  maxLength={5000}
                />
                <Button
                  label="Add note"
                  loading={noteBusy}
                  disabled={!note.trim()}
                  onPress={() => void addNote()}
                />
              </View>
            ) : null}
            {ticket.notes.map((item) => (
              <View key={item.id} style={styles.note}>
                <Text style={styles.noteContent}>{item.content}</Text>
                <Text style={styles.noteMeta}>
                  {item.authorName} · {formatDateTime(item.createdAt)}
                </Text>
              </View>
            ))}
            {!ticket.notes.length ? (
              <EmptyState
                title="No notes yet"
                message="Authorized team members can add shared notes here."
              />
            ) : null}
          </Section>
        </View>
      </Screen>
      {editor ? (
        <FollowUpEditorModal
          followUp={editor !== "create" ? editor : null}
          initialTicket={editorTicket}
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ContactAction({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.contactButton}
    >
      <Text style={styles.contactButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.xl },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  muted: { color: colors.inkMuted },
  heading: { gap: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  company: { color: colors.primary, fontSize: 17, fontWeight: "700" },
  stageBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
  },
  stageText: { color: colors.primary, fontWeight: "800" },
  stageProbability: { color: colors.inkMuted, fontWeight: "700" },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  sectionHelp: { color: colors.inkMuted, fontSize: 13, lineHeight: 19 },
  infoRow: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  infoLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  infoValue: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  contact: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  contactName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  contactActions: { flexDirection: "row", gap: spacing.sm },
  contactButton: {
    minWidth: 84,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  contactButtonText: { color: colors.primary, fontWeight: "800" },
  noteForm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
  },
  note: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  noteContent: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  noteMeta: { color: colors.inkMuted, fontSize: 11 },
});
