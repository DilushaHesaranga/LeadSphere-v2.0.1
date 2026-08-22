import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { useAuth } from "@/auth/AuthContext";
import { EmptyState } from "@/components/EmptyState";
import { Notice } from "@/components/Notice";
import { Screen } from "@/components/Screen";
import { SegmentedControl } from "@/components/SegmentedControl";
import { TextField } from "@/components/TextField";
import { TicketCard } from "@/components/TicketCard";
import { crmService } from "@/services/crm";
import { loadCachedResource } from "@/services/secureCache";
import { colors, spacing } from "@/theme/tokens";
import type { BusinessArea, CaseSummary } from "@/types/crm";
import type { WorkStackParamList } from "@/types/navigation";
import { formatDateTime } from "@/utils/dateTime";
import { friendlyRequestError } from "@/utils/errors";

type Props = NativeStackScreenProps<WorkStackParamList, "WorkList">;
const AREA_OPTIONS = [
  { label: "Leads", value: "leads" },
  { label: "Customers", value: "customers" },
] as const;

export function WorkListScreen({ navigation }: Props) {
  const { session } = useAuth();
  const [area, setArea] = useState<BusinessArea>("leads");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [cachedAt, setCachedAt] = useState<string | null>(null);

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
        const resource = `work:${area}:${debouncedSearch.toLowerCase() || "all"}`;
        const result = await loadCachedResource(userId, resource, () =>
          crmService.listCases(area, debouncedSearch),
        );
        setCases(result.data);
        setCachedAt(result.cachedAt);
      } catch (nextError) {
        setError(friendlyRequestError(nextError));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [area, debouncedSearch, session?.user.id],
  );

  useEffect(() => {
    const loadInitial = async () => {
      await load();
    };
    void loadInitial();
  }, [load]);

  const ticketCount = cases.reduce((total, item) => total + item.tickets.length, 0);

  return (
    <Screen refreshing={refreshing} onRefresh={() => void load(true)}>
      <View style={styles.page}>
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>CUSTOMER JOURNEY</Text>
          <Text style={styles.title}>Your sales work</Text>
          <Text style={styles.description}>
            Find any visible Ticket, then open it for contacts, notes, and follow-ups.
          </Text>
        </View>
        <SegmentedControl
          label="Lead or customer view"
          value={area}
          options={AREA_OPTIONS}
          onChange={setArea}
        />
        <TextField
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Company, project, contact, email, or phone"
          returnKeyType="search"
          autoCorrect={false}
        />
        {cachedAt ? (
          <Notice message={`Showing encrypted offline data from ${formatDateTime(cachedAt)}.`} />
        ) : null}
        {error ? <Notice tone="error" message={error} /> : null}
        <View style={styles.resultHeader}>
          <Text style={styles.resultTitle}>{area === "leads" ? "Lead Tickets" : "Customer Tickets"}</Text>
          <Text style={styles.resultCount}>{ticketCount} found</Text>
        </View>
        {loading ? <ActivityIndicator size="large" color={colors.primary} /> : null}
        {!loading && !ticketCount ? (
          <EmptyState
            title={search ? "No matching Tickets" : `No ${area} available`}
            message={search ? "Try another company, project, contact, email, or phone." : "Tickets will appear here when they enter this part of the sales journey."}
          />
        ) : null}
        {!loading
          ? cases.map((caseItem) => (
              <View key={caseItem.id} style={styles.caseGroup}>
                <View style={styles.caseHeader}>
                  <Text style={styles.company}>{caseItem.companyName}</Text>
                  <Text style={styles.caseCount}>{caseItem.tickets.length}</Text>
                </View>
                {caseItem.tickets.map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    companyName={caseItem.companyName}
                    onPress={() =>
                      navigation.navigate("TicketDetail", {
                        ticketId: ticket.id,
                        companyName: caseItem.companyName,
                      })
                    }
                  />
                ))}
              </View>
            ))
          : null}
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
  resultHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  resultTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  resultCount: { color: colors.inkMuted, fontSize: 12, fontWeight: "700" },
  caseGroup: { gap: spacing.sm },
  caseHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: spacing.sm },
  company: { flex: 1, color: colors.primary, fontSize: 17, fontWeight: "800" },
  caseCount: { color: colors.inkMuted, fontWeight: "700" },
});
