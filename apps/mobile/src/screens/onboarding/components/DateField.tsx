import React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  formatMobileUkInputDate,
  toMobileUtcDateIso,
} from "@/lib/format/date";
import { SelectionField } from "@/screens/onboarding/components/FormFields";
import { styles } from "@/screens/onboarding/styles";
import { PrimaryButton, SecondaryButton } from "./Buttons";

function buildDateFromParts(year: number, month: number, day: number) {
  return new Date(year, month, day);
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function normalizeDateValue(value: Date | string | null | undefined) {
  if (!value) return null;
  const normalized = value instanceof Date ? value : new Date(value);
  return Number.isNaN(normalized.getTime()) ? null : normalized;
}

export function DateField({
  label,
  value,
  onChange,
  error,
}: {
  error?: string;
  label: string;
  onChange: (val: string | null) => void;
  value: Date | string | null;
}) {
  const [visible, setVisible] = React.useState(false);
  const [activePart, setActivePart] = React.useState<"day" | "month" | "year">(
    "day",
  );
  const today = React.useMemo(() => new Date(), []);
  const normalizedValue = normalizeDateValue(value);
  const initial = normalizedValue ?? new Date(2000, 0, 1);
  const [draftYear, setDraftYear] = React.useState(initial.getFullYear());
  const [draftMonth, setDraftMonth] = React.useState(initial.getMonth());
  const [draftDay, setDraftDay] = React.useState(initial.getDate());

  React.useEffect(() => {
    const next = normalizeDateValue(value) ?? new Date(2000, 0, 1);
    setDraftYear(next.getFullYear());
    setDraftMonth(next.getMonth());
    setDraftDay(next.getDate());
    if (visible) {
      setActivePart("day");
    }
  }, [value, visible]);

  React.useEffect(() => {
    const maxDay = getDaysInMonth(draftYear, draftMonth);
    if (draftDay > maxDay) {
      setDraftDay(maxDay);
    }
  }, [draftDay, draftMonth, draftYear]);

  const currentYear = today.getFullYear();
  const years = React.useMemo(
    () =>
      Array.from(
        { length: currentYear - 1899 },
        (_, index) => currentYear - index,
      ),
    [currentYear],
  );
  const days = React.useMemo(
    () =>
      Array.from(
        { length: getDaysInMonth(draftYear, draftMonth) },
        (_, index) => index + 1,
      ),
    [draftMonth, draftYear],
  );

  const dateValue = normalizeDateValue(value);
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];

  const activeOptions =
    activePart === "day"
      ? days.map((day) => ({ label: String(day), value: day }))
      : activePart === "month"
        ? monthNames.map((month, index) => ({ label: month, value: index }))
        : years.map((year) => ({ label: String(year), value: year }));

  function applyActiveValue(nextValue: number) {
    if (activePart === "day") {
      setDraftDay(nextValue);
      return;
    }
    if (activePart === "month") {
      setDraftMonth(nextValue);
      return;
    }
    setDraftYear(nextValue);
  }

  const activeValue =
    activePart === "day"
      ? draftDay
      : activePart === "month"
        ? draftMonth
        : draftYear;

  return (
    <>
      <SelectionField
        label={label}
        value={dateValue ? formatMobileUkInputDate(dateValue) : null}
        placeholder={label}
        onPress={() => setVisible(true)}
        error={error}
      />
      <Modal
        transparent
        animationType="fade"
        visible={visible}
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <Text style={styles.modalSubtitle}>Select day, month and year</Text>
            <View style={styles.datePickerRow}>
              <Pressable
                style={[
                  styles.datePickerColumn,
                  activePart === "day" ? styles.datePickerColumnActive : null,
                ]}
                onPress={() => setActivePart("day")}
              >
                <Text style={styles.pickerLabel}>Day</Text>
                <Text style={styles.pickerValue}>{draftDay}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.datePickerColumn,
                  activePart === "month" ? styles.datePickerColumnActive : null,
                ]}
                onPress={() => setActivePart("month")}
              >
                <Text style={styles.pickerLabel}>Month</Text>
                <Text style={styles.pickerValue}>{monthNames[draftMonth]}</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.datePickerColumn,
                  activePart === "year" ? styles.datePickerColumnActive : null,
                ]}
                onPress={() => setActivePart("year")}
              >
                <Text style={styles.pickerLabel}>Year</Text>
                <Text style={styles.pickerValue}>{draftYear}</Text>
              </Pressable>
            </View>
            <View style={styles.optionPanel}>
              <Text style={styles.optionPanelTitle}>
                Choose {activePart}
              </Text>
              <ScrollView
                nestedScrollEnabled
                style={styles.optionList}
                contentContainerStyle={styles.optionListContent}
              >
                {activeOptions.map((option) => {
                  const selected = option.value === activeValue;
                  return (
                    <Pressable
                      key={`${activePart}-${option.value}`}
                      onPress={() => applyActiveValue(option.value)}
                      style={[
                        styles.optionItem,
                        selected ? styles.optionItemSelected : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.optionItemText,
                          selected ? styles.optionItemTextSelected : null,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <View style={styles.actionsRow}>
              {dateValue ? (
                <SecondaryButton
                  label="Clear"
                  onPress={() => {
                    onChange(null);
                    setVisible(false);
                  }}
                />
              ) : null}
              <SecondaryButton
                label="Cancel"
                onPress={() => setVisible(false)}
              />
              <PrimaryButton
                label="Save"
                onPress={() => {
                  onChange(
                    toMobileUtcDateIso(
                      buildDateFromParts(draftYear, draftMonth, draftDay),
                    ),
                  );
                  setVisible(false);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
