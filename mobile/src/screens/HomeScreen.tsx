import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { PERMISSIONS } from "@/authorization/permissions";
import { ProtectedScreen } from "@/authorization/PermissionGate";
import { Brand } from "@/components/Brand";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { colors, radius, spacing } from "@/theme/tokens";
import { friendlyRequestError } from "@/utils/errors";

export function HomeScreen() {
  const { authorization, refreshAccess } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const firstName = authorization.profile?.display_name?.split(" ")[0];

  const refresh = async () => {
    setError("");
    setRefreshing(true);
    try {
      await refreshAccess();
    } catch (nextError) {
      setError(friendlyRequestError(nextError));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ProtectedScreen permission={PERMISSIONS.CONSOLE_ACCESS}>
      <Screen refreshing={refreshing} onRefresh={() => void refresh()}>
        <View style={styles.page}>
          <Brand />
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>SALES WORKSPACE</Text>
            <Text style={styles.title}>
              Good to see you{firstName ? `, ${firstName}` : ""}.
            </Text>
            <Text style={styles.description}>
              Your mobile session uses the same account and permissions as the
              LeadSphere web console.
            </Text>
          </View>
          {error ? <Notice tone="error" message={error} /> : null}
          <View style={styles.accessCard}>
            <Text style={styles.cardLabel}>CURRENT ACCESS</Text>
            <Text style={styles.accessTitle}>Sales Executive</Text>
            <Text style={styles.accessBody}>
              Your trusted access record is active. Pull down to refresh role
              and permission changes made by an administrator.
            </Text>
          </View>
          <View style={styles.moduleCard}>
            <View style={styles.moduleHeader}>
              <View style={styles.statusDot} />
              <Text style={styles.cardLabel}>FEATURE INVENTORY</Text>
            </View>
            <Text style={styles.cardTitle}>CRM modules are not live yet</Text>
            <Text style={styles.cardBody}>
              The existing web Leads, Customers, Pipeline, and Activity pages
              are placeholders. LeadSphere Mobile will enable those areas only
              after their shared database tables, NestJS APIs, validation, and
              record-scope enforcement exist in the web application.
            </Text>
          </View>
        </View>
      </Screen>
    </ProtectedScreen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.xl },
  heading: { gap: spacing.sm },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.4,
  },
  title: { color: colors.ink, fontSize: 34, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
  accessCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    gap: spacing.sm,
  },
  moduleCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  moduleHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  cardLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  cardTitle: { color: colors.ink, fontSize: 21, fontWeight: "800" },
  cardBody: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  accessTitle: { color: colors.white, fontSize: 21, fontWeight: "800" },
  accessBody: { color: "#DCEBE3", fontSize: 15, lineHeight: 22 },
});
