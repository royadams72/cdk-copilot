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
import { formatMobileUkInputDate, toMobileUtcDateIso } from "@/lib/format/date";
import { useAppDispatch } from "@/store/hooks";
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

export default function AddLabs() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const params = useLocalSearchParams<{ mode?: string; takenAt?: string }>();
  const isEdit = params.mode === "edit";
  const editTakenAt =
    typeof params.takenAt === "string" && params.takenAt.trim().length > 0
      ? params.takenAt
      : null;
  const today = useMemo(() => new Date(), []);

  const [labs, setLabs] = useState<LabFormItem[]>(buildDefaultLabs(today));
  const [showDateIndex, setShowDateIndex] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showErrorModal, setShowErrorModal] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        const endpoint = editTakenAt
          ? `${API}/api/labs/history?takenDate=${encodeURIComponent(editTakenAt)}`
          : `${API}/api/labs/current`;
        const res = await authFetch(endpoint, { method: "GET" });
        const body = (await res.json().catch(() => null)) as {
          data?: CurrentLabResponse;
          message?: string;
          ok?: boolean;
        } | null;
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load labs");
        }
        if (cancelled) return;

        const byCode = new Map(
          (body.data?.items ?? []).map((item) => [item.code, item] as const),
        );
        setLabs((prev) =>
          prev
            .map((item) => {
              const current = byCode.get(item.code);
              if (!current) return item;
              const takenAt = current.takenAt
                ? new Date(current.takenAt)
                : today;
              return {
                ...item,
                hasCustomDate: !!editTakenAt,
                takenAt: Number.isNaN(takenAt.getTime()) ? today : takenAt,
                unit: current.unit ?? item.unit,
                value: String(current.value ?? ""),
              };
            })
            .map((item, idx, arr) => {
              if (idx === 0) return item;
              const firstDateIso = arr[0].takenAt.toISOString();
              return {
                ...item,
                hasCustomDate:
                  !!editTakenAt || item.takenAt.toISOString() !== firstDateIso,
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
  }, [editTakenAt, isEdit, today]);

  function updateLab(index: number, updates: Partial<LabFormItem>) {
    setLabs((prev) => {
      const next = prev.map((item, i) =>
        i === index ? { ...item, ...updates } : item,
      );
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
      const endpoint = isEdit
        ? `${API}/api/labs/update`
        : `${API}/api/labs/create`;
      const method = isEdit ? "PATCH" : "POST";
      const payload = {
        labs: filledLabs.map((item) => ({
          code: item.code,
          name: item.name,
          takenAt: toMobileUtcDateIso(item.takenAt),
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

      // dispatch(fetchDashboard({ scope: "today" }));
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
      <ScrollView
        contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 24 }}
      >
        <TouchableOpacity
          onPress={() =>
            router.replace(
              isEdit ? "/(labs)/labs-history?mode=edit" : "/(dashboard)/meds-labs",
            )
          }
        >
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <ThemedText type="title">
          {isEdit ? "Edit labs" : "Add lab results"}
        </ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          {isEdit && editTakenAt
            ? `Editing labs for ${formatMobileUkInputDate(new Date(editTakenAt))}.`
            : "Enter values for the labs you want to submit."}
        </ThemedText>

        {loading ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading labs...</ThemedText>
          </View>
        ) : (
          <>
            {labs.map((lab, index) => (
              <View
                key={lab.code}
                style={{
                  borderColor: "rgba(148,163,184,0.35)",
                  borderRadius: 12,
                  borderWidth: 1,
                  gap: 8,
                  padding: 12,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>
                  {lab.name}
                </ThemedText>
                <View
                  style={{ alignItems: "center", flexDirection: "row", gap: 8 }}
                >
                  <ThemedText style={{ opacity: 0.8 }}>
                    Taken: {formatMobileUkInputDate(lab.takenAt)}
                  </ThemedText>
                  <TouchableOpacity
                    onPress={() => setShowDateIndex(index)}
                    style={{
                      borderColor: "rgba(30,58,138,0.35)",
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                    }}
                  >
                    <ThemedText style={{ color: "#1E3A8A", fontWeight: "700" }}>
                      Set date
                    </ThemedText>
                  </TouchableOpacity>
                </View>
                <TextInput
                  keyboardType={Platform.select({
                    android: "numeric",
                    ios: "numbers-and-punctuation",
                  })}
                  onChangeText={(value) => updateLab(index, { value })}
                  placeholder={`Enter ${lab.name} value`}
                  style={{
                    borderColor: "rgba(148,163,184,0.45)",
                    borderRadius: 10,
                    borderWidth: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                  }}
                  value={lab.value}
                />
                <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                  {lab.unit}
                </ThemedText>
              </View>
            ))}

            {isEdit ? (
              <View style={{ gap: 6 }}>
                <ThemedText style={{ fontWeight: "700" }}>
                  Reason for edit
                </ThemedText>
                <TextInput
                  multiline
                  onChangeText={setReason}
                  placeholder="Required"
                  style={{
                    borderColor: "rgba(148,163,184,0.45)",
                    borderRadius: 10,
                    borderWidth: 1,
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
                alignItems: "center",
                backgroundColor: "rgba(16,185,129,0.18)",
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 12,
              }}
            >
              <ThemedText style={{ color: "#065F46", fontWeight: "700" }}>
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
              updateLab(index, {
                hasCustomDate: index === 0 ? false : true,
                takenAt: nextDate,
              });
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
