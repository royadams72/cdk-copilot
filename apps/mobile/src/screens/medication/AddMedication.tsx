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
import { Picker } from "@react-native-picker/picker";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { FeedbackModal } from "@/components/feedback-modal";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";

import type {
  DrugSuggestion,
  MedicationDetail,
  MedicationStatus,
} from "./types";
import {
  useCreateMedicationMutation,
  useLazySearchMedicationQuery,
  useUpdateMedicationMutation,
} from "@/store/services/medicationApi";

const ROUTE_OPTIONS = ["", "oral", "iv", "subcutaneous", "topical", "inhaled"];
const FORM_OPTIONS = [
  "",
  "tablet",
  "capsule",
  "solution",
  "injection",
  "powder",
  "cream",
  "inhaler",
];
const DOSE_UNIT_OPTIONS = [
  "mg",
  "mcg",
  "g",
  "ml",
  "units",
  "tablet",
  "capsule",
  "puff",
  "drop",
] as const;

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
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

function parseDose(value: string): {
  amount: string;
  unit: (typeof DOSE_UNIT_OPTIONS)[number];
} {
  const cleaned = cleanText(value).toLowerCase();
  const match = cleaned.match(
    /^(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|tablet(?:s)?|capsule(?:s)?|puff(?:s)?|drop(?:s)?)$/i,
  );
  if (!match) {
    return { amount: cleaned.replace(/[^0-9.]/g, ""), unit: "mg" };
  }

  const rawUnit = match[2].toLowerCase();
  const canonicalUnit =
    rawUnit === "unit" || rawUnit === "units"
      ? "units"
      : rawUnit.startsWith("tablet")
        ? "tablet"
        : rawUnit.startsWith("capsule")
          ? "capsule"
          : rawUnit.startsWith("puff")
            ? "puff"
            : rawUnit.startsWith("drop")
              ? "drop"
              : rawUnit;
  const unit = (DOSE_UNIT_OPTIONS.find((option) => option === canonicalUnit) ??
    "mg") as (typeof DOSE_UNIT_OPTIONS)[number];

  return { amount: match[1], unit };
}

function normaliseFrequency(value: string) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return "";
  const map: Record<string, string> = {
    bid: "twice daily",
    od: "once daily",
    prn: "as needed",
    qd: "once daily",
    qid: "four times daily",
    tid: "three times daily",
  };
  return map[cleaned] ?? cleaned;
}

export default function AddMedication() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [
    searchMedication,
    { isFetching: isSearchFetching, error: searchError },
  ] = useLazySearchMedicationQuery();
  const medicationId = typeof params.id === "string" ? params.id : "";
  const isEditMode = !!medicationId;

  const [name, setName] = useState("");
  const [doseAmount, setDoseAmount] = useState("");
  const [doseUnit, setDoseUnit] =
    useState<(typeof DOSE_UNIT_OPTIONS)[number]>("mg");
  const [frequency, setFrequency] = useState("");
  const [route, setRoute] = useState("");
  const [form, setForm] = useState("");
  const [editReason, setEditReason] = useState("");
  const [startAt, setStartAt] = useState(() => new Date());
  const [status, setStatus] = useState<MedicationStatus>("active");
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [selectedDrug, setSelectedDrug] = useState<DrugSuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [loadingMedication, setLoadingMedication] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showStatusInfoModal, setShowStatusInfoModal] = useState(false);
  const [updateMedication] = useUpdateMedicationMutation();
  const [createMedication] = useCreateMedicationMutation();
  const [originalSnapshot, setOriginalSnapshot] = useState<{
    dose: string;
    form: string;
    frequency: string;
    name: string;
    route: string;
    startAtIso: string;
    status: MedicationStatus;
  } | null>(null);

  const canShowSuggestions = useMemo(
    () => name.trim().length > 1 && suggestions.length > 0,
    [name, suggestions.length],
  );

  useEffect(() => {
    if (!isEditMode) return;

    let cancelled = false;
    const run = async () => {
      try {
        setLoadingMedication(true);
        const res = await authFetch(`${API}/api/medications/${medicationId}`, {
          method: "GET",
        });
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load medication");
        }

        if (cancelled) return;

        const med = body.data as MedicationDetail;
        const parsedDose = parseDose(med.dose ?? "");
        const nextStartAt = med.startAt ? new Date(med.startAt) : new Date();

        setName(med.name ?? "");
        setDoseAmount(parsedDose.amount);
        setDoseUnit(parsedDose.unit);
        setFrequency(med.frequency ?? "");
        setRoute(med.route ?? "");
        setForm(med.form ?? "");
        setStatus(med.status ?? "active");
        setStartAt(
          Number.isNaN(nextStartAt.getTime()) ? new Date() : nextStartAt,
        );

        setOriginalSnapshot({
          dose: cleanText(med.dose ?? "").toLowerCase(),
          form: cleanText(med.form ?? "").toLowerCase(),
          frequency: cleanText(med.frequency ?? "").toLowerCase(),
          name: cleanText(med.name ?? ""),
          route: cleanText(med.route ?? "").toLowerCase(),
          startAtIso: med.startAt ? new Date(med.startAt).toISOString() : "",
          status: med.status ?? "active",
        });
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message ?? "Failed to load medication");
        setShowErrorModal(true);
      } finally {
        if (!cancelled) setLoadingMedication(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, medicationId]);

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }

    const handle = setTimeout(async () => {
      try {
        const res = await searchMedication({ limit: 8, query }).unwrap();
        setSuggestions(res.items ?? []);
      } catch (err) {
        setSuggestions([]);
      }
    }, 280);

    return () => clearTimeout(handle);
  }, [name]);

  function isDetailEditComparedToOriginal(
    nextDose: string,
    nextFrequency: string,
  ) {
    if (!originalSnapshot) return false;

    return (
      cleanText(name) !== originalSnapshot.name ||
      nextDose !== originalSnapshot.dose ||
      nextFrequency !== originalSnapshot.frequency ||
      cleanText(route).toLowerCase() !== originalSnapshot.route ||
      cleanText(form).toLowerCase() !== originalSnapshot.form ||
      toUtcDateIso(startAt) !== originalSnapshot.startAtIso
    );
  }

  function handleStatusPick(nextStatus: MedicationStatus) {
    setStatus(nextStatus);
    if (nextStatus !== "active") {
      setShowStatusInfoModal(true);
    }
  }

  async function handleSubmit() {
    const cleanedName = cleanText(name);
    const cleanedDoseAmount = cleanText(doseAmount);
    const cleanedFrequency = normaliseFrequency(frequency);

    if (!cleanedName || !cleanedDoseAmount) {
      setErrorMessage("Name, dose and start date are required.");
      setShowErrorModal(true);
      return;
    }

    if (!/^\d+(\.\d+)?$/.test(cleanedDoseAmount)) {
      setErrorMessage("Dose amount must be a number.");
      setShowErrorModal(true);
      return;
    }

    const cleanedDose = `${cleanedDoseAmount} ${doseUnit}`.toLowerCase();
    const hasDetailsEdited = isEditMode
      ? isDetailEditComparedToOriginal(cleanedDose, cleanedFrequency)
      : false;
    const statusChanged = isEditMode
      ? status !== (originalSnapshot?.status ?? "active")
      : false;

    if (
      isEditMode &&
      hasDetailsEdited &&
      status === "active" &&
      !cleanText(editReason)
    ) {
      setErrorMessage(
        "Reason for edit is required when changing medication details.",
      );
      setShowErrorModal(true);
      return;
    }

    setSubmitting(true);
    try {
      if (!isEditMode) {
        const payload = {
          dmplusdCode: selectedDrug?.dmplusdCode ?? undefined,
          dose: cleanedDose,
          drugRefId: selectedDrug?.id,
          form: cleanText(form),
          frequency: cleanedFrequency,
          instructions: "",
          name: cleanedName,
          route: cleanText(route),
          snomedCode: selectedDrug?.snomedCode ?? undefined,
          startAt: toUtcDateIso(startAt),
        };
        createMedication(payload);
        // const res = await authFetch(`${API}/api/medications/create`, {
        //   body: JSON.stringify(payload),
        //   method: "POST",
        // });
        // const body: any = await res.json().catch(() => null);
        // if (!res.ok || !body?.ok) {
        //   throw new Error(body?.message ?? "Failed to save medication");
        // }
      } else {
        const payload = {
          dmplusdCode: selectedDrug?.dmplusdCode ?? undefined,
          dose: cleanedDose,
          drugRefId: selectedDrug?.id ?? undefined,
          editReason: cleanText(editReason),
          form: cleanText(form),
          frequency: cleanedFrequency,
          name: cleanedName,
          route: cleanText(route),
          snomedCode: selectedDrug?.snomedCode ?? undefined,
          startAt: toUtcDateIso(startAt),
          status,
        };

        updateMedication({ id: medicationId, payload });

        if (statusChanged || hasDetailsEdited) {
          setEditReason("");
        }
      }

      router.replace("/(dashboard)/dashboard");
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Failed to save medication");
      setShowErrorModal(true);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingMedication) {
    return (
      <View
        style={{
          alignItems: "center",
          flex: 1,
          gap: 12,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" />
        <ThemedText>Loading medication...</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ gap: 14, padding: 16, paddingBottom: 28 }}
      >
        <View style={{ gap: 4 }}>
          <TouchableOpacity onPress={() => router.back()}>
            <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
          </TouchableOpacity>
          <ThemedText type="title">Medications</ThemedText>
          {isEditMode ? (
            <ThemedText style={{ opacity: 0.7 }}>
              Edit the medication below, or set it to paused, stopped, or
              completed.
            </ThemedText>
          ) : (
            <ThemedText style={{ opacity: 0.7 }}>
              Name, dose and start date are required.
            </ThemedText>
          )}
        </View>

        {isEditMode ? (
          <View>
            <ThemedText>Status actions</ThemedText>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 6,
              }}
            >
              {["active", "paused", "stopped", "completed"].map((option) => {
                const optionStatus = option as MedicationStatus;
                const selected = status === optionStatus;
                return (
                  <TouchableOpacity
                    key={optionStatus}
                    onPress={() => handleStatusPick(optionStatus)}
                    style={{
                      backgroundColor: selected
                        ? "rgba(15,23,42,0.88)"
                        : "rgba(148,163,184,0.2)",
                      borderRadius: 999,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                    }}
                  >
                    <ThemedText
                      style={{
                        color: selected ? "#fff" : "#111827",
                        fontWeight: "700",
                        textTransform: "capitalize",
                      }}
                    >
                      {optionStatus}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}

        <View>
          <ThemedText>Name</ThemedText>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              setSelectedDrug(null);
            }}
            placeholder="Start typing medication name"
            autoCapitalize="words"
            style={{
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              borderWidth: 1,
              marginTop: 6,
              padding: 10,
            }}
          />
          {isSearchFetching ? (
            <View
              style={{
                alignItems: "center",
                flexDirection: "row",
                gap: 8,
                marginTop: 8,
              }}
            >
              <ActivityIndicator size="small" />
              <ThemedText style={{ opacity: 0.7 }}>
                Searching drugs...
              </ThemedText>
            </View>
          ) : null}
          {canShowSuggestions ? (
            <View
              style={{
                borderColor: "rgba(148,163,184,0.35)",
                borderRadius: 10,
                borderWidth: 1,
                marginTop: 8,
              }}
            >
              {suggestions.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => {
                    setName(item.displayName);
                    setSelectedDrug(item);
                    if (item.route) setRoute(item.route);
                    if (item.form) setForm(item.form);
                    setSuggestions([]);
                  }}
                  style={{
                    borderBottomColor: "rgba(148,163,184,0.22)",
                    borderBottomWidth: 1,
                    paddingHorizontal: 10,
                    paddingVertical: 9,
                  }}
                >
                  <ThemedText style={{ fontWeight: "600" }}>
                    {item.displayName}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                    {[item.form, item.route].filter(Boolean).join(" · ") ||
                      "No form/route"}
                  </ThemedText>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>

        <View>
          <ThemedText>Route</ThemedText>
          <View
            style={{
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              borderWidth: 1,
              marginTop: 6,
            }}
          >
            <Picker selectedValue={route} onValueChange={setRoute}>
              {ROUTE_OPTIONS.map((option) => (
                <Picker.Item
                  key={option || "none"}
                  label={option ? option : "Select route"}
                  value={option}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View>
          <ThemedText>Form</ThemedText>
          <View
            style={{
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              borderWidth: 1,
              marginTop: 6,
            }}
          >
            <Picker selectedValue={form} onValueChange={setForm}>
              {FORM_OPTIONS.map((option) => (
                <Picker.Item
                  key={option || "none"}
                  label={option ? option : "Select form"}
                  value={option}
                />
              ))}
            </Picker>
          </View>
        </View>

        <View>
          <ThemedText>Dose</ThemedText>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
            <TextInput
              value={doseAmount}
              onChangeText={(value) =>
                setDoseAmount(value.replace(/[^0-9.]/g, ""))
              }
              placeholder="e.g. 50"
              keyboardType="decimal-pad"
              style={{
                borderColor: "rgba(148,163,184,0.5)",
                borderRadius: 10,
                borderWidth: 1,
                flex: 1,
                padding: 10,
              }}
            />
            <View
              style={{
                borderColor: "rgba(148,163,184,0.5)",
                borderRadius: 10,
                borderWidth: 1,
                flex: 1,
              }}
            >
              <Picker selectedValue={doseUnit} onValueChange={setDoseUnit}>
                {DOSE_UNIT_OPTIONS.map((option) => (
                  <Picker.Item key={option} label={option} value={option} />
                ))}
              </Picker>
            </View>
          </View>
        </View>

        <View>
          <ThemedText>Frequency</ThemedText>
          <TextInput
            value={frequency}
            onChangeText={setFrequency}
            onBlur={() => setFrequency(normaliseFrequency(frequency))}
            placeholder="e.g. three times daily"
            style={{
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              borderWidth: 1,
              marginTop: 6,
              padding: 10,
            }}
          />
        </View>

        <View>
          <ThemedText>Start date</ThemedText>
          <TouchableOpacity
            onPress={() => setShowStartDatePicker(true)}
            style={{
              borderColor: "rgba(148,163,184,0.5)",
              borderRadius: 10,
              borderWidth: 1,
              marginTop: 6,
              padding: 10,
            }}
          >
            <ThemedText>{formatDateUk(startAt)}</ThemedText>
          </TouchableOpacity>
          {showStartDatePicker ? (
            <View style={{ marginTop: 8 }}>
              <DateTimePicker
                value={startAt}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selected) => {
                  if (event.type === "dismissed") {
                    setShowStartDatePicker(false);
                    return;
                  }
                  if (selected) setStartAt(selected);
                  if (Platform.OS !== "ios") setShowStartDatePicker(false);
                }}
              />
              {Platform.OS === "ios" ? (
                <TouchableOpacity
                  onPress={() => setShowStartDatePicker(false)}
                  style={{
                    alignItems: "center",
                    backgroundColor: "rgba(148,163,184,0.2)",
                    borderRadius: 10,
                    marginTop: 8,
                    paddingVertical: 10,
                  }}
                >
                  <ThemedText style={{ fontWeight: "600" }}>Done</ThemedText>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        {isEditMode ? (
          <View>
            <ThemedText>Reason for edit</ThemedText>
            <TextInput
              value={editReason}
              onChangeText={setEditReason}
              placeholder="Required when changing medication details"
              multiline
              numberOfLines={3}
              style={{
                borderColor: "rgba(148,163,184,0.5)",
                borderRadius: 10,
                borderWidth: 1,
                marginTop: 6,
                minHeight: 86,
                padding: 10,
                textAlignVertical: "top",
              }}
            />
          </View>
        ) : null}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting}
          style={{
            alignItems: "center",
            backgroundColor: submitting
              ? "rgba(15,23,42,0.3)"
              : "rgba(15,23,42,0.9)",
            borderRadius: 12,
            paddingVertical: 12,
          }}
        >
          <ThemedText style={{ color: "#fff", fontWeight: "700" }}>
            {submitting
              ? "Saving..."
              : isEditMode
                ? "Save changes"
                : "Save medication"}
          </ThemedText>
        </TouchableOpacity>
      </ScrollView>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Medication form error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />

      <FeedbackModal
        mode="info"
        visible={showStatusInfoModal}
        title="Status update"
        message="This status will remove the medication from your dashboard. You can still view it in medication history."
        onClose={() => setShowStatusInfoModal(false)}
      />
    </View>
  );
}
