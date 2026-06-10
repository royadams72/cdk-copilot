import { useEffect, useMemo, useState } from "react";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { FeedbackModal } from "@/components/feedback-modal";
import { ThemedText } from "@/components/themed-text";
import { toQueryErrorMessage } from "@/store/services/appApi";
import {
  useCreateSymptomMutation,
  useGetSymptomsQuery,
  useUpdateSymptomMutation,
} from "@/store/services/symptomsApi";
import type {
  SymptomCurrent,
  SymptomHistoryEvent,
} from "@/store/services/types";

import { Card } from "../dashboard/components/Card";
import { styles } from "../dashboard/styles";

type PickerField = "recordedAt" | "startedAt" | null;

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
  const [name, setName] = useState("");
  const [severity, setSeverity] = useState<(typeof severityOptions)[number]>(3);
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("active");
  const [note, setNote] = useState("");
  const [triggersText, setTriggersText] = useState("");
  const [recordedAt, setRecordedAt] = useState(new Date());
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

  const timeline = useMemo(
    () =>
      (data?.history ?? []).map((event: SymptomHistoryEvent) => event.after),
    [data?.history],
  );

  useEffect(() => {
    if (!editing) return;
    setName(editing.name);
    setSeverity(editing.severity as (typeof severityOptions)[number]);
    setStatus(editing.status);
    setNote(editing.note ?? "");
    setTriggersText(editing.triggers.join(", "));
    setRecordedAt(new Date(editing.recordedAt));
    setStartedAt(editing.startedAt ? new Date(editing.startedAt) : null);
  }, [editing]);

  function resetForm() {
    setEditing(null);
    setName("");
    setSeverity(3);
    setStatus("active");
    setNote("");
    setTriggersText("");
    setRecordedAt(new Date());
    setStartedAt(null);
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
            recordedAt,
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
          recordedAt,
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
          recordedAt: new Date(),
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

  function onDateChange(_event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS !== "ios") {
      setPickerField(null);
    }
    if (!selected || !pickerField) return;
    if (pickerField === "recordedAt") {
      setRecordedAt(selected);
      return;
    }
    setStartedAt(selected);
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refetch} />
        }
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>

        <View style={styles.header}>
          <ThemedText type="title">Symptoms</ThemedText>
          <ThemedText style={styles.helperText}>
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
          <Card>
            <ThemedText type="defaultSemiBold">
              We couldn't load your symptoms
            </ThemedText>
            <ThemedText style={styles.helperText}>{currentError}</ThemedText>
            <TouchableOpacity
              style={styles.primaryActionButton}
              onPress={() => refetch()}
            >
              <ThemedText style={styles.primaryActionText}>Retry</ThemedText>
            </TouchableOpacity>
          </Card>
        ) : null}

        <Card>
          <ThemedText type="defaultSemiBold">
            {editing ? `Update ${editing.name}` : "Log a symptom"}
          </ThemedText>
          <ThemedText style={styles.helperText}>
            Severity uses a simple 1 to 5 scale.
          </ThemedText>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Symptom name</ThemedText>
            <TextInput
              editable={!editing}
              onChangeText={setName}
              placeholder="e.g. nausea"
              style={{
                borderColor: "#CBD5E1",
                borderRadius: 10,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
                opacity: editing ? 0.6 : 1,
              }}
              value={name}
            />
          </View>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Severity</ThemedText>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {severityOptions.map((option) => {
                const selected = severity === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setSeverity(option)}
                    style={{
                      backgroundColor: selected
                        ? "rgba(59,130,246,0.16)"
                        : "rgba(148,163,184,0.12)",
                      borderColor: selected ? "#2563EB" : "transparent",
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <ThemedText style={{ fontWeight: "700" }}>
                      {option}/5
                    </ThemedText>
                  </TouchableOpacity>
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
                  <TouchableOpacity
                    key={option}
                    onPress={() => setStatus(option)}
                    style={{
                      backgroundColor: selected
                        ? "rgba(16,185,129,0.16)"
                        : "rgba(148,163,184,0.12)",
                      borderColor: selected ? "#10B981" : "transparent",
                      borderRadius: 999,
                      borderWidth: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                    }}
                  >
                    <ThemedText
                      style={{ fontWeight: "700", textTransform: "capitalize" }}
                    >
                      {option}
                    </ThemedText>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Started at</ThemedText>
            <TouchableOpacity
              onPress={() => setPickerField("startedAt")}
              style={{
                borderColor: "#CBD5E1",
                borderRadius: 10,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <ThemedText>{formatDateTime(startedAt)}</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Recorded at</ThemedText>
            <TouchableOpacity
              onPress={() => setPickerField("recordedAt")}
              style={{
                borderColor: "#CBD5E1",
                borderRadius: 10,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <ThemedText>{formatDateTime(recordedAt)}</ThemedText>
            </TouchableOpacity>
          </View>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Triggers</ThemedText>
            <TextInput
              onChangeText={setTriggersText}
              placeholder="e.g. after dialysis, walking"
              style={{
                borderColor: "#CBD5E1",
                borderRadius: 10,
                borderWidth: 1,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
              value={triggersText}
            />
          </View>

          <View style={{ gap: 8 }}>
            <ThemedText style={{ fontWeight: "600" }}>Note</ThemedText>
            <TextInput
              multiline
              onChangeText={setNote}
              placeholder="Optional detail for your care team"
              style={{
                borderColor: "#CBD5E1",
                borderRadius: 10,
                borderWidth: 1,
                minHeight: 96,
                paddingHorizontal: 12,
                paddingVertical: 10,
                textAlignVertical: "top",
              }}
              value={note}
            />
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              disabled={saving}
              onPress={onSubmit}
              style={[
                styles.primaryActionButton,
                saving ? { opacity: 0.7 } : null,
              ]}
            >
              <ThemedText style={styles.primaryActionText}>
                {saving ? "Saving..." : editing ? "Update symptom" : "Save symptom"}
              </ThemedText>
            </TouchableOpacity>
            {editing ? (
              <TouchableOpacity
                disabled={saving}
                onPress={resetForm}
                style={styles.secondaryActionButton}
              >
                <ThemedText style={styles.secondaryActionText}>
                  Cancel edit
                </ThemedText>
              </TouchableOpacity>
            ) : null}
          </View>
        </Card>

        <Card>
          <ThemedText type="defaultSemiBold">Active symptoms</ThemedText>
          {data?.activeSymptoms.length ? (
            data.activeSymptoms.map((item: SymptomCurrent) => (
              <View
                key={item.symptomId}
                style={{
                  borderTopColor: "rgba(148,163,184,0.25)",
                  borderTopWidth: 1,
                  gap: 4,
                  paddingTop: 10,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>{item.name}</ThemedText>
                <ThemedText style={styles.helperText}>
                  {symptomMetaLine(item)}
                </ThemedText>
                <ThemedText style={styles.helperText}>
                  Recorded {formatDateTime(item.recordedAt)}
                </ThemedText>
                {item.note ? <ThemedText>{item.note}</ThemedText> : null}
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setEditing(item)}
                    style={styles.secondaryActionButton}
                  >
                    <ThemedText style={styles.secondaryActionText}>Edit</ThemedText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onQuickStatusChange(item, "resolved")}
                    style={styles.primaryActionButton}
                  >
                    <ThemedText style={styles.primaryActionText}>
                      Mark resolved
                    </ThemedText>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <ThemedText style={styles.helperText}>
              No active symptoms logged.
            </ThemedText>
          )}
        </Card>

        <Card>
          <ThemedText type="defaultSemiBold">Recently resolved</ThemedText>
          {data?.recentlyResolvedSymptoms.length ? (
            data.recentlyResolvedSymptoms.map((item: SymptomCurrent) => (
              <View
                key={item.symptomId}
                style={{
                  borderTopColor: "rgba(148,163,184,0.25)",
                  borderTopWidth: 1,
                  gap: 4,
                  paddingTop: 10,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>{item.name}</ThemedText>
                <ThemedText style={styles.helperText}>
                  Resolved {formatDateTime(item.resolvedAt ?? item.recordedAt)}
                </ThemedText>
                {item.note ? <ThemedText>{item.note}</ThemedText> : null}
                <TouchableOpacity
                  onPress={() => onQuickStatusChange(item, "active")}
                  style={styles.secondaryActionButton}
                >
                  <ThemedText style={styles.secondaryActionText}>Reopen</ThemedText>
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <ThemedText style={styles.helperText}>
              No resolved symptoms yet.
            </ThemedText>
          )}
        </Card>

        <Card>
          <ThemedText type="defaultSemiBold">Recent activity</ThemedText>
          {timeline.length ? (
            timeline.slice(0, 12).map((entry: SymptomCurrent) => (
              <View
                key={`${entry.symptomId}-${entry.recordedAt}`}
                style={{
                  borderTopColor: "rgba(148,163,184,0.25)",
                  borderTopWidth: 1,
                  gap: 4,
                  paddingTop: 10,
                }}
              >
                <ThemedText style={{ fontWeight: "700" }}>{entry.name}</ThemedText>
                <ThemedText style={styles.helperText}>
                  {formatDateTime(entry.recordedAt)} • severity {entry.severity}/5 •{" "}
                  {entry.status}
                </ThemedText>
                {entry.note ? <ThemedText>{entry.note}</ThemedText> : null}
              </View>
            ))
          ) : (
            <ThemedText style={styles.helperText}>
              Your symptom timeline will appear here after you log entries.
            </ThemedText>
          )}
        </Card>
      </ScrollView>

      {pickerField ? (
        <DateTimePicker
          display={Platform.OS === "ios" ? "spinner" : "default"}
          mode="datetime"
          onChange={onDateChange}
          value={pickerField === "recordedAt" ? recordedAt : startedAt ?? new Date()}
        />
      ) : null}

      <FeedbackModal
        mode="error"
        visible={!!modalMessage}
        title="Symptoms"
        message={modalMessage ?? ""}
        onClose={() => setModalMessage(null)}
      />
    </View>
  );
}
