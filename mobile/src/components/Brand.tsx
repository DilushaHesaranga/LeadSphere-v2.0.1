import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";

export function Brand() {
  return (
    <View style={styles.row} accessibilityLabel="LeadSphere by ElDream">
      <View style={styles.mark}>
        <Text style={styles.markText}>L</Text>
      </View>
      <View>
        <Text style={styles.name}>LeadSphere</Text>
        <Text style={styles.company}>ELDREAM CRM</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  markText: {
    color: colors.white,
    fontSize: 22,
    fontWeight: "800",
  },
  name: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  company: {
    color: colors.inkMuted,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.3,
  },
});
