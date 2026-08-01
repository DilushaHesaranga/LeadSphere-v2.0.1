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
import { firstValidationError, loginSchema } from "@/validation/auth";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { signIn, message } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(firstValidationError(parsed.error));
      return;
    }
    setLoading(true);
    try {
      await signIn(parsed.data.email, parsed.data.password);
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen testID="login-screen">
      <View style={styles.container}>
        <Brand />
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>SALES WORKSPACE</Text>
          <Text style={styles.title}>Welcome back.</Text>
          <Text style={styles.description}>
            Sign in with the same LeadSphere account you use on the web.
          </Text>
        </View>
        {error || message ? (
          <Notice tone="error" message={error || message} />
        ) : null}
        <View style={styles.form}>
          <TextField
            label="Email address"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            keyboardType="email-address"
            returnKeyType="next"
            placeholder="name@company.com"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoComplete="current-password"
            passwordToggle
            returnKeyType="done"
            onSubmitEditing={() => void submit()}
            placeholder="Enter your password"
          />
          <Button
            label="Sign in"
            loading={loading}
            onPress={() => void submit()}
          />
          <Button
            label="Forgotten password?"
            variant="text"
            onPress={() => navigation.navigate("ForgotPassword")}
          />
        </View>
        <Text style={styles.security}>
          Authentication is provided by the existing Supabase project. Your
          password is never stored by this application.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", gap: spacing.xl },
  copy: { gap: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.5,
  },
  title: { color: colors.ink, fontSize: 38, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
  form: { gap: spacing.md },
  security: { color: colors.inkMuted, fontSize: 12, lineHeight: 18 },
});
