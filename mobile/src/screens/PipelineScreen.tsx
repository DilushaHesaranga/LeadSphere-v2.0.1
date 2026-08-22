import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, radius, spacing } from "@/theme/tokens";
import type { PipelineBoard, PipelineCard, PipelineStage } from "@/types/crm";
import { formatDateTime } from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";
import { createRequestId } from "@/utils/requestId";

export function PipelineScreen() {
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [board, setBoard] = useState<PipelineBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [movingId, setMovingId] = useState("");
  const [choosingId, setChoosingId] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(
    async (refresh = false) => {
      const userId = session?.user.id;
      if (!userId) return;
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setError("");
      try {
        const resource = `pipeline:${debouncedSearch.toLowerCase() || "all"}`;
        const result = await loadCachedResource(userId, resource, () =>
          crmService.loadPipeline(debouncedSearch),
        );
        setBoard(result.data);
        setCachedAt(result.cachedAt);
      } catch (nextError) {
        setError(friendlyRequestError(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [debouncedSearch, session?.user.id],
  );

  useEffect(() => {
    const loadInitial = async () => {
      await load();
    };
    void loadInitial();
  }, [load]);

  const confirmMove = (card: PipelineCard, stage: PipelineStage) => {
    Alert.alert(
      `Move to ${stage.name}?`,
      `${card.projectTitle} will move from its current stage. This change is recorded in the audit history.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Move Ticket",
          onPress: () => {
            const idempotencyKey = createRequestId();
            setMovingId(card.id);
            setError("");
            setMessage("");
            void crmService
              .moveTicket(
                card.id,
                card.pipelineId,
                stage.slug,
                card.pipelineVersion,
                idempotencyKey,
              )
              .then(async () => {
                setChoosingId("");
                setMessage(`${card.projectTitle} moved to ${stage.name}.`);
                await load(true);
              })
              .catch((nextError) => setError(friendlyRequestError(nextError)))
              .finally(() => setMovingId(""));
          },
        },
      ],
    );
  };

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>SALES JOURNEY</Text>
          <Text style={styles.title}>Pipeline</Text>
          <Text style={styles.description}>
            Review every stage and move assigned Tickets with server-side validation.
          </Text>
        </View>
        <TextField
          label="Search pipeline"
          value={search}
          onChangeText={setSearch}
          placeholder="Ticket, project, or company"
          returnKeyType="search"
        />
        {cachedAt ? <Notice message={`Offline pipeline from ${formatDateTime(cachedAt)}. Stage changes require a connection.`} /> : null}
        {error ? <Notice tone="error" message={error} /> : null}
        {message ? <Notice tone="success" message={message} /> : null}
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {!loading && board ? (
          <>
            <View style={styles.summary}>
              <Text style={styles.summaryTitle}>{board.pipeline.name}</Text>
              <Text style={styles.summaryCount}>{board.totalCount} Tickets</Text>
            </View>
            {board.stages.map((stage) => (
              <View key={stage.slug} style={styles.stage}>
                <View style={styles.stageHeader}>
                  <View>
                    <Text style={styles.stageTitle}>{stage.name}</Text>
                    <Text style={styles.stageCategory}>{stage.category} · {stage.probability}% probability</Text>
                  </View>
                  <Text style={styles.stageCount}>{stage.totalCount}</Text>
                </View>
                {stage.cards.map((card) => (
                  <View key={card.id} style={styles.card}>
                    <Text style={styles.cardTitle}>{card.projectTitle}</Text>
                    <Text style={styles.cardCompany}>{card.companyName} · #{card.ticketNumber}</Text>
                    <Text style={styles.cardMeta}>Manager: {card.responsibleManagerName}</Text>
                    <Text style={[styles.cardMeta, card.hasOverdueFollowUp && styles.overdue]}>
                      Follow-up: {card.hasOverdueFollowUp ? "Overdue" : card.nextFollowUpAt ? formatDateTime(card.nextFollowUpAt) : "None scheduled"}
                    </Text>
                    {card.canMove && card.status === "active" && !cachedAt ? (
                      <>
                        <Pressable
                          accessibilityRole="button"
                          disabled={movingId === card.id}
                          onPress={() => setChoosingId((current) => current === card.id ? "" : card.id)}
                          style={styles.moveButton}
                        >
                          <Text style={styles.moveButtonText}>{movingId === card.id ? "Moving…" : choosingId === card.id ? "Close stages" : "Move stage"}</Text>
                        </Pressable>
                        {choosingId === card.id ? (
                          <View style={styles.stageChoices}>
                            {board.stages.filter((choice) => choice.slug !== card.stage).map((choice) => (
                              <Pressable key={choice.slug} accessibilityRole="button" onPress={() => confirmMove(card, choice)} style={styles.stageChoice}>
                                <Text style={styles.stageChoiceText}>{choice.name}</Text>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                ))}
                {!stage.cards.length ? <Text style={styles.stageEmpty}>No matching Tickets in this stage.</Text> : null}
              </View>
            ))}
          </>
        ) : null}
        {!loading && board && !board.totalCount ? (
          <EmptyState title="No pipeline matches" message="Clear or change the search to see more Tickets." />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  page: { gap: spacing.lg },
  heading: { gap: spacing.sm },
  eyebrow: { color: colors.accent, fontSize: 12, fontWeight: "800", letterSpacing: 1.4 },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800" },
  description: { color: colors.inkMuted, fontSize: 15, lineHeight: 22 },
  summary: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  summaryCount: { color: colors.inkMuted, fontWeight: "700" },
  stage: { gap: spacing.sm },
  stageHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm },
  stageTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  stageCategory: { color: colors.inkMuted, fontSize: 12, textTransform: "capitalize" },
  stageCount: { minWidth: 36, textAlign: "center", color: colors.primary, fontWeight: "900", backgroundColor: colors.surfaceMuted, padding: spacing.sm, borderRadius: radius.pill },
  card: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, gap: spacing.sm },
  cardTitle: { color: colors.ink, fontSize: 16, fontWeight: "800" },
  cardCompany: { color: colors.primary, fontWeight: "700" },
  cardMeta: { color: colors.inkMuted, fontSize: 12 },
  overdue: { color: colors.danger, fontWeight: "800" },
  moveButton: { minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.primary },
  moveButtonText: { color: colors.white, fontWeight: "800" },
  stageChoices: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  stageChoice: { minHeight: 40, paddingHorizontal: spacing.md, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
  stageChoiceText: { color: colors.primary, fontSize: 12, fontWeight: "700" },
  stageEmpty: { color: colors.inkMuted, fontStyle: "italic", padding: spacing.md },
});
