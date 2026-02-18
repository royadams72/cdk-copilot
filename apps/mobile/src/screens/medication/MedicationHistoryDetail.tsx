import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

type EditEvent = {
  at: string | null;
  by: string;
  reason: string;
  type: "edited" | "status_change";
  changes: string[];
  toStatus: "active" | "paused" | "stopped" | "completed" | null;
};

type MedicationDetail = {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  route: string;
  form: string;
  startAt: string | null;
  endAt: string | null;
  status: "active" | "paused" | "stopped" | "completed";
  updatedAt: string | null;
  editHistory: EditEvent[];
};

function formatDate(value: string | null) {
  if (!value) return "Unknown";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString("en-GB");
}

export default function MedicationHistoryDetail() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const medicationId = typeof params.id === "string" ? params.id : "";
  const [loading, setLoading] = useState(true);
  const [medication, setMedication] = useState<MedicationDetail | null>(null);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!medicationId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/api/medications/${medicationId}`, {
          method: "GET",
        });
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load medication details");
        }
        if (cancelled) return;
        setMedication(body.data ?? null);
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message ?? "Failed to load medication details");
        setShowErrorModal(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [medicationId]);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">Medication detail</ThemedText>

        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading details...</ThemedText>
          </View>
        ) : medication ? (
          <>
            <View style={{ gap: 4 }}>
              <ThemedText type="defaultSemiBold">{medication.name}</ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                {[medication.dose, medication.frequency].filter(Boolean).join(" · ")}
              </ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                Status: {medication.status}
              </ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                Started: {formatDate(medication.startAt)}
              </ThemedText>
              <ThemedText style={{ opacity: 0.8 }}>
                Ended: {formatDate(medication.endAt)}
              </ThemedText>
            </View>

            <View
              style={{
                borderWidth: 1,
                borderColor: "rgba(148,163,184,0.35)",
                borderRadius: 12,
                padding: 12,
                gap: 8,
              }}
            >
              <ThemedText type="defaultSemiBold">Edit history</ThemedText>
              {medication.editHistory?.length ? (
                medication.editHistory
                  .slice()
                  .reverse()
                  .map((event, idx) => (
                    <View
                      key={`${event.at ?? "event"}-${idx}`}
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: "rgba(148,163,184,0.25)",
                        paddingTop: 8,
                        gap: 2,
                      }}
                    >
                      <ThemedText style={{ fontWeight: "700" }}>
                        {event.type === "status_change" ? "Status change" : "Details edited"}
                      </ThemedText>
                      <ThemedText style={{ opacity: 0.8, fontSize: 13 }}>
                        At: {formatDate(event.at)}
                      </ThemedText>
                      {event.toStatus ? (
                        <ThemedText style={{ opacity: 0.8, fontSize: 13 }}>
                          New status: {event.toStatus}
                        </ThemedText>
                      ) : null}
                      {event.changes?.length ? (
                        <ThemedText style={{ opacity: 0.8, fontSize: 13 }}>
                          Changed: {event.changes.join(", ")}
                        </ThemedText>
                      ) : null}
                      {event.reason ? (
                        <ThemedText style={{ opacity: 0.8, fontSize: 13 }}>
                          Reason: {event.reason}
                        </ThemedText>
                      ) : null}
                    </View>
                  ))
              ) : (
                <ThemedText style={{ opacity: 0.7 }}>No edit history recorded.</ThemedText>
              )}
            </View>
          </>
        ) : (
          <ThemedText style={{ opacity: 0.7 }}>Medication not found.</ThemedText>
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
