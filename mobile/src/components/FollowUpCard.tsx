import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { followUpFrequencyLabel } from "@/config/followUps";
import { colors, radius, spacing } from "@/theme/tokens";
import type { FollowUp } from "@/types/crm";
import { formatDateTime, isOverdue } from "@/utils/dateTime";

type IoniconName = ComponentProps<typeof Ionicons>["name"];

const TYPE_ICONS: Record<FollowUp["type"], IoniconName> = {
  CALL: "call-outline",
  EMAIL: "mail-outline",
  MEETING: "people-outline",
};

const STATUS_LABELS: Record<FollowUp["status"], string> = {
  PENDING: "Pending",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

interface FollowUpCardProps {
  item: FollowUp;
  busy?: boolean;
  onOpenTicket?: () => void;
  onEdit?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onStopSeries?: () => void;
}

export function FollowUpCard({
  item,
  busy = false,
  onOpenTicket,
  onEdit,
  onComplete,
  onCancel,
  onStopSeries,
}: FollowUpCardProps) {
  const overdue = item.status === "PENDING" && isOverdue(item.scheduledAt);
  const pending = item.status === "PENDING";
  const hasActions =
    pending && (onEdit || onComplete || onCancel || onStopSeries);

  return (
    <View style={[styles.card, overdue && styles.overdueCard]}>
      <View style={styles.header}>
        <View style={styles.typeHeading}>
          <View style={[styles.typeIcon, overdue && styles.overdueIcon]}>
            <Ionicons
              color={overdue ? colors.danger : colors.primary}
              name={TYPE_ICONS[item.type]}
              size={18}
            />
          </View>
          <Text style={styles.typeText}>
            {item.type[0] + item.type.slice(1).toLowerCase()}
          </Text>
        </View>
        <View style={styles.badges}>
          <View
            style={[
              styles.statusBadge,
              item.status === "COMPLETED" && styles.completedBadge,
              item.status === "CANCELLED" && styles.cancelledBadge,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                item.status === "COMPLETED" && styles.completedText,
                item.status === "CANCELLED" && styles.cancelledText,
              ]}
            >
              {STATUS_LABELS[item.status]}
            </Text>
          </View>
          {overdue ? (
            <View style={styles.overdueBadge}>
              <Text style={styles.overdueText}>Overdue</Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={styles.body}>
        <Text style={styles.instruction}>
          {pending
            ? "Scheduled customer action"
            : item.status === "COMPLETED"
              ? "Customer action completed"
              : "Customer action cancelled"}
        </Text>
        {item.purpose ? <Text style={styles.purpose}>{item.purpose}</Text> : null}
        <MetaRow
          label={pending ? "Due date" : "Scheduled date"}
          value={formatDateTime(item.scheduledAt)}
        />
        <MetaRow
          label="Schedule"
          value={
            item.recurring
              ? `${followUpFrequencyLabel(item.frequency)}${item.seriesActive ? "" : " · Stopped"}`
              : "One-time"
          }
        />
        <MetaRow label="Created by" value={item.createdByName} />
      </View>

      {onOpenTicket ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={onOpenTicket}
          style={({ pressed }) => [
            styles.ticketButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.ticketButtonText}>View Ticket</Text>
          <Ionicons color={colors.primary} name="arrow-forward" size={17} />
        </Pressable>
      ) : null}

      {hasActions ? (
        <View style={styles.actions}>
          {onEdit ? (
            <ActionButton
              disabled={busy}
              icon="create-outline"
              label="Edit"
              onPress={onEdit}
            />
          ) : null}
          {item.recurring && item.seriesActive && onStopSeries ? (
            <ActionButton
              disabled={busy}
              icon="stop-circle-outline"
              label="Stop series"
              onPress={onStopSeries}
            />
          ) : null}
          {onCancel ? (
            <ActionButton
              danger
              disabled={busy}
              icon="close-circle-outline"
              label="Cancel"
              onPress={onCancel}
            />
          ) : null}
          {onComplete ? (
            <ActionButton
              complete
              disabled={busy}
              icon="checkmark-circle-outline"
              label={busy ? "Working…" : "Complete"}
              onPress={onComplete}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
  danger = false,
  complete = false,
}: {
  label: string;
  icon: IoniconName;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  complete?: boolean;
}) {
  const color = complete
    ? colors.white
    : danger
      ? colors.danger
      : colors.primary;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        complete && styles.completeAction,
        danger && styles.dangerAction,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons color={color} name={icon} size={16} />
      <Text
        style={[
          styles.actionText,
          complete && styles.completeActionText,
          danger && styles.dangerActionText,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
  },
  overdueCard: { borderColor: colors.danger },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  typeHeading: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  typeIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
  },
  overdueIcon: { backgroundColor: colors.dangerSurface },
  typeText: { color: colors.ink, fontSize: 15, fontWeight: "800" },
  badges: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  completedBadge: { backgroundColor: colors.successSurface },
  cancelledBadge: { backgroundColor: colors.dangerSurface },
  statusText: { color: colors.primary, fontSize: 10, fontWeight: "800" },
  completedText: { color: colors.success },
  cancelledText: { color: colors.danger },
  overdueBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.dangerSurface,
  },
  overdueText: { color: colors.danger, fontSize: 10, fontWeight: "800" },
  body: { gap: spacing.sm },
  instruction: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  purpose: { color: colors.ink, fontSize: 15, lineHeight: 21 },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  metaLabel: { color: colors.inkMuted, fontSize: 12 },
  metaValue: {
    flex: 1,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "700",
    textAlign: "right",
  },
  ticketButton: {
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ticketButtonText: { color: colors.primary, fontWeight: "800" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  action: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  dangerAction: { borderColor: colors.danger },
  completeAction: { flexGrow: 1, backgroundColor: colors.primary },
  actionText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  dangerActionText: { color: colors.danger },
  completeActionText: { color: colors.white },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});
