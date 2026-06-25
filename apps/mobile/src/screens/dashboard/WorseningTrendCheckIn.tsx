import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  WorseningTrendKey,
  WORSENING_TREND_RULES,
  type WorseningTrendKey as WorseningTrendKeyType,
} from "@ckd/core";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/screens/dashboard/components/Card";
import { styles as dashboardStyles } from "@/screens/dashboard/styles";
import { toQueryErrorMessage } from "@/store/services/appApi";
import {
  useGetActiveWorseningTrendsQuery,
  useSubmitWorseningTrendCheckInMutation,
} from "@/store/services/worseningTrendApi";

function getReviewRoute(key: WorseningTrendKeyType) {
  switch (key) {
    case "weight_increase":
    case "weight_decrease":
      return "/metric-trend?kind=weight&label=Weight";
    case "blood_pressure_up":
      return "/metric-trend?kind=blood_pressure&label=Blood%20pressure";
    case "symptoms_worsening":
      return "/symptoms";
    case "nutrition_worsening":
      return "/nutrition-details";
    case "steps_decline":
      return "/fitness-details";
  }
}

export default function WorseningTrendCheckIn() {
  const router = useRouter();
  const params = useLocalSearchParams<{ alertId?: string; key?: string }>();
  const alertId = typeof params.alertId === "string" ? params.alertId : "";
  const parsedKey = WorseningTrendKey.safeParse(params.key);
  const trendKey = parsedKey.success ? parsedKey.data : null;
  const { data, error, isLoading, isFetching } = useGetActiveWorseningTrendsQuery();
  const [submitCheckIn, { isLoading: isSubmitting }] =
    useSubmitWorseningTrendCheckInMutation();
  const [selectedCode, setSelectedCode] = useState<string>("");

  const alert = useMemo(
    () =>
      (data ?? []).find(
        (item) => item.id === alertId && item.key === trendKey,
      ) ?? null,
    [alertId, data, trendKey],
  );

  const prompt = trendKey ? WORSENING_TREND_RULES[trendKey].checkInPrompt : null;
  const reviewRoute = trendKey ? getReviewRoute(trendKey) : null;
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't load this worsening trend check-in.",
  );

  useEffect(() => {
    setSelectedCode(alert?.checkInResponseCode ?? "");
  }, [alert?.checkInResponseCode]);

  async function handleSubmit() {
    if (!alertId || !trendKey || !selectedCode) {
      return;
    }

    try {
      await submitCheckIn({
        alertId,
        key: trendKey,
        responseCode: selectedCode,
      }).unwrap();

      Alert.alert(
        "Check-in saved",
        "Thanks. We'll use this to guide whether the trend stays app-managed or needs clinician attention.",
        [
          {
            onPress: () => {
              if (reviewRoute) {
                router.replace(reviewRoute as never);
                return;
              }
              router.back();
            },
            text: "Review trend",
          },
        ],
      );
    } catch (submissionError) {
      Alert.alert(
        "Unable to save check-in",
        toQueryErrorMessage(
          submissionError,
          "Please try again in a moment.",
        ),
      );
    }
  }

  if (isLoading && !data) {
    return (
      <View style={dashboardStyles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={dashboardStyles.helperText}>
          Loading your check-in...
        </ThemedText>
      </View>
    );
  }

  return (
    <ScrollView
      style={dashboardStyles.container}
      contentContainerStyle={dashboardStyles.content}
    >
      <Pressable onPress={() => router.back()}>
        <ThemedText style={screenStyles.backLink}>‹ Back</ThemedText>
      </Pressable>

      {!alertId || !trendKey ? (
        <Card>
          <ThemedText type="defaultSemiBold">Check-in unavailable</ThemedText>
          <ThemedText style={dashboardStyles.helperText}>
            The worsening trend link is incomplete.
          </ThemedText>
        </Card>
      ) : !prompt ? (
        <Card>
          <ThemedText type="defaultSemiBold">Check-in unavailable</ThemedText>
          <ThemedText style={dashboardStyles.helperText}>
            This worsening trend does not currently need a patient check-in.
          </ThemedText>
        </Card>
      ) : !alert ? (
        <Card>
          <ThemedText type="defaultSemiBold">Trend not active</ThemedText>
          <ThemedText style={dashboardStyles.helperText}>
            {error ? errorMessage : "This worsening trend is no longer active."}
          </ThemedText>
        </Card>
      ) : (
        <>
          <View style={dashboardStyles.header}>
            <ThemedText type="title">{alert.title}</ThemedText>
            <ThemedText style={dashboardStyles.helperText}>
              {alert.body}
            </ThemedText>
          </View>

          <Card>
            <ThemedText type="defaultSemiBold">Quick check-in</ThemedText>
            <ThemedText style={screenStyles.question}>{prompt.question}</ThemedText>
            {alert.detail ? (
              <ThemedText style={dashboardStyles.helperText}>
                {alert.detail}
              </ThemedText>
            ) : null}
            {alert.checkInSubmittedAt ? (
              <ThemedText style={screenStyles.savedText}>
                You can update your answer if this has changed.
              </ThemedText>
            ) : null}

            <View style={screenStyles.optionList}>
              {prompt.options.map((option) => {
                const selected = selectedCode === option.code;
                return (
                  <Pressable
                    key={option.code}
                    onPress={() => setSelectedCode(option.code)}
                    style={[
                      screenStyles.optionButton,
                      selected && screenStyles.optionButtonSelected,
                    ]}
                  >
                    <ThemedText
                      style={[
                        screenStyles.optionLabel,
                        selected && screenStyles.optionLabelSelected,
                      ]}
                    >
                      {option.label}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>

            <View style={screenStyles.actions}>
              <Pressable
                disabled={!selectedCode || isSubmitting || isFetching}
                onPress={() => {
                  void handleSubmit();
                }}
                style={[
                  screenStyles.primaryButton,
                  (!selectedCode || isSubmitting || isFetching) &&
                    screenStyles.primaryButtonDisabled,
                ]}
              >
                <ThemedText style={screenStyles.primaryButtonText}>
                  {isSubmitting ? "Saving..." : "Save check-in"}
                </ThemedText>
              </Pressable>

              {reviewRoute ? (
                <Pressable
                  onPress={() => router.push(reviewRoute as never)}
                  style={screenStyles.secondaryButton}
                >
                  <ThemedText style={screenStyles.secondaryButtonText}>
                    Review trend data
                  </ThemedText>
                </Pressable>
              ) : null}
            </View>
          </Card>
        </>
      )}
    </ScrollView>
  );
}

const screenStyles = StyleSheet.create({
  actions: {
    gap: 12,
    marginTop: 8,
  },
  backLink: {
    fontWeight: "600",
  },
  optionButton: {
    backgroundColor: "#FFFFFF",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  optionButtonSelected: {
    backgroundColor: "#E0F2FE",
    borderColor: "#0284C7",
  },
  optionLabel: {
    color: "#0F172A",
    fontSize: 15,
    lineHeight: 22,
  },
  optionLabelSelected: {
    color: "#075985",
    fontWeight: "700",
  },
  optionList: {
    gap: 10,
    marginTop: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: "#0F766E",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  primaryButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  question: {
    color: "#0F172A",
    fontSize: 16,
    lineHeight: 24,
    marginTop: 6,
  },
  savedText: {
    color: "#0369A1",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 6,
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: "#CBD5E1",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    color: "#0F172A",
    fontSize: 15,
    fontWeight: "600",
  },
});
