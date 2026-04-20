import { useEffect, useMemo, useState } from "react";
import { Pressable, View } from "react-native";

import { ThemedText } from "@/components/themed-text";

type Props = {
  color?: string;
  emptyLabel: string;
  formatSelectedValue: (value: number | null) => string;
  label: string;
  values: (number | null)[];
};

const CHART_HEIGHT = 132;
const LABEL_TICKS = [
  { hour: 0, label: "0" },
  { hour: 6, label: "6" },
  { hour: 12, label: "12" },
  { hour: 18, label: "18" },
  { hour: 23, label: "23" },
];

export function MetricHourlyBarChart({
  color = "#2563EB",
  emptyLabel,
  formatSelectedValue,
  label,
  values,
}: Props) {
  const maxValue = values.reduce<number>((max, value) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return max;
    }
    return Math.max(max, value);
  }, 0);

  const defaultIndex = useMemo(() => {
    let selectedIndex = -1;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index];
      if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        selectedIndex = index;
        break;
      }
    }
    return selectedIndex >= 0 ? selectedIndex : null;
  }, [values]);
  const [activeIndex, setActiveIndex] = useState<number | null>(defaultIndex);

  useEffect(() => {
    setActiveIndex(defaultIndex);
  }, [defaultIndex]);

  const activeValue =
    activeIndex !== null ? (values[activeIndex] ?? null) : null;

  return (
    <View style={{ gap: 10, marginTop: 14 }}>
      <View style={{ gap: 4 }}>
        <ThemedText style={{ fontSize: 12, opacity: 0.72 }}>{label}</ThemedText>
        <ThemedText type="defaultSemiBold" style={{ fontSize: 16 }}>
          {activeIndex !== null
            ? `${String(activeIndex).padStart(2, "0")}:00 • ${formatSelectedValue(
                activeValue,
              )}`
            : emptyLabel}
        </ThemedText>
      </View>

      <View style={{ gap: 8 }}>
        <View
          style={{
            alignItems: "flex-end",
            flexDirection: "row",
            gap: 4,
            height: CHART_HEIGHT,
          }}
        >
          {values.map((value, index) => {
            const numeric =
              typeof value === "number" && Number.isFinite(value)
                ? value
                : null;
            const barHeight =
              numeric !== null && maxValue > 0
                ? Math.max(6, (numeric / maxValue) * CHART_HEIGHT)
                : 0;

            return (
              <Pressable
                key={`hour-${index}`}
                onPress={() => setActiveIndex(index)}
                style={{
                  alignItems: "center",
                  flex: 1,
                  height: CHART_HEIGHT,
                  justifyContent: "flex-end",
                }}
              >
                <View
                  style={{
                    backgroundColor: numeric !== null ? color : "transparent",
                    borderRadius: 5,
                    height: barHeight,
                    opacity:
                      numeric === null
                        ? 0
                        : activeIndex === null || activeIndex === index
                          ? 1
                          : 0.26,
                    width: "100%",
                  }}
                />
              </Pressable>
            );
          })}
        </View>

        <View style={{ height: 14, position: "relative" }}>
          {LABEL_TICKS.map((tick) => (
            <View
              key={`tick-${tick.hour}`}
              style={{
                left: `${(tick.hour / 23) * 100}%`,
                position: "absolute",
                transform: [{ translateX: -10 }],
                width: 20,
              }}
            >
              <ThemedText
                style={{ fontSize: 10, opacity: 0.65, textAlign: "center" }}
              >
                {tick.label}
              </ThemedText>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}
