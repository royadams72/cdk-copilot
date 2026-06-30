import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { FeedbackModal } from "@/components/feedback-modal";
import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatMobileDate } from "@/lib/format/date";

type HistoryLab = {
  id: string;
  code: string;
  name: string;
  takenAt: string | null;
  unit: string | null;
  value: number | string;
};

type DateGroup = {
  date: string;
  itemCount: number;
  items: HistoryLab[];
  takenAt: string | null;
};

export default function LabsHistory() {
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEditMode = params.mode === "edit";
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryLab[]>([]);
  const [dateGroups, setDateGroups] = useState<DateGroup[]>([]);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const endpoint = isEditMode
          ? `${API}/api/labs/history?view=dates`
          : `${API}/api/labs/history`;
        const res = await authFetch(endpoint, { method: "GET" });
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load labs history");
        }
        if (cancelled) return;
        if (isEditMode) {
          setDateGroups(body.data?.dates ?? []);
        } else {
          setItems(body.data?.items ?? []);
        }
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message ?? "Failed to load labs history");
        setShowErrorModal(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isEditMode]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 24 }}
      >
        <TouchableOpacity onPress={() => router.replace("/(dashboard)/meds-labs")}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">
          {isEditMode ? "Edit Labs results" : "Labs history"}
        </ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          {isEditMode
            ? "Select a date to edit that day's lab list."
            : "Select a lab to view your reading trend."}
        </ThemedText>

        {loading ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading history...</ThemedText>
          </View>
        ) : (
          <View
            style={{
              borderColor: "rgba(148,163,184,0.35)",
              borderRadius: 12,
              borderWidth: 1,
              gap: 8,
              padding: 12,
            }}
          >
            {isEditMode ? (
              dateGroups.length === 0 ? (
                <ThemedText style={{ opacity: 0.7 }}>
                  No lab dates available.
                </ThemedText>
              ) : (
                dateGroups.map((group) => {
                  const preview = group.items
                    .slice(0, 3)
                    .map((item) => item.name)
                    .join(", ");
                  const moreCount = Math.max(0, group.itemCount - 3);
                  return (
                    <TouchableOpacity
                      key={group.date}
                      onPress={() =>
                        router.push(
                          `/(labs)/add-labs?mode=edit&takenAt=${encodeURIComponent(group.takenAt ?? group.date)}`,
                        )
                      }
                      style={{
                        borderTopColor: "rgba(148,163,184,0.25)",
                        borderTopWidth: 1,
                        gap: 2,
                        paddingTop: 8,
                      }}
                    >
                      <ThemedText style={{ fontWeight: "700" }}>
                        {formatMobileDate(group.takenAt, { fallback: "Unknown" })}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 13, opacity: 0.75 }}>
                        {group.itemCount} lab{group.itemCount === 1 ? "" : "s"}
                      </ThemedText>
                      <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                        {preview}
                        {moreCount > 0 ? ` +${moreCount} more` : ""}
                      </ThemedText>
                    </TouchableOpacity>
                  );
                })
              )
            ) : items.length === 0 ? (
              <ThemedText style={{ opacity: 0.7 }}>
                No lab history available.
              </ThemedText>
            ) : (
              items.map((item) => (
                <TouchableOpacity
                  key={`${item.code}-${item.unit ?? ""}`}
                  onPress={() =>
                    router.push(
                      `/(labs)/lab-trend?code=${encodeURIComponent(item.code)}&unit=${encodeURIComponent(item.unit ?? "")}&name=${encodeURIComponent(item.name)}`,
                    )
                  }
                  style={{
                    borderTopColor: "rgba(148,163,184,0.25)",
                    borderTopWidth: 1,
                    gap: 2,
                    paddingTop: 8,
                  }}
                >
                  <ThemedText style={{ fontWeight: "700" }}>
                    {item.name}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13, opacity: 0.75 }}>
                    Latest: {String(item.value)} {item.unit ?? ""}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13, opacity: 0.75 }}>
                    {formatMobileDate(item.takenAt, { fallback: "Unknown" })}
                  </ThemedText>
                </TouchableOpacity>
              ))
            )}
          </View>
        )}
      </ScrollView>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Labs history error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </View>
  );
}
