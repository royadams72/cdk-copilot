import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ThemedText } from "@/components/themed-text";

type DateTimeModalProps = {
  visible: boolean;
  value: Date;
  onCancel: () => void;
  onConfirm: (next: Date) => void;
  title?: string;
};

function applyDate(base: Date, selected: Date) {
  return new Date(
    selected.getFullYear(),
    selected.getMonth(),
    selected.getDate(),
    base.getHours(),
    base.getMinutes(),
    0,
    0,
  );
}

function applyTime(base: Date, selected: Date) {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    selected.getHours(),
    selected.getMinutes(),
    0,
    0,
  );
}

export function DateTimeModal({
  visible,
  value,
  onCancel,
  onConfirm,
  title = "Select date and time",
}: DateTimeModalProps) {
  const [draft, setDraft] = useState(value);
  const [activePicker, setActivePicker] = useState<
    "date" | "time" | null
  >(null);

  useEffect(() => {
    if (visible) {
      setDraft(value);
      setActivePicker(null);
    }
  }, [visible, value]);

  const formattedDate = draft.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const formattedTime = draft.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return (
    <Modal visible={visible} transparent animationType="fade">
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          {Platform.OS === "ios" ? (
            <>
              <View style={styles.pickerBlock}>
                <ThemedText style={styles.label}>Date</ThemedText>
                <DateTimePicker
                  value={draft}
                  mode="date"
                  display="spinner"
                  onChange={(_, selected) => {
                    if (selected) setDraft((prev) => applyDate(prev, selected));
                  }}
                />
              </View>
              <View style={styles.pickerBlock}>
                <ThemedText style={styles.label}>Time</ThemedText>
                <DateTimePicker
                  value={draft}
                  mode="time"
                  display="spinner"
                  onChange={(_, selected) => {
                    if (selected) setDraft((prev) => applyTime(prev, selected));
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <Pressable
                style={styles.selectorRow}
                onPress={() => setActivePicker("date")}
              >
                <ThemedText style={styles.label}>Date</ThemedText>
                <ThemedText style={styles.valueText}>
                  {formattedDate}
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.selectorRow}
                onPress={() => setActivePicker("time")}
              >
                <ThemedText style={styles.label}>Time</ThemedText>
                <ThemedText style={styles.valueText}>
                  {formattedTime}
                </ThemedText>
              </Pressable>
              {activePicker && (
                <DateTimePicker
                  value={draft}
                  mode={activePicker}
                  display="default"
                  onChange={(event, selected) => {
                    if (event.type === "dismissed") {
                      setActivePicker(null);
                      return;
                    }
                    if (selected) {
                      setDraft((prev) =>
                        activePicker === "date"
                          ? applyDate(prev, selected)
                          : applyTime(prev, selected),
                      );
                    }
                    setActivePicker(null);
                  }}
                />
              )}
            </>
          )}
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.ghost]} onPress={onCancel}>
              <ThemedText style={styles.ghostText}>Cancel</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.button, styles.primary]}
              onPress={() => onConfirm(draft)}
            >
              <ThemedText style={styles.primaryText}>Save</ThemedText>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.6)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  pickerBlock: {
    gap: 6,
  },
  selectorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: "rgba(148,163,184,0.15)",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
  },
  valueText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: "center",
  },
  primary: {
    backgroundColor: "#8B5CF6",
  },
  ghost: {
    backgroundColor: "rgba(148,163,184,0.25)",
  },
  primaryText: {
    color: "#fff",
    fontWeight: "600",
  },
  ghostText: {
    color: "#111827",
    fontWeight: "600",
  },
});
