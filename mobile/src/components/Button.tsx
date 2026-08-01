import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
  View,
} from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";

interface ButtonProps extends Omit<PressableProps, "children"> {
  label: string;
  loading?: boolean;
  variant?: "primary" | "secondary" | "danger" | "text";
  icon?: ReactNode;
}

export function Button({
  label,
  loading = false,
  variant = "primary",
  disabled,
  icon,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...props}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.white : colors.primary}
        />
      ) : (
        <View style={styles.content}>
          {icon}
          <Text
            style={[
              styles.label,
              variant === "primary" || variant === "danger"
                ? styles.lightLabel
                : styles.darkLabel,
            ]}
          >
            {label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  danger: { backgroundColor: colors.danger },
  text: { backgroundColor: "transparent" },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.55 },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  label: { fontSize: 16, fontWeight: "700" },
  lightLabel: { color: colors.white },
  darkLabel: { color: colors.primary },
});
