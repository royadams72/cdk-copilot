import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatMobileDate } from "@/lib/format/date";
import type { MedicationDetail } from "./types";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { useGetMedicationByIdQuery } from "@/store/services/medicationApi";
import { NutritionStyles } from "../nutrition/styles";

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
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 24 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Medication detail</ThemedText>

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

            <TouchableOpacity
              onPress={() =>
                router.push(`/(medications)/add-medication?id=${medication.id}`)
              }
              style={{
                alignSelf: "flex-start",
                borderColor: "rgba(37,99,235,0.45)",
                borderRadius: 10,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <ThemedText style={{ fontWeight: "700" }}>
                Edit medication
              </ThemedText>
            </TouchableOpacity>

            <View
              style={{
                borderColor: "rgba(148,163,184,0.35)",
                borderRadius: 12,
                borderWidth: 1,
                gap: 8,
                padding: 12,
              }}
            >
              <ThemedText type="defaultSemiBold">Activity history</ThemedText>
              {medication.editHistory?.length ? (
                medication.editHistory
                  .slice()
                  .reverse()
                  .map((event, idx) => (
                    <View
                      key={`${event.at ?? "event"}-${idx}`}
                      style={{
                        borderTopColor: "rgba(148,163,184,0.25)",
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
            </View>
          </>
        ) : (
          <ThemedText style={{ opacity: 0.7 }}>
            Medication not found.
          </ThemedText>
        )}
      </ScrollView>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Medication detail error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </View>
  );
}
