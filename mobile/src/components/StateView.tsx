import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { Brand } from "./Brand";
import { Button } from "./Button";
import { Screen } from "./Screen";
import { colors, spacing } from "@/theme/tokens";

interface StateViewProps {
  title: string;
  description: string;
  loading?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function StateView({
  title,
  description,
  loading = false,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}: StateViewProps) {
  return (
    <Screen scroll={false}>
      <View style={styles.content}>
        <Brand />
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} />
        ) : null}
        <View style={styles.copy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>
        {actionLabel && onAction ? (
          <Button label={actionLabel} onPress={onAction} />
        ) : null}
        {secondaryLabel && onSecondary ? (
          <Button
            label={secondaryLabel}
            onPress={onSecondary}
            variant="secondary"
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: "center",
    gap: spacing.lg,
  },
  copy: { gap: spacing.sm },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 16, lineHeight: 24 },
});
