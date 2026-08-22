import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <View accessibilityRole="summary" style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    gap: spacing.sm,
  },
  title: { color: colors.ink, fontSize: 18, fontWeight: "800", textAlign: "center" },
  message: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
});
