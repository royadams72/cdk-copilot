import { View } from "react-native";
import { ExerciseType } from "react-native-health-connect";

import { ThemedText } from "@/components/themed-text";

import { Card } from "../../dashboard/components/Card";
import type { DayEntry, MeasurementKind } from "../metricTrendTypes";
import {
  formatDateLabel,
  formatMinutes,
  formatTimeLabel,
} from "../metricTrendUtils";

type Props = {
  kind: MeasurementKind;
  selectedDateKey: string;
  selectedDayEntries: DayEntry[];
};

const EXERCISE_TYPE_LABELS = Object.entries(ExerciseType).reduce<
  Record<number, string>
>((acc, [key, value]) => {
  if (typeof value !== "number") {
    return acc;
  }
  acc[value] = key
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return acc;
}, {});

function exerciseEntryName(entry: DayEntry) {
  const title = entry.exerciseTitle?.trim();
  if (title && title.toLowerCase() !== "imported exercise") {
    return title;
  }

  const name = entry.exerciseName?.trim();
  if (name && name.toLowerCase() !== "imported exercise") {
    return name;
  }

  const match = entry.exerciseId?.match(/^health_connect_(\d+)$/);
  if (match) {
    const exerciseType = Number(match[1]);
    if (Number.isFinite(exerciseType)) {
      return EXERCISE_TYPE_LABELS[exerciseType] ?? "Exercise";
    }
  }

  return "Exercise";
}

export function MetricDayEntries({
  kind,
  selectedDateKey,
  selectedDayEntries,
}: Props) {
  return (
    <View
      style={{
        gap: 8,
        marginTop: 10,
      }}
    >
      <View>
        <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
          {formatDateLabel(new Date(`${selectedDateKey}T12:00:00`))}
        </ThemedText>
      </View>
      <View style={{ gap: 8 }}>
        {selectedDayEntries.length === 0 ? (
          <Card style={{ borderRadius: 10, padding: 10 }}>
            <ThemedText style={{ fontSize: 13, opacity: 0.72 }}>
              No readings for this day.
            </ThemedText>
          </Card>
        ) : (
          selectedDayEntries.map((entry, idx) => {
            const time = formatTimeLabel(entry.measuredAt);
            if (kind === "blood_pressure") {
              const sys =
                typeof entry.value === "number" ? Math.round(entry.value) : null;
              const dia =
                typeof entry.value2 === "number" ? Math.round(entry.value2) : null;
              return (
                <Card
                  key={`${entry.measuredAt}-${idx}`}
                  style={{ borderRadius: 10, gap: 3, padding: 10 }}
                >
                  <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
                    {sys ?? "--"}/{dia ?? "--"} mmHg
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                    {time}
                  </ThemedText>
                </Card>
              );
            }

            if (kind === "heart_rate") {
              const bpm =
                typeof entry.value === "number" ? Math.round(entry.value) : null;
              return (
                <Card
                  key={`${entry.measuredAt}-${idx}`}
                  style={{ borderRadius: 10, gap: 3, padding: 10 }}
                >
                  <ThemedText type="defaultSemiBold" style={{ fontSize: 18 }}>
                    {bpm ?? "--"} bpm
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                    {time}
                  </ThemedText>
                </Card>
              );
            }

            if (kind === "exercise") {
              const kcal =
                typeof entry.value === "number" ? Math.round(entry.value) : null;
              const mins =
                typeof entry.value2 === "number" ? Math.round(entry.value2) : null;
              const name = exerciseEntryName(entry);
              return (
                <Card
                  key={`${entry.measuredAt}-${idx}`}
                  style={{ borderRadius: 10, gap: 3, padding: 10 }}
                >
                  <ThemedText type="defaultSemiBold">{name}</ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                    {time}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13 }}>
                    {mins !== null ? `${mins} min` : "-- min"}
                    {kcal !== null && kcal > 0 ? ` • ${kcal} kcal` : ""}
                  </ThemedText>
                </Card>
              );
            }

            if (kind === "sleep") {
              const mins =
                typeof entry.value === "number" ? Math.round(entry.value) : null;
              const fromTime = entry.sleepFromAt
                ? formatTimeLabel(entry.sleepFromAt)
                : "--:--";
              const toTime = entry.sleepToAt
                ? formatTimeLabel(entry.sleepToAt)
                : "--:--";
              return (
                <Card
                  key={`${entry.measuredAt}-${idx}`}
                  style={{ borderRadius: 10, gap: 3, padding: 10 }}
                >
                  <ThemedText type="defaultSemiBold">{time}</ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                    From {fromTime}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 13 }}>To {toTime}</ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                    {mins !== null ? formatMinutes(mins) : "--"}
                  </ThemedText>
                </Card>
              );
            }

            const steps =
              typeof entry.value === "number"
                ? Math.round(entry.value).toLocaleString()
                : "--";
            return (
              <Card
                key={`${entry.measuredAt}-${idx}`}
                style={{ borderRadius: 10, gap: 3, padding: 10 }}
              >
                <ThemedText type="defaultSemiBold">Steps</ThemedText>
                <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>
                  {time}
                </ThemedText>
                <ThemedText style={{ fontSize: 13 }}>{steps} steps</ThemedText>
              </Card>
            );
          })
        )}
      </View>
    </View>
  );
}
