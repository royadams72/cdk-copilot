import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  Pressable,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { formatMobileDate } from "@/lib/format/date";
import type { MedicationHistoryItem } from "./types";
import { useGetMedicationHistoryQuery } from "@/store/services/medicationApi";
import { toQueryErrorMessage } from "@/store/services/appApi";
import { NutritionStyles } from "../nutrition/styles";
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { theme } from "@/constants/theme";

function MedicationList({
  items,
  onSelect,
}: {
  items: MedicationHistoryItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <Section title={`All medications (${items.length})`}>
      {items.length ? (
        items.map((item) => (
          <Pressable
            key={item.id}
            onPress={() => onSelect(item.id)}
            style={{
              borderTopColor: theme.colors.borderSubtle,
              borderTopWidth: 1,
              gap: 2,
              paddingTop: 8,
            }}
          >
            <ThemedText style={{ fontWeight: "700" }}>{item.name}</ThemedText>
            <ThemedText style={{ fontSize: 13, color: theme.colors.copy }}>
              {[item.dose, item.frequency].filter(Boolean).join(" · ") ||
                "Dose/frequency not set"}
            </ThemedText>
            <ThemedText style={{ fontSize: 13, color: theme.colors.copy }}>
              Current status: {item.status}
            </ThemedText>
            <ThemedText style={{ fontSize: 13, color: theme.colors.copy }}>
              Updated {formatMobileDate(item.updatedAt, { fallback: "Unknown date" })}
            </ThemedText>
            {item.latestReason ? (
              <ThemedText style={{ fontSize: 13, color: theme.colors.copy }}>
                Reason: {item.latestReason}
              </ThemedText>
            ) : null}
          </Pressable>
        ))
      ) : (
        <ThemedText style={{ opacity: 0.7 }}>
          No records in this section.
        </ThemedText>
      )}
    </Section>
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
    <>
      <AppScreen
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <AppButton
          label="Back"
          onPress={() => router.replace("/(dashboard)/meds-labs")}
          variant="secondary"
          size="compact"
        />
        <ThemedText type="title" style={NutritionStyles.screenTitle}>Medication history</ThemedText>
        <ThemedText style={{ color: theme.colors.copy }}>
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
      </AppScreen>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Medication history error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </>
  );
}
