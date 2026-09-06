import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextField } from "@/components/TextField";
import {
  FOLLOW_UP_FREQUENCIES,
  FOLLOW_UP_TYPES,
} from "@/config/followUps";
import { crmService } from "@/services/crm";
import { colors, radius, spacing } from "@/theme/tokens";
import type {
  FollowUp,
  FollowUpTicketOption,
  FollowUpType,
  RecurrenceFrequency,
} from "@/types/crm";
import {
  defaultFollowUpFields,
  followUpFieldsFromIso,
  localDateTimeToIso,
} from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";
import { createRequestId } from "@/utils/requestId";

interface FollowUpEditorModalProps {
  visible: boolean;
  initialTicket?: FollowUpTicketOption | null;
  followUp?: FollowUp | null;
  onClose: () => void;
  onSaved: (editing: boolean) => Promise<void> | void;
}

function ticketFromFollowUp(followUp: FollowUp): FollowUpTicketOption {
  return {
    id: followUp.ticketId,
    number: followUp.ticketNumber,
    title: followUp.ticketTitle,
    companyName: followUp.companyName,
    department: "",
    stage: "",
  };
}

export function FollowUpEditorModal({
  visible,
  initialTicket = null,
  followUp = null,
  onClose,
  onSaved,
}: FollowUpEditorModalProps) {
  const editing = Boolean(followUp);
  const requestId = useRef(createRequestId());
  const [selectedTicket, setSelectedTicket] =
    useState<FollowUpTicketOption | null>(() =>
      initialTicket ?? (followUp ? ticketFromFollowUp(followUp) : null),
    );
  const [search, setSearch] = useState("");
  const [tickets, setTickets] = useState<FollowUpTicketOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [schedule, setSchedule] = useState(() =>
    followUp
      ? followUpFieldsFromIso(followUp.scheduledAt)
      : defaultFollowUpFields(),
  );
  const [type, setType] = useState<FollowUpType>(followUp?.type ?? "CALL");
  const [purpose, setPurpose] = useState(followUp?.purpose ?? "");
  const [recurring, setRecurring] = useState(followUp?.recurring ?? false);
  const [frequency, setFrequency] =
    useState<RecurrenceFrequency>(followUp?.frequency ?? "WEEKLY");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || selectedTicket || editing) return;
    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      void crmService
        .searchFollowUpTickets(search)
        .then((result) => {
          if (!active) return;
          setTickets(result);
          setError("");
        })
        .catch((nextError) => {
          if (active) setError(friendlyRequestError(nextError));
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [editing, search, selectedTicket, visible]);

  const submit = async () => {
    if (busy || !selectedTicket) return;
    setError("");
    const scheduledAt = localDateTimeToIso(schedule.date, schedule.time);
    if (!scheduledAt) {
      setError("Enter a valid date in YYYY-MM-DD format and time in HH:mm format.");
      return;
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      setError("Select a future follow-up date and time.");
      return;
    }
    if (purpose.trim().length > 1000) {
      setError("Purpose must be 1000 characters or fewer.");
      return;
    }

    setBusy(true);
    try {
      const input = {
        scheduledAt,
        type,
        purpose,
        recurring,
        frequency: recurring ? frequency : undefined,
      };
      if (followUp) {
        await crmService.updateFollowUp(followUp.id, input);
      } else {
        await crmService.createFollowUp({
          ...input,
          ticketId: selectedTicket.id,
          clientRequestId: requestId.current,
        });
      }
      requestId.current = createRequestId();
      await onSaved(editing);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={busy ? undefined : onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>
              {selectedTicket ? "FOLLOW-UP DETAILS" : "SELECT TICKET"}
            </Text>
            <Text style={styles.title}>
              {editing ? "Edit Follow Up" : "Create Follow Up"}
            </Text>
          </View>
          <Pressable
            accessibilityLabel="Close follow-up editor"
            accessibilityRole="button"
            disabled={busy}
            hitSlop={12}
            onPress={onClose}
            style={styles.closeButton}
          >
            <Ionicons color={colors.ink} name="close" size={25} />
          </Pressable>
        </View>

        {!selectedTicket ? (
          <View style={styles.ticketStep}>
            <TextField
              autoCorrect={false}
              label="Search Tickets"
              onChangeText={setSearch}
              placeholder="Ticket number, title, or company"
              returnKeyType="search"
              value={search}
            />
            {error ? <Notice message={error} tone="error" /> : null}
            {searching ? (
              <ActivityIndicator color={colors.primary} size="large" />
            ) : (
              <ScrollView
                contentContainerStyle={styles.ticketResults}
                keyboardShouldPersistTaps="handled"
              >
                {tickets.map((ticket) => (
                  <Pressable
                    accessibilityRole="button"
                    key={ticket.id}
                    onPress={() => setSelectedTicket(ticket)}
                    style={({ pressed }) => [
                      styles.ticketOption,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.ticketIcon}>
                      <Ionicons
                        color={colors.primary}
                        name="document-text-outline"
                        size={20}
                      />
                    </View>
                    <View style={styles.ticketCopy}>
                      <Text style={styles.ticketTitle}>{ticket.title}</Text>
                      <Text style={styles.ticketMeta}>
                        {ticket.companyName} · Ticket {ticket.number}
                      </Text>
                      {ticket.department || ticket.stage ? (
                        <Text style={styles.ticketMeta}>
                          {[ticket.department, ticket.stage]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      color={colors.inkMuted}
                      name="chevron-forward"
                      size={20}
                    />
                  </Pressable>
                ))}
                {!tickets.length ? (
                  <Text style={styles.emptyText}>
                    No assigned active Tickets match this search.
                  </Text>
                ) : null}
              </ScrollView>
            )}
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.selectedTicket}>
              <Text style={styles.selectedLabel}>SELECTED TICKET</Text>
              <Text style={styles.selectedTitle}>{selectedTicket.title}</Text>
              <Text style={styles.ticketMeta}>
                {selectedTicket.companyName} · Ticket {selectedTicket.number}
              </Text>
              {!editing && !initialTicket ? (
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => setSelectedTicket(null)}
                >
                  <Text style={styles.changeTicket}>Change Ticket</Text>
                </Pressable>
              ) : null}
            </View>
            {error ? <Notice message={error} tone="error" /> : null}
            <SegmentedControl
              label="Follow-up type"
              onChange={setType}
              options={FOLLOW_UP_TYPES}
              value={type}
            />
            <View style={styles.dateRow}>
              <View style={styles.dateField}>
                <TextField
                  keyboardType="numbers-and-punctuation"
                  label="Date"
                  onChangeText={(date) =>
                    setSchedule((current) => ({ ...current, date }))
                  }
                  placeholder="YYYY-MM-DD"
                  value={schedule.date}
                />
              </View>
              <View style={styles.timeField}>
                <TextField
                  keyboardType="numbers-and-punctuation"
                  label="Time"
                  onChangeText={(time) =>
                    setSchedule((current) => ({ ...current, time }))
                  }
                  placeholder="HH:mm"
                  value={schedule.time}
                />
              </View>
            </View>
            <TextField
              label="Purpose (optional)"
              maxLength={1000}
              multiline
              onChangeText={setPurpose}
              placeholder="What should be achieved during this follow-up?"
              value={purpose}
            />
            <Text style={styles.characterCount}>{purpose.length}/1000</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: recurring, disabled: editing }}
              disabled={editing || busy}
              onPress={() => setRecurring((value) => !value)}
              style={styles.checkboxRow}
            >
              <View style={[styles.checkbox, recurring && styles.checkboxChecked]}>
                {recurring ? (
                  <Ionicons color={colors.white} name="checkmark" size={15} />
                ) : null}
              </View>
              <View style={styles.checkboxCopy}>
                <Text style={styles.checkboxLabel}>Recurring Follow Up</Text>
                <Text style={styles.checkboxHelp}>
                  {editing
                    ? "Recurrence cannot be converted after creation."
                    : "The next occurrence is created when this one is completed."}
                </Text>
              </View>
            </Pressable>
            {recurring ? (
              <SegmentedControl
                label="Recurrence frequency"
                onChange={setFrequency}
                options={FOLLOW_UP_FREQUENCIES}
                value={frequency}
              />
            ) : null}
            <Button
              label={editing ? "Save changes" : "Create Follow Up"}
              loading={busy}
              onPress={() => void submit()}
            />
            <Button
              disabled={busy}
              label="Cancel"
              onPress={onClose}
              variant="secondary"
            />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  header: {
    minHeight: 78,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  title: { color: colors.ink, fontSize: 23, fontWeight: "800" },
  closeButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  ticketStep: { flex: 1, padding: spacing.lg, gap: spacing.md },
  ticketResults: { gap: spacing.sm, paddingBottom: spacing.xl },
  ticketOption: {
    minHeight: 82,
    padding: spacing.md,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  ticketIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  ticketCopy: { flex: 1, gap: spacing.xs },
  ticketTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  ticketMeta: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
  emptyText: {
    color: colors.inkMuted,
    paddingVertical: spacing.xl,
    textAlign: "center",
  },
  pressed: { opacity: 0.75 },
  form: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  selectedTicket: {
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    gap: spacing.xs,
  },
  selectedLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  selectedTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  changeTicket: {
    color: colors.primary,
    fontWeight: "800",
    paddingTop: spacing.sm,
  },
  dateRow: { flexDirection: "row", gap: spacing.sm },
  dateField: { flex: 1.35 },
  timeField: { flex: 0.65 },
  characterCount: {
    color: colors.inkMuted,
    fontSize: 11,
    textAlign: "right",
    marginTop: -spacing.sm,
  },
  checkboxRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderWidth: 2,
    borderColor: colors.primary,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { backgroundColor: colors.primary },
  checkboxCopy: { flex: 1, gap: spacing.xs },
  checkboxLabel: { color: colors.ink, fontWeight: "800" },
  checkboxHelp: { color: colors.inkMuted, fontSize: 12, lineHeight: 17 },
});
