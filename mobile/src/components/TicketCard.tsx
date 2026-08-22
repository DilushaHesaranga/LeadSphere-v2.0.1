import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";
import type { TicketSummary } from "@/types/crm";

export function TicketCard({ ticket, companyName, onPress }: {
  ticket: TicketSummary;
  companyName: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${ticket.projectTitle} for ${companyName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.title}>{ticket.projectTitle}</Text>
        <View style={styles.badge}><Text style={styles.badgeText}>{ticket.stageName}</Text></View>
      </View>
      <Text numberOfLines={1} style={styles.company}>{companyName}</Text>
      <View style={styles.meta}>
        <Text style={styles.metaText}>{ticket.currentDepartment}</Text>
        <Text style={styles.separator}>•</Text>
        <Text numberOfLines={1} style={styles.metaText}>{ticket.responsibleManagerName}</Text>
      </View>
      <Text numberOfLines={1} style={styles.assigned}>
        Assigned: {ticket.assignedUsers.map((user) => user.name).join(", ") || "No active assignment"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 130,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.995 }] },
  header: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1, color: colors.ink, fontSize: 17, fontWeight: "800" },
  company: { color: colors.primary, fontSize: 15, fontWeight: "700" },
  badge: {
    maxWidth: "48%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  badgeText: { color: colors.primary, fontSize: 11, fontWeight: "800" },
  meta: { flexDirection: "row", alignItems: "center" },
  metaText: { color: colors.inkMuted, fontSize: 13, textTransform: "capitalize", maxWidth: "45%" },
  separator: { color: colors.disabled, paddingHorizontal: spacing.sm },
  assigned: { color: colors.inkMuted, fontSize: 12 },
});
