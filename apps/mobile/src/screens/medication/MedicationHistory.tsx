import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import type { MedicationHistoryItem, MedicationHistoryResponse } from "./types";
import { useGetMedicationHistoryQuery } from "@/store/services/medicationApi";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { NutritionStyles } from "../nutrition/styles";

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString("en-GB");
}

function MedicationList({
  items,
  onSelect,
}: {
  items: MedicationHistoryItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <View
      style={{
        borderColor: "rgba(148,163,184,0.35)",
        borderRadius: 12,
        borderWidth: 1,
        gap: 8,
        padding: 12,
      }}
    >
      <ThemedText type="defaultSemiBold">
        All medications ({items.length})
      </ThemedText>
      {items.length ? (
        items.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={{
              borderTopColor: "rgba(148,163,184,0.25)",
              borderTopWidth: 1,
              gap: 2,
              paddingTop: 8,
            }}
          >
            <ThemedText style={{ fontWeight: "700" }}>{item.name}</ThemedText>
            <ThemedText style={{ fontSize: 13, opacity: 0.78 }}>
              {[item.dose, item.frequency].filter(Boolean).join(" · ") ||
                "Dose/frequency not set"}
            </ThemedText>
            <ThemedText style={{ fontSize: 13, opacity: 0.78 }}>
              Current status: {item.status}
            </ThemedText>
            <ThemedText style={{ fontSize: 13, opacity: 0.78 }}>
              Updated {formatDate(item.updatedAt)}
            </ThemedText>
            {item.latestReason ? (
              <ThemedText style={{ fontSize: 13, opacity: 0.78 }}>
                Reason: {item.latestReason}
              </ThemedText>
            ) : null}
          </TouchableOpacity>
        ))
      ) : (
        <ThemedText style={{ opacity: 0.7 }}>
          No records in this section.
        </ThemedText>
      )}
    </View>
  );
}

export default function MedicationHistory() {
  const router = useRouter();

  const [showErrorModal, setShowErrorModal] = useState(false);

  const { data, error, isFetching, isLoading, refetch } =
    useGetMedicationHistoryQuery();
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your medication data",
  );
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
          Loading your medication data...
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
        <ThemedText type="title">Medication history</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          Select a medication to view full status and edit history.
        </ThemedText>

        {data && (
          <MedicationList
            items={data.items}
            onSelect={(id) =>
              router.push(`/(medications)/medication-details?id=${id}`)
            }
          />
        )}
      </ScrollView>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Medication history error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </View>
  );
}
