import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, spacing } from "@/theme/tokens";
import type { AuthStackParamList } from "@/types/navigation";
import { friendlyRequestError } from "@/utils/errors";
import { firstValidationError, recoverySchema } from "@/validation/auth";

type Props = NativeStackScreenProps<AuthStackParamList, "ForgotPassword">;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { sendPasswordRecovery } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setSuccess("");
    const parsed = recoverySchema.safeParse({ email });
    if (!parsed.success) {
      setError(firstValidationError(parsed.error));
      return;
    }
    setLoading(true);
    try {
      await sendPasswordRecovery(parsed.data.email);
      setSuccess(
        "If an account exists for that email, a secure recovery link has been sent.",
      );
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="forgot-password-screen">
      <View style={styles.container}>
        <Brand />
        <View style={styles.copy}>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.description}>
            Enter your work email. The recovery link will return to LeadSphere
            Mobile.
          </Text>
        </View>
        {error ? <Notice tone="error" message={error} /> : null}
        {success ? <Notice tone="success" message={success} /> : null}
        <TextField
          label="Email address"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          keyboardType="email-address"
          placeholder="name@company.com"
        />
        <Button
          label="Send recovery link"
          loading={loading}
          onPress={() => void submit()}
        />
        <Button
          label="Back to sign in"
          variant="secondary"
          onPress={() => navigation.goBack()}
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
