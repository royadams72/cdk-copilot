import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { formatMobileDate } from "@/lib/format/date";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { useGetMedicationByIdQuery } from "@/store/services/medicationApi";
import { NutritionStyles } from "../nutrition/styles";
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { theme } from "@/constants/theme";

export default function MedicationDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const medicationId = typeof params.id === "string" ? params.id : "";
  const [showErrorModal, setShowErrorModal] = useState(false);

  const { data, error, isFetching, isLoading, refetch } =
    useGetMedicationByIdQuery(medicationId);
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your nutrition data",
  );
  const medication = data ?? null;
  const refreshing = isFetching && !!data;
  const loading = isLoading && !data;

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (loading) {
    return (
      <View style={NutritionStyles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={NutritionStyles.helperText}>
          Loading your nutrition data...
        </ThemedText>
      </View>
    );
  }
  return (
    <>
      <AppScreen
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <AppButton label="Back" onPress={() => router.back()} variant="secondary" size="compact" />
        <ThemedText type="title" style={NutritionStyles.screenTitle}>Medication detail</ThemedText>

        {medication ? (
          <>
            <View style={{ gap: 4 }}>
              <ThemedText type="defaultSemiBold">{medication.name}</ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                {[medication.dose, medication.frequency]
                  .filter(Boolean)
                  .join(" · ")}
              </ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                Status: {medication.status}
              </ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                Started: {formatMobileDate(medication.startAt, { fallback: "Unknown", includeTime: true })}
              </ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                Ended: {formatMobileDate(medication.endAt, { fallback: "Unknown", includeTime: true })}
              </ThemedText>
            </View>

            <AppButton
              label="Edit medication"
              onPress={() =>
                router.push(`/(medications)/add-medication?id=${medication.id}`)
              }
              variant="outline"
              size="compact"
            />

            <Section title="Activity history">
              {medication.editHistory?.length ? (
                medication.editHistory
                  .slice()
                  .reverse()
                  .map((event, idx) => (
                    <View
                      key={`${event.at ?? "event"}-${idx}`}
                      style={{
                        borderTopColor: theme.colors.borderSubtle,
                        borderTopWidth: 1,
                        gap: 2,
                        paddingTop: 8,
                      }}
                    >
                      <ThemedText style={{ fontWeight: "700" }}>
                        {event.type === "status_change"
                          ? "Status change"
                          : "Details edited"}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 13, opacity: 0.8 }}>
                        At: {formatMobileDate(event.at, { fallback: "Unknown", includeTime: true })}
                      </ThemedText>
                      {event.toStatus ? (
                        <ThemedText style={{ fontSize: 13, opacity: 0.8 }}>
                          New status: {event.toStatus}
                        </ThemedText>
                      ) : null}
                      {event.changes?.length ? (
                        <ThemedText style={{ fontSize: 13, opacity: 0.8 }}>
                          Changed: {event.changes.join(", ")}
                        </ThemedText>
                      ) : null}
                      {event.reason ? (
                        <ThemedText style={{ fontSize: 13, opacity: 0.8 }}>
                          Reason: {event.reason}
                        </ThemedText>
                      ) : null}
                    </View>
                  ))
              ) : (
                <ThemedText style={{ opacity: 0.7 }}>
                  No history recorded.
                </ThemedText>
              )}
            </Section>
          </>
        ) : (
          <ThemedText style={{ opacity: 0.7 }}>
            Medication not found.
          </ThemedText>
        )}
      </AppScreen>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Medication detail error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </>
  );
}
