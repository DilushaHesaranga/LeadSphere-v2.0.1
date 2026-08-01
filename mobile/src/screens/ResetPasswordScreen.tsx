import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, spacing } from "@/theme/tokens";
import { friendlyRequestError } from "@/utils/errors";
import { firstValidationError, passwordSchema } from "@/validation/auth";

export function ResetPasswordScreen() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    const parsed = passwordSchema.safeParse({ password, confirmation });
    if (!parsed.success) {
      setError(firstValidationError(parsed.error));
      return;
    }
    setLoading(true);
    try {
      await updatePassword(parsed.data.password);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="reset-password-screen">
      <View style={styles.container}>
        <Brand />
        <View style={styles.copy}>
          <Text style={styles.title}>Choose a new password</Text>
          <Text style={styles.description}>
            Use at least 10 characters and do not reuse a password from another
            service.
          </Text>
        </View>
        {error ? <Notice tone="error" message={error} /> : null}
        <TextField
          label="New password"
          value={password}
          onChangeText={setPassword}
          passwordToggle
          autoComplete="new-password"
        />
        <TextField
          label="Confirm password"
          value={confirmation}
          onChangeText={setConfirmation}
          passwordToggle
          autoComplete="new-password"
        />
        <Button
          label="Update password"
          loading={loading}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", gap: spacing.lg },
  copy: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
});
