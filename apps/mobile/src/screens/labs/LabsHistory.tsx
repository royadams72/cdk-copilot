import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { FeedbackModal } from "@/components/feedback-modal";
import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

type HistoryLab = {
  code: string;
  id: string;
  name: string;
  takenAt: string | null;
  unit: string | null;
  value: number | string;
};

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleDateString("en-GB");
}

export default function LabsHistory() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HistoryLab[]>([]);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/api/labs/history`, { method: "GET" });
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load labs history");
        }
        if (cancelled) return;
        setItems(body.data?.items ?? []);
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
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Labs history</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          Select a lab to view your reading trend.
        </ThemedText>

        {loading ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading history...</ThemedText>
          </View>
        ) : (
          <View
            style={{
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              borderRadius: 12,
              padding: 12,
              gap: 8,
            }}
          >
            {items.length === 0 ? (
              <ThemedText style={{ opacity: 0.7 }}>No lab history available.</ThemedText>
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
                    borderTopWidth: 1,
                    borderTopColor: "rgba(148,163,184,0.25)",
                    paddingTop: 8,
                    gap: 2,
                  }}
                >
                  <ThemedText style={{ fontWeight: "700" }}>{item.name}</ThemedText>
                  <ThemedText style={{ opacity: 0.75, fontSize: 13 }}>
                    Latest: {String(item.value)} {item.unit ?? ""}
                  </ThemedText>
                  <ThemedText style={{ opacity: 0.75, fontSize: 13 }}>
                    {formatDate(item.takenAt)}
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

