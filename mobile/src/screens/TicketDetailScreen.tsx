import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextField } from "@/components/TextField";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, radius, spacing } from "@/theme/tokens";
import type {
  FollowUp,
  FollowUpType,
  RecurrenceFrequency,
  TicketDetail,
} from "@/types/crm";
import type { WorkStackParamList } from "@/types/navigation";
import {
  defaultFollowUpFields,
  formatDateTime,
  localDateTimeToIso,
} from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";
import { createRequestId } from "@/utils/requestId";

type Props = NativeStackScreenProps<WorkStackParamList, "TicketDetail">;

interface TicketWorkspace {
  ticket: TicketDetail;
  followUps: FollowUp[];
}

const TYPE_OPTIONS = [
  { label: "Call", value: "CALL" },
  { label: "Email", value: "EMAIL" },
  { label: "Meeting", value: "MEETING" },
] as const;

const FREQUENCY_OPTIONS = [
  { label: "Daily", value: "DAILY" },
  { label: "3 days", value: "EVERY_3_DAYS" },
  { label: "Weekly", value: "WEEKLY" },
  { label: "Monthly", value: "MONTHLY" },
] as const;

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
  const [showSchedule, setShowSchedule] = useState(false);
  const hasWritePermission = can(PERMISSIONS.TICKET_NOTES_CREATE);

  const load = useCallback(
    async (refresh = false) => {
      const userId = session?.user.id;
      if (!userId) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const result = await loadCachedResource(userId, `ticket:${ticketId}`, async () => {
          const [ticket, followUps] = await Promise.all([
            crmService.getTicket(ticketId),
            crmService.listFollowUps(null, ticketId),
          ]);
          return { ticket, followUps };
        });
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

  const mayWrite =
    hasWritePermission &&
    ticket.assignedUsers.some(
      (assignedUser) => assignedUser.id === authorization.profile?.id,
    );

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>TICKET · {ticket.currentDepartment.toUpperCase()}</Text>
          <Text style={styles.title}>{ticket.projectTitle}</Text>
          <Text style={styles.company}>{ticket.companyName}</Text>
          <View style={styles.stageBadge}>
            <Text style={styles.stageText}>{ticket.stageName}</Text>
            <Text style={styles.stageProbability}>{ticket.stageProbability}%</Text>
          </View>
        </View>
        {cachedAt ? <Notice message={`Offline view from ${formatDateTime(cachedAt)}. Changes are disabled until connected.`} /> : null}
        {error ? <Notice tone="error" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}

        <Section title="Ownership">
          <InfoRow label="Manager" value={ticket.responsibleManagerName} />
          <InfoRow
            label="Assigned"
            value={ticket.assignedUsers.map((user) => user.name).join(", ") || "No active assignment"}
          />
          <InfoRow label="Status" value={ticket.status} />
        </Section>

        <Section title="Contacts">
          {ticket.contacts.map((contact) => (
            <View key={contact.id} style={styles.contact}>
              <Text style={styles.contactName}>{contact.name}</Text>
              <View style={styles.contactActions}>
                {contact.phoneNumber ? (
                  <ContactAction label="Call" onPress={() => void Linking.openURL(`tel:${contact.phoneNumber}`)} />
                ) : null}
                {contact.email ? (
                  <ContactAction label="Email" onPress={() => void Linking.openURL(`mailto:${contact.email}`)} />
                ) : null}
              </View>
            </View>
          ))}
          {!ticket.contacts.length ? <EmptyState title="No contacts" message="No contact details are stored for this Ticket." /> : null}
        </Section>

        <Section title="Follow-ups">
          {mayWrite && !cachedAt ? (
            <Button
              label={showSchedule ? "Close scheduler" : "Schedule follow-up"}
              variant="secondary"
              onPress={() => setShowSchedule((value) => !value)}
            />
          ) : null}
          {showSchedule ? (
            <FollowUpForm
              ticketId={ticketId}
              onSaved={async () => {
                setShowSchedule(false);
                setMessage("Follow-up scheduled and synchronized.");
                await load(true);
              }}
              onError={(nextError) => setError(nextError)}
            />
          ) : null}
          {workspace.followUps.slice(0, 5).map((item) => <FollowUpCard key={item.id} item={item} />)}
          {!workspace.followUps.length ? <EmptyState title="No follow-ups" message="Schedule a call, email, or meeting for this Ticket." /> : null}
        </Section>

        <Section title="Shared notes">
          {mayWrite && ticket.status === "active" && !cachedAt ? (
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
              <Text style={styles.noteMeta}>{item.authorName} · {formatDateTime(item.createdAt)}</Text>
            </View>
          ))}
          {!ticket.notes.length ? <EmptyState title="No notes yet" message="Authorized team members can add shared notes here." /> : null}
        </Section>
      </View>
    </Screen>
  );
}

function FollowUpForm({
  ticketId,
  onSaved,
  onError,
}: {
  ticketId: string;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const requestId = useRef(createRequestId());
  const [schedule, setSchedule] = useState(defaultFollowUpFields);
  const [type, setType] = useState<FollowUpType>("CALL");
  const [purpose, setPurpose] = useState("");
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>("WEEKLY");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    onError("");
    const scheduledAt = localDateTimeToIso(schedule.date, schedule.time);
    if (!scheduledAt) {
      onError("Enter a valid date in YYYY-MM-DD format and time in HH:mm format.");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      onError("Select a future follow-up date and time.");
      return;
    }
    setBusy(true);
    try {
      await crmService.createFollowUp({
        ticketId,
        scheduledAt,
        type,
        purpose,
        recurring,
        frequency: recurring ? frequency : undefined,
        clientRequestId: requestId.current,
      });
      requestId.current = createRequestId();
      await onSaved();
    } catch (error) {
      onError(friendlyRequestError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.scheduler}>
      <Text style={styles.schedulerTitle}>New follow-up</Text>
      <SegmentedControl label="Follow-up type" value={type} options={TYPE_OPTIONS} onChange={setType} />
      <View style={styles.dateRow}>
        <View style={styles.dateField}>
          <TextField label="Date" value={schedule.date} onChangeText={(date) => setSchedule((current) => ({ ...current, date }))} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={styles.timeField}>
          <TextField label="Time" value={schedule.time} onChangeText={(time) => setSchedule((current) => ({ ...current, time }))} placeholder="HH:mm" keyboardType="numbers-and-punctuation" />
        </View>
      </View>
      <TextField label="Purpose (optional)" value={purpose} onChangeText={setPurpose} multiline maxLength={1000} placeholder="What should be achieved?" />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: recurring }} onPress={() => setRecurring((value) => !value)} style={styles.checkboxRow}>
        <View style={[styles.checkbox, recurring && styles.checkboxChecked]} />
        <Text style={styles.checkboxLabel}>Repeat this follow-up</Text>
      </Pressable>
      {recurring ? <SegmentedControl label="Recurrence frequency" value={frequency} options={FREQUENCY_OPTIONS} onChange={setFrequency} /> : null}
      <Button label="Save follow-up" loading={busy} onPress={() => void submit()} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return <View style={styles.infoRow}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View>;
}

function ContactAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={styles.contactButton}><Text style={styles.contactButtonText}>{label}</Text></Pressable>;
}

const styles = StyleSheet.create({
  page: { gap: spacing.xl },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.md },
  muted: { color: colors.inkMuted },
  heading: { gap: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  company: { color: colors.primary, fontSize: 17, fontWeight: "700" },
  stageBadge: { alignSelf: "flex-start", flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.pill },
  stageText: { color: colors.primary, fontWeight: "800" },
  stageProbability: { color: colors.inkMuted, fontWeight: "700" },
  section: { gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  infoRow: { padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: spacing.xs },
  infoLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  infoValue: { color: colors.ink, fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
  contact: { padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: spacing.sm },
  contactName: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  contactActions: { flexDirection: "row", gap: spacing.sm },
  contactButton: { minWidth: 84, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.surfaceMuted },
  contactButtonText: { color: colors.primary, fontWeight: "800" },
  noteForm: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  note: { padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, gap: spacing.sm },
  noteContent: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  noteMeta: { color: colors.inkMuted, fontSize: 11 },
  scheduler: { gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  schedulerTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  dateField: { flex: 1.3 },
  timeField: { flex: 0.7 },
  checkboxRow: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  checkbox: { width: 22, height: 22, borderWidth: 2, borderColor: colors.primary, borderRadius: radius.sm },
  checkboxChecked: { backgroundColor: colors.primary, borderWidth: 5, borderColor: colors.surfaceMuted },
  checkboxLabel: { color: colors.ink, fontWeight: "700" },
});
