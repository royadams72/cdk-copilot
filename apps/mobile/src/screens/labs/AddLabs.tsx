import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";

import { FeedbackModal } from "@/components/feedback-modal";
import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { useAppDispatch } from "@/store/hooks";
import { fetchDashboard } from "@/store/slices/dashboardSlice";
import { LAB_DEFINITIONS } from "./labDefs";

type LabFormItem = {
  code: string;
  hasCustomDate: boolean;
  name: string;
  precision: number;
  takenAt: Date;
  unit: string;
  value: string;
};

type CurrentLabResponse = {
  items: Array<{
    code: string;
    name: string;
    takenAt: string | null;
    unit: string | null;
    value: number | string;
  }>;
};

type ReferenceRangeResponse = {
  items: Array<{
    code: string;
    name: string;
    unit: string;
  }>;
};

function buildDefaultLabs(baseDate: Date) {
  return LAB_DEFINITIONS.map((lab) => ({
    code: lab.code,
    hasCustomDate: false,
    name: lab.name,
    precision: lab.precision,
    takenAt: baseDate,
    unit: lab.unit,
    value: "",
  }));
}

function formatDateUk(value: Date) {
  return value.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function toUtcDateIso(value: Date) {
  return new Date(
    Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()),
  ).toISOString();
}

export default function AddLabs() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const params = useLocalSearchParams<{ mode?: string }>();
  const isEdit = params.mode === "edit";
  const today = useMemo(() => new Date(), []);

  const [labs, setLabs] = useState<LabFormItem[]>(buildDefaultLabs(today));
  const [showDateIndex, setShowDateIndex] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await authFetch(`${API}/api/labs/reference-ranges`, {
          method: "GET",
        });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: ReferenceRangeResponse }
          | null;
        if (!res.ok || !body?.ok) return;
        if (cancelled) return;

        const items = body.data?.items ?? [];
        const mergedItems = [
          ...items,
          ...LAB_DEFINITIONS.map((lab) => ({
            code: lab.code,
            name: lab.name,
            unit: lab.unit,
          })),
        ];
        if (!mergedItems.length) return;
        setLabs((prev) => {
          const previousByCode = new Map(prev.map((item) => [item.code, item] as const));
          const seen = new Set<string>();
          return mergedItems
            .filter((item) => {
              if (!item.code || seen.has(item.code)) return false;
              seen.add(item.code);
              return true;
            })
            .map((item) => {
            const existing = previousByCode.get(item.code);
            return {
              code: item.code,
              hasCustomDate: existing?.hasCustomDate ?? false,
              name: item.name,
              precision: existing?.precision ?? 1,
              takenAt: existing?.takenAt ?? today,
              unit: item.unit,
              value: existing?.value ?? "",
            };
          });
        });
      } catch {
        // Keep local defaults if range list fetch fails.
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [today]);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        const res = await authFetch(`${API}/api/labs/current`, { method: "GET" });
        const body = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: CurrentLabResponse; message?: string }
          | null;
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load labs");
        }
        if (cancelled) return;

        const byCode = new Map(
          (body.data?.items ?? []).map((item) => [item.code, item] as const),
        );
        setLabs((prev) =>
          prev.map((item) => {
            const current = byCode.get(item.code);
            if (!current) return item;
            const takenAt = current.takenAt ? new Date(current.takenAt) : today;
            return {
              ...item,
              hasCustomDate: false,
              takenAt: Number.isNaN(takenAt.getTime()) ? today : takenAt,
              unit: current.unit ?? item.unit,
              value: String(current.value ?? ""),
            };
          }).map((item, idx, arr) => {
            if (idx === 0) return item;
            const firstDateIso = arr[0].takenAt.toISOString();
            return {
              ...item,
              hasCustomDate: item.takenAt.toISOString() !== firstDateIso,
            };
          }),
        );
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message ?? "Failed to load labs");
        setShowErrorModal(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isEdit, today]);

  function updateLab(index: number, updates: Partial<LabFormItem>) {
    setLabs((prev) => {
      const next = prev.map((item, i) => (i === index ? { ...item, ...updates } : item));
      if (index === 0 && updates.takenAt) {
        const firstDate = updates.takenAt;
        return next.map((item, i) => {
          if (i === 0) return item;
          if (item.hasCustomDate) return item;
          return { ...item, takenAt: firstDate };
        });
      }
      return next;
    });
  }

  async function submit() {
    const filledLabs = labs
      .map((item) => ({
        ...item,
        cleanedValue: item.value.trim(),
      }))
      .filter((item) => item.cleanedValue.length > 0);

    if (filledLabs.length === 0) {
      setErrorMessage("Add at least one lab value.");
      setShowErrorModal(true);
      return;
    }

    if (isEdit && !reason.trim()) {
      setErrorMessage("Reason is required when editing labs.");
      setShowErrorModal(true);
      return;
    }

    setSaving(true);
    try {
      const endpoint = isEdit ? `${API}/api/labs/update` : `${API}/api/labs/create`;
      const method = isEdit ? "PATCH" : "POST";
      const payload = {
        labs: filledLabs.map((item) => ({
          code: item.code,
          name: item.name,
          takenAt: toUtcDateIso(item.takenAt),
          unit: item.unit,
          value: item.cleanedValue,
        })),
        reason: reason.trim(),
      };
      const res = await authFetch(endpoint, {
        body: JSON.stringify(payload),
        method,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        throw new Error(body?.message ?? "Failed to save labs");
      }

      dispatch(fetchDashboard({ scope: "today" }));
      router.replace("/(dashboard)/dashboard");
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Failed to save labs");
      setShowErrorModal(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}>
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">{isEdit ? "Edit labs" : "Add lab results"}</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          Enter values for the labs you want to submit.
        </ThemedText>

        {loading ? (
          <View style={{ paddingVertical: 24, alignItems: "center", gap: 8 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading labs...</ThemedText>
          </View>
        ) : (
          <>
            {labs.map((lab, index) => (
              <View
                key={lab.code}
                style={{
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.35)",
                  gap: 8,
                  padding: 12,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>{lab.name}</ThemedText>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <ThemedText style={{ opacity: 0.8 }}>Taken: {formatDateUk(lab.takenAt)}</ThemedText>
                  <TouchableOpacity
                    onPress={() => setShowDateIndex(index)}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(30,58,138,0.35)",
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <ThemedText style={{ fontWeight: "700", color: "#1E3A8A" }}>
                      Set date
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                <TextInput
                  keyboardType={Platform.select({ android: "numeric", ios: "numbers-and-punctuation" })}
                  onChangeText={(value) => updateLab(index, { value })}
                  placeholder={`Enter ${lab.name} value`}
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.45)",
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                  value={lab.value}
                />
                <ThemedText style={{ opacity: 0.7, fontSize: 12 }}>{lab.unit}</ThemedText>
              </View>
            ))}

            {isEdit ? (
              <View style={{ gap: 6 }}>
                <ThemedText style={{ fontWeight: "700" }}>Reason for edit</ThemedText>
                <TextInput
                  multiline
                  onChangeText={setReason}
                  placeholder="Required"
                  style={{
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: "rgba(148,163,184,0.45)",
                    minHeight: 84,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    textAlignVertical: "top",
                  }}
                  value={reason}
                />
              </View>
            ) : null}

            <TouchableOpacity
              disabled={saving}
              onPress={submit}
              style={{
                borderRadius: 10,
                backgroundColor: "rgba(16,185,129,0.18)",
                paddingHorizontal: 12,
                paddingVertical: 12,
                alignItems: "center",
              }}
            >
              <ThemedText style={{ fontWeight: "700", color: "#065F46" }}>
                {saving ? "Saving..." : isEdit ? "Save labs" : "Add labs"}
              </ThemedText>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {showDateIndex !== null ? (
        <DateTimePicker
          display="default"
          mode="date"
          onChange={(_, nextDate) => {
            const index = showDateIndex;
            setShowDateIndex(null);
            if (index !== null && nextDate) {
              updateLab(index, { hasCustomDate: index === 0 ? false : true, takenAt: nextDate });
            }
          }}
          value={labs[showDateIndex]?.takenAt ?? today}
        />
      ) : null}

      <FeedbackModal
        mode="error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
        title="Labs error"
        visible={showErrorModal}
      />
    </View>
  );
}
