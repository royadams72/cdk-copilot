import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { DateTimeModal } from "@/components/date-time-modal";
import { FeedbackModal } from "@/components/feedback-modal";
import { ThemedText } from "@/components/themed-text";
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { FormField, TextField } from "@/components/ui/form-field";
import { Section } from "@/components/ui/section";
import { theme } from "@/constants/theme";
import { toQueryErrorMessage } from "@/store/services/appApi";
import {
  useCreateSymptomMutation,
  useGetSymptomsQuery,
  useUpdateSymptomMutation,
} from "@/store/services/symptomsApi";
import type {
  SymptomCurrent,
} from "@/store/services/types";

import { styles } from "../dashboard/styles";
import { NutritionStyles } from "../nutrition/styles";

type PickerField = "startedAt" | null;

const severityOptions = [1, 2, 3, 4, 5] as const;
const statusOptions = ["active", "improving", "resolved"] as const;

function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "Not set";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function symptomMetaLine(item: SymptomCurrent) {
  const triggers = item.triggers.length
    ? `Triggers: ${item.triggers.join(", ")}`
    : "No triggers logged";
  return `${item.status} • severity ${item.severity}/5 • ${triggers}`;
}

export default function SymptomsScreen() {
  const router = useRouter();
  const { data, error, isFetching, isLoading, refetch } = useGetSymptomsQuery();
  const [createSymptom, { isLoading: isCreating }] = useCreateSymptomMutation();
  const [updateSymptom, { isLoading: isUpdating }] = useUpdateSymptomMutation();

  const [editing, setEditing] = useState<SymptomCurrent | null>(null);
  const [prefillSource, setPrefillSource] = useState<SymptomCurrent | null>(
    null,
  );
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState<(typeof severityOptions)[number]>(3);
  const [status, setStatus] =
    useState<(typeof statusOptions)[number]>("active");
  const [note, setNote] = useState("");
  const [triggersText, setTriggersText] = useState("");
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [pickerField, setPickerField] = useState<PickerField>(null);
  const [modalMessage, setModalMessage] = useState<string | null>(null);

  const currentError = toQueryErrorMessage(
    error,
    "We couldn't load your symptom history",
  );

  const loading = isLoading && !data;
  const saving = isCreating || isUpdating;
  const refreshing = isFetching && !!data;

  useEffect(() => {
    if (!editing) return;
    setPrefillSource(null);
    setName(editing.name);
    setSeverity(editing.severity as (typeof severityOptions)[number]);
    setStatus(editing.status);
    setNote(editing.note ?? "");
    setTriggersText(editing.triggers.join(", "));
    setStartedAt(editing.startedAt ? new Date(editing.startedAt) : null);
  }, [editing]);

  function resetForm() {
    setEditing(null);
    setPrefillSource(null);
    setName("");
    setSeverity(3);
    setStatus("active");
    setNote("");
    setTriggersText("");
    setStartedAt(null);
    setPickerField(null);
  }

  function beginEditing(source: SymptomCurrent) {
    setPrefillSource(null);
    setEditing(source);
  }

  function startPrefilledReport(source: SymptomCurrent) {
    setEditing(null);
    setPrefillSource(source);
    setName(source.name);
    setSeverity(source.severity as (typeof severityOptions)[number]);
    setStatus(source.status === "resolved" ? "active" : source.status);
    setNote(source.note ?? "");
    setTriggersText(source.triggers.join(", "));
    setStartedAt(source.startedAt ? new Date(source.startedAt) : null);
    setPickerField(null);
  }

  async function onSubmit() {
    try {
      if (!editing && !name.trim()) {
        setModalMessage("Enter a symptom name before saving.");
        return;
      }

      const triggers = triggersText
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);

      if (editing) {
        await updateSymptom({
          body: {
            note: note.trim() || null,
            severity,
            startedAt,
            status,
            triggers,
          },
          symptomId: editing.symptomId,
        }).unwrap();
      } else {
        await createSymptom({
          name: name.trim(),
          note: note.trim() || null,
          severity,
          startedAt,
          status,
          triggers,
        }).unwrap();
      }
      resetForm();
    } catch (err) {
      setModalMessage(
        toQueryErrorMessage(err, "We couldn't save your symptom right now."),
      );
    }
  }

  async function onQuickStatusChange(
    item: SymptomCurrent,
    nextStatus: "active" | "resolved",
  ) {
    try {
      await updateSymptom({
        body: {
          status: nextStatus,
        },
        symptomId: item.symptomId,
      }).unwrap();
      if (editing?.symptomId === item.symptomId) {
        resetForm();
      }
    } catch (err) {
      setModalMessage(
        toQueryErrorMessage(err, "We couldn't update that symptom."),
      );
    }
  }

  function onDateConfirm(selected: Date) {
    if (!pickerField) return;
    setStartedAt(selected);
    setPickerField(null);
  }

  return (
    <>
      <AppScreen
        keyboardAware
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refetch} />
        }
      >
        <AppButton
          label="Back"
          onPress={() => router.replace("/(dashboard)/meds-labs")}
          variant="secondary"
          size="compact"
        />

        <View style={{ gap: theme.spacing.xs }}>
          <ThemedText type="title" style={NutritionStyles.screenTitle}>Symptoms</ThemedText>
          <ThemedText style={{ color: theme.colors.copy }}>
            Log symptoms in a structured way so your care team can review them.
          </ThemedText>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" />
            <ThemedText style={styles.helperText}>
              Loading symptom history...
            </ThemedText>
          </View>
        ) : null}

        {!loading && error ? (
          <Section title="We couldn't load your symptoms">
            <ThemedText style={{ color: theme.colors.copy }}>{currentError}</ThemedText>
            <AppButton label="Retry" onPress={() => refetch()} />
          </Section>
        ) : null}

        <Section
          title={editing
              ? `Update ${editing.name}`
              : prefillSource
                ? `Report ${prefillSource.name} again`
                : "Log a symptom"}
          description={editing
              ? "Update the current symptom entry."
              : prefillSource
                ? "This form is prefilled from a previous symptom report."
                : "Severity uses a simple 1 to 5 scale."}
        >

            <TextField
              label="Symptom name"
              editable={!editing}
              onChangeText={setName}
              placeholder="e.g. nausea"
              value={name}
            />

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Severity</ThemedText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {severityOptions.map((option) => {
                const selected = severity === option;
                return (
                  <AppButton
                    key={option}
                    label={`${option}/5`}
                    onPress={() => setSeverity(option)}
                    variant={selected ? "primary" : "secondary"}
                    size="compact"
                  />
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Status</ThemedText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {statusOptions.map((option) => {
                const selected = status === option;
                return (
                  <AppButton
                    key={option}
                    label={option}
                    onPress={() => setStatus(option)}
                    variant={selected ? "success" : "secondary"}
                    size="compact"
                  />
                );
              })}
            </View>
          </View>

          <FormField label="Started at">
            <AppButton
              label={formatDateTime(startedAt)}
              onPress={() => setPickerField("startedAt")}
              variant="outline"
              fullWidth
            />
          </FormField>

            <TextField
              label="Triggers"
              onChangeText={setTriggersText}
              placeholder="e.g. after dialysis, walking"
              value={triggersText}
            />

            <TextField
              label="Note"
              multiline
              onChangeText={setNote}
              placeholder="Optional detail for your care team"
              numberOfLines={4}
              value={note}
            />

          <View style={{ flexDirection: "row", gap: 8 }}>
            <AppButton
              label={editing ? "Update symptom" : prefillSource ? "Save new report" : "Save symptom"}
              disabled={saving}
              onPress={onSubmit}
              loading={saving}
              style={{ flex: 1 }}
            />
            {editing || prefillSource ? (
              <AppButton
                label="Cancel"
                disabled={saving}
                onPress={resetForm}
                variant="secondary"
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
        </Section>

        <Section title="Active symptoms">
          {data?.activeSymptoms.length ? (
            data.activeSymptoms.map((item: SymptomCurrent) => (
              <View
                key={item.symptomId}
                style={{
                  borderTopColor: theme.colors.borderSubtle,
                  borderTopWidth: 1,
                  gap: 4,
                  paddingTop: 10,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>
                  {item.name}
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  {symptomMetaLine(item)}
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  Recorded {formatDateTime(item.recordedAt)}
                </ThemedText>
                {item.note ? <ThemedText>{item.note}</ThemedText> : null}
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  <AppButton
                    label="Edit"
                    onPress={() => beginEditing(item)}
                    variant="secondary"
                    size="compact"
                  />
                  <AppButton
                    label="Report again"
                    onPress={() => startPrefilledReport(item)}
                    variant="secondary"
                    size="compact"
                  />
                  <AppButton
                    label="Mark resolved"
                    onPress={() => onQuickStatusChange(item, "resolved")}
                    variant="success"
                    size="compact"
                  />
                </View>
              </View>
            ))
          ) : (
            <ThemedText style={styles.helperText}>
              No active symptoms logged.
            </ThemedText>
          )}
        </Section>

        <Section title="Recently resolved">
          {data?.recentlyResolvedSymptoms.length ? (
            data.recentlyResolvedSymptoms.map((item: SymptomCurrent) => (
              <View
                key={item.symptomId}
                style={{
                  borderTopColor: theme.colors.borderSubtle,
                  borderTopWidth: 1,
                  gap: 4,
                  paddingTop: 10,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>
                  {item.name}
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  Resolved {formatDateTime(item.resolvedAt ?? item.recordedAt)}
                </ThemedText>
                {item.note ? <ThemedText>{item.note}</ThemedText> : null}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <AppButton
                    label="Report again"
                    onPress={() => startPrefilledReport(item)}
                    variant="secondary"
                    size="compact"
                  />
                  <AppButton
                    label="Reopen"
                    onPress={() => onQuickStatusChange(item, "active")}
                    variant="secondary"
                    size="compact"
                  />
                </View>
              </View>
            ))
          ) : (
            <ThemedText style={styles.helperText}>
              No resolved symptoms yet.
            </ThemedText>
          )}
        </Section>

      </AppScreen>

      <DateTimeModal
        visible={pickerField !== null}
        value={startedAt ?? new Date()}
        title="Select symptom start time"
        onCancel={() => setPickerField(null)}
        onConfirm={onDateConfirm}
      />

      <FeedbackModal
        mode="error"
        visible={!!modalMessage}
        title="Symptoms"
        message={modalMessage ?? ""}
        onClose={() => setModalMessage(null)}
      />
    </>
  );
}
