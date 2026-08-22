import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";
import type { FollowUp } from "@/types/crm";
import { formatDateTime, isOverdue } from "@/utils/dateTime";

export function FollowUpCard({
  item,
  busy = false,
  onComplete,
  onCancel,
}: {
  item: FollowUp;
  busy?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}) {
  const overdue = item.status === "PENDING" && isOverdue(item.scheduledAt);
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeBadge, overdue && styles.overdueBadge]}>
          <Text style={[styles.typeText, overdue && styles.overdueText]}>{item.type}</Text>
        </View>
        <Text style={[styles.date, overdue && styles.overdueText]}>{formatDateTime(item.scheduledAt)}</Text>
      </View>
      <Text style={styles.title}>{item.ticketTitle}</Text>
      <Text style={styles.company}>{item.companyName} · #{item.ticketNumber}</Text>
      {item.purpose ? <Text style={styles.purpose}>{item.purpose}</Text> : null}
      {item.recurring ? <Text style={styles.recurring}>Repeats {item.frequency?.toLowerCase().replaceAll("_", " ")}</Text> : null}
      {item.status === "PENDING" && (onComplete || onCancel) ? (
        <View style={styles.actions}>
          {onComplete ? (
            <Pressable disabled={busy} onPress={onComplete} style={styles.completeButton}>
              <Text style={styles.completeText}>{busy ? "Working…" : "Complete"}</Text>
            </Pressable>
          ) : null}
          {onCancel ? (
            <Pressable disabled={busy} onPress={onCancel} style={styles.cancelButton}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  typeBadge: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted },
  overdueBadge: { backgroundColor: colors.dangerSurface },
  typeText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  overdueText: { color: colors.danger },
  date: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  title: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  company: { color: colors.primary, fontSize: 13, fontWeight: "700" },
  purpose: { color: colors.inkMuted, fontSize: 14, lineHeight: 20 },
  recurring: { color: colors.accent, fontSize: 12, fontWeight: "700", textTransform: "capitalize" },
  actions: { flexDirection: "row", gap: spacing.sm, paddingTop: spacing.xs },
  completeButton: { flex: 1, minHeight: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary },
  completeText: { color: colors.white, fontWeight: "800" },
  cancelButton: { minWidth: 88, minHeight: 42, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  cancelText: { color: colors.danger, fontWeight: "800" },
});
