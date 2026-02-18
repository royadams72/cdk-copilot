import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

type HistoryItem = {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  startAt: string | null;
  status: "active" | "paused" | "stopped" | "completed";
  updatedAt: string | null;
  latestReason: string | null;
};

type HistoryResponse = {
  paused: HistoryItem[];
  stopped: HistoryItem[];
  completed: HistoryItem[];
  edited: HistoryItem[];
};

function formatDate(value: string | null) {
  if (!value) return "Unknown date";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown date";
  return d.toLocaleDateString("en-GB");
}

function Section({
  title,
  items,
  onSelect,
}: {
  title: string;
  items: HistoryItem[];
  onSelect: (id: string) => void;
}) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: "rgba(148,163,184,0.35)",
        borderRadius: 12,
        padding: 12,
        gap: 8,
      }}
    >
      <ThemedText type="defaultSemiBold">
        {title} ({items.length})
      </ThemedText>
      {items.length ? (
        items.map((item) => (
          <TouchableOpacity
            key={`${title}-${item.id}`}
            onPress={() => onSelect(item.id)}
            style={{
              borderTopWidth: 1,
              borderTopColor: "rgba(148,163,184,0.25)",
              paddingTop: 8,
              gap: 2,
            }}
          >
            <ThemedText style={{ fontWeight: "700" }}>{item.name}</ThemedText>
            <ThemedText style={{ opacity: 0.78, fontSize: 13 }}>
              {[item.dose, item.frequency].filter(Boolean).join(" · ") || "Dose/frequency not set"}
            </ThemedText>
            <ThemedText style={{ opacity: 0.78, fontSize: 13 }}>
              Updated {formatDate(item.updatedAt)}
            </ThemedText>
            {item.latestReason ? (
              <ThemedText style={{ opacity: 0.78, fontSize: 13 }}>
                Reason: {item.latestReason}
              </ThemedText>
            ) : null}
          </TouchableOpacity>
        ))
      ) : (
        <ThemedText style={{ opacity: 0.7 }}>No records in this section.</ThemedText>
      )}
    </View>
  );
}

export default function MedicationHistory() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<HistoryResponse>({
    completed: [],
    edited: [],
    paused: [],
    stopped: [],
  });
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/api/medications/history`, { method: "GET" });
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load medication history");
        }
        if (cancelled) return;
        setData(
          body.data ?? {
            completed: [],
            edited: [],
            paused: [],
            stopped: [],
          },
        );
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message ?? "Failed to load medication history");
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
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Medication history</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          Paused, stopped, completed, and edited medications.
        </ThemedText>

        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading history...</ThemedText>
          </View>
        ) : (
          <>
            <Section
              title="Paused"
              items={data.paused}
              onSelect={(id) => router.push(`/(medications)/medication-details?id=${id}`)}
            />
            <Section
              title="Stopped"
              items={data.stopped}
              onSelect={(id) => router.push(`/(medications)/medication-details?id=${id}`)}
            />
            <Section
              title="Completed"
              items={data.completed}
              onSelect={(id) => router.push(`/(medications)/medication-details?id=${id}`)}
            />
            <Section
              title="Edited"
              items={data.edited}
              onSelect={(id) => router.push(`/(medications)/medication-details?id=${id}`)}
            />
          </>
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
