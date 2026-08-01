import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";

import { colors, radius, spacing } from "@/theme/tokens";

interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  passwordToggle?: boolean;
}

export function TextField({
  label,
  error,
  passwordToggle = false,
  secureTextEntry,
  ...props
}: TextFieldProps) {
  const [revealed, setRevealed] = useState(false);
  const hidden = passwordToggle ? !revealed : secureTextEntry;

  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputWrap, error ? styles.inputError : null]}>
        <TextInput
          accessibilityLabel={label}
          accessibilityHint={error}
          placeholderTextColor={colors.disabled}
          secureTextEntry={hidden}
          style={styles.input}
          {...props}
        />
        {passwordToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Hide password" : "Show password"}
            hitSlop={12}
            onPress={() => setRevealed((value) => !value)}
            style={styles.toggle}
          >
            <Text style={styles.toggleText}>{revealed ? "Hide" : "Show"}</Text>
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: spacing.sm },
  label: { color: colors.ink, fontSize: 14, fontWeight: "700" },
  inputWrap: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 16,
  },
  toggle: { padding: spacing.md },
  toggleText: { color: colors.primary, fontWeight: "700" },
  error: { color: colors.danger, fontSize: 13 },
});
