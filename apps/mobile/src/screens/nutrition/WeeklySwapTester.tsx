import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import type { TWeeklyNutritionInsight } from "@ckd/core";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/screens/dashboard/components/Card";
import {
  toQueryErrorMessage,
  useGetLatestWeeklyNutritionInsightQuery,
  useRunWeeklyNutritionInsightMutation,
} from "@/store/services/dashboardApi";

function formatFindingType(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatReason(value: string) {
  return value.replace(/_/g, " ");
}

function isReferenceDateValid(value: string) {
  if (!value.trim()) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

export default function WeeklySwapTester() {
  const router = useRouter();
  const [referenceDate, setReferenceDate] = useState("");
  const [lastRunResult, setLastRunResult] =
    useState<TWeeklyNutritionInsight | null>(null);
  const {
    data: latestInsight,
    error: latestError,
    isFetching: isRefreshingLatest,
    isLoading: isLatestLoading,
    refetch,
  } = useGetLatestWeeklyNutritionInsightQuery();
  const [runInsight, { error: runError, isLoading: isRunning }] =
    useRunWeeklyNutritionInsightMutation();

  const displayInsight = lastRunResult ?? latestInsight ?? null;
  const errorMessage = useMemo(() => {
    if (!isReferenceDateValid(referenceDate)) {
      return "Reference date must use YYYY-MM-DD.";
    }
    return toQueryErrorMessage(
      runError ?? latestError,
      "We couldn't load the weekly swap tester",
    );
  }, [latestError, referenceDate, runError]);
  const hasQueryError =
    Boolean(runError ?? latestError) || !isReferenceDateValid(referenceDate);

  async function handleRun() {
    if (!isReferenceDateValid(referenceDate)) {
      return;
    }
    const response = await runInsight(
      referenceDate.trim() ? { referenceDate: referenceDate.trim() } : {},
    ).unwrap();
    setLastRunResult(response);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshingLatest && !isLatestLoading}
          onRefresh={refetch}
        />
      }
    >
      <View style={styles.navRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
          <ThemedText style={styles.navButtonText}>‹ Back</ThemedText>
        </TouchableOpacity>
      </View>

      <View style={styles.header}>
        <ThemedText type="title">Weekly Swap Tester</ThemedText>
        <ThemedText style={styles.helperText}>
          Run the weekly nutrition insight job for your account and inspect the
          detected contributors and suggested swaps.
        </ThemedText>
      </View>

      <Card>
        <View style={styles.cardHeader}>
          <ThemedText type="defaultSemiBold">Run analysis</ThemedText>
          <ThemedText style={styles.helperText}>
            Leave blank to use today. Use a Monday-to-Sunday window by entering a
            reference date such as 2026-03-23.
          </ThemedText>
        </View>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={setReferenceDate}
          placeholder="YYYY-MM-DD"
          placeholderTextColor="#94A3B8"
          style={styles.input}
          value={referenceDate}
        />
        <TouchableOpacity
          disabled={isRunning || !isReferenceDateValid(referenceDate)}
          onPress={handleRun}
          style={[
            styles.runButton,
            (isRunning || !isReferenceDateValid(referenceDate)) &&
              styles.runButtonDisabled,
          ]}
        >
          {isRunning ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <ThemedText style={styles.runButtonText}>Run weekly insight</ThemedText>
          )}
        </TouchableOpacity>
        {hasQueryError ? (
          <ThemedText style={styles.errorText}>{errorMessage}</ThemedText>
        ) : null}
      </Card>

      {isLatestLoading && !displayInsight ? (
        <Card>
          <View style={styles.loadingRow}>
            <ActivityIndicator />
            <ThemedText>Loading latest weekly insight...</ThemedText>
          </View>
        </Card>
      ) : null}

      {displayInsight ? (
        <>
          <Card>
            {(() => {
              const analysisMode = displayInsight.analysisMode ?? "weekly_average";
              const loggedDays =
                typeof displayInsight.loggedDays === "number"
                  ? displayInsight.loggedDays
                  : 7;
              return (
                <>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Summary</ThemedText>
              <ThemedText style={styles.helperText}>
                {displayInsight.weekStart} to {displayInsight.weekEnd}
              </ThemedText>
            </View>
            <ThemedText style={styles.summaryText}>
              {displayInsight.humanMessage}
            </ThemedText>
            <ThemedText style={styles.helperText}>
              Goal applied: {formatReason(displayInsight.goal)}
            </ThemedText>
            <ThemedText style={styles.helperText}>
              Logged days: {loggedDays} | Mode: {formatReason(analysisMode)}
            </ThemedText>
                </>
              );
            })()}
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Findings</ThemedText>
              <ThemedText style={styles.helperText}>
                Top contributors and nutrient checks from the generated result.
              </ThemedText>
            </View>
            {displayInsight.findings.length ? (
              <View style={styles.sectionList}>
                {displayInsight.findings.map((finding) => (
                  <View key={finding.type} style={styles.block}>
                    <ThemedText style={styles.blockTitle}>
                      {formatFindingType(finding.type)}
                    </ThemedText>
                    <ThemedText style={styles.helperText}>
                      Severity: {finding.severity} | Actual: {finding.actual} |
                      Target: {finding.target}
                    </ThemedText>
                    {finding.topContributors?.length ? (
                      <View style={styles.miniList}>
                        {finding.topContributors.map((contributor) => (
                          <ThemedText
                            key={`${finding.type}-${contributor.food}`}
                            style={styles.helperText}
                          >
                            {contributor.food}: {contributor.nutrientAmount} (
                            {contributor.contribution}%)
                          </ThemedText>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText style={styles.helperText}>
                No findings were generated for this run.
              </ThemedText>
            )}
          </Card>

          <Card>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Swap suggestions</ThemedText>
              <ThemedText style={styles.helperText}>
                These are the actual alternatives returned from the weekly script.
              </ThemedText>
            </View>
            {displayInsight.suggestions.length ? (
              <View style={styles.sectionList}>
                {displayInsight.suggestions.map((suggestion, index) => (
                  <View
                    key={`${suggestion.fromFood}-${suggestion.reason}-${index}`}
                    style={styles.block}
                  >
                    <ThemedText style={styles.blockTitle}>
                      {suggestion.fromFood}
                    </ThemedText>
                    <ThemedText style={styles.helperText}>
                      Reason: {formatReason(suggestion.reason)}
                    </ThemedText>
                    <ThemedText style={styles.helperText}>
                      Alternatives: {suggestion.alternatives.join(", ")}
                    </ThemedText>
                  </View>
                ))}
              </View>
            ) : (
              <ThemedText style={styles.helperText}>
                No swap suggestions were produced for this run.
              </ThemedText>
            )}
          </Card>
        </>
      ) : (
        !isLatestLoading && (
          <Card>
            <ThemedText type="defaultSemiBold">No insight yet</ThemedText>
            <ThemedText style={styles.helperText}>
              Run the weekly insight to populate this tester.
            </ThemedText>
          </Card>
        )
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 4,
    paddingBottom: 12,
    borderBottomColor: "#E2E8F0",
    borderBottomWidth: 1,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  cardHeader: {
    gap: 4,
    marginBottom: 10,
  },
  container: {
    flex: 1,
  },
  content: {
    gap: 12,
    padding: 16,
    paddingBottom: 32,
  },
  errorText: {
    color: "#B91C1C",
    fontSize: 13,
    marginTop: 8,
  },
  header: {
    gap: 6,
  },
  helperText: {
    fontSize: 13,
    opacity: 0.72,
  },
  input: {
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0F172A",
    backgroundColor: "#fff",
  },
  loadingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
  },
  miniList: {
    gap: 4,
    marginTop: 4,
  },
  navButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  navButtonText: {
    fontWeight: "600",
  },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  runButton: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 14,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  runButtonDisabled: {
    opacity: 0.5,
  },
  runButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  sectionList: {
    gap: 12,
  },
  summaryText: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 8,
  },
});
