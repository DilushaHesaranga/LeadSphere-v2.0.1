import { StyleSheet, Text, View } from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";

interface NoticeProps {
  message: string;
  tone?: "info" | "error" | "success";
}

export function Notice({ message, tone = "info" }: NoticeProps) {
  return (
    <View
      accessibilityRole={tone === "error" ? "alert" : undefined}
      style={[styles.base, styles[tone]]}
    >
      <Text style={[styles.text, tone === "error" && styles.errorText]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  info: { backgroundColor: colors.surfaceMuted, borderColor: colors.border },
  error: {
    backgroundColor: colors.dangerSurface,
    borderColor: "#E9BABA",
  },
  success: {
    backgroundColor: colors.successSurface,
    borderColor: "#B5DFC6",
  },
  text: { color: colors.ink, lineHeight: 20 },
  errorText: { color: colors.danger },
});
