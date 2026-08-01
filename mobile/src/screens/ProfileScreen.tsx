import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { Button } from "@/components/Button";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme/tokens";
import { friendlyRequestError } from "@/utils/errors";

export function ProfileScreen() {
  const { authorization, signOut } = useAuth();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const profile = authorization.profile;
  const role = authorization.roles[0];

  const logout = () => {
    Alert.alert(
      "Sign out of LeadSphere?",
      "Your secure session will be removed from this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: () => {
            setLoading(true);
            setError("");
            void signOut()
              .catch((nextError) => setError(friendlyRequestError(nextError)))
              .finally(() => setLoading(false));
          },
        },
      ],
    );
  };

  return (
    <Screen testID="profile-screen">
      <View style={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>YOUR PROFILE</Text>
          <Text style={styles.title}>
            {profile?.display_name || "LeadSphere user"}
          </Text>
          <Text style={styles.description}>{profile?.email}</Text>
        </View>
        {error ? <Notice tone="error" message={error} /> : null}
        <View style={styles.card}>
          <ProfileRow label="Role" value={role?.name || "No active role"} />
          <ProfileRow
            label="Account"
            value={profile?.status || "Unavailable"}
          />
          <ProfileRow
            label="Permission scopes"
            value={`${Object.keys(authorization.permissions).length} active`}
          />
          <ProfileRow
            label="Teams"
            value={
              authorization.teams.length
                ? authorization.teams.map((team) => team.name).join(", ")
                : "None"
            }
          />
        </View>
        <Notice message="Roles and permissions are read from trusted LeadSphere records and cannot be edited in the mobile application." />
        <Button
          label="Sign out"
          variant="danger"
          loading={loading}
          onPress={logout}
        />
      </View>
    </Screen>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 16 },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    minHeight: 62,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    justifyContent: "center",
    gap: spacing.xs,
  },
  rowLabel: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  rowValue: { color: colors.ink, fontSize: 16, fontWeight: "600" },
});
