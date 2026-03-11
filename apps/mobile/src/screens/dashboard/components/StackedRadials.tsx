import { useColorScheme } from "@/hooks/use-color-scheme.web";
import { DashboardRadial } from "../types";
import { ThemedText } from "@/components/themed-text";
import React from "react";
import { View } from "react-native";
import { clamp } from "react-native-reanimated";
import Svg, { G, Circle } from "react-native-svg";
import { styles } from "../styles";
import { Card } from "./Card";
import {
  STACKED_COLORS,
  STACKED_GAP,
  STACKED_SIZE,
  STACKED_STROKE,
} from "../constants";

export function StackedRadialsCard({
  radials,
  title = "Diet",
  subtitle = "Weekly intake",
  centerLabel = "Intake",
}: {
  centerLabel?: string;
  radials: DashboardRadial[];
  subtitle?: string;
  title?: string;
}) {
  const theme = useColorScheme() ?? "light";
  const trackColor = theme === "light" ? "#E5E7EB" : "rgba(255,255,255,0.2)";
  const textColor = theme === "light" ? "#111827" : "#F5F5F5";
  const decorated = radials.map((radial, index) => ({
    ...radial,
    color: STACKED_COLORS[index % STACKED_COLORS.length],
  }));

  return (
    <Card style={styles.stackedRadialCard}>
      <View style={styles.stackedHeader}>
        <ThemedText type="defaultSemiBold">{title}</ThemedText>
        <ThemedText style={styles.subtleText}>{subtitle}</ThemedText>
      </View>
      <View style={styles.stackedLayout}>
        <View style={styles.legendColumn}>
          {decorated.map((radial) => (
            <View key={radial.id} style={styles.legendRow}>
              <View
                style={[styles.legendDot, { backgroundColor: radial.color }]}
              />
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.legendLabel}>
                  {radial.label}
                </ThemedText>
                <ThemedText style={styles.legendSubtext}>
                  {legendValue(radial)}
                </ThemedText>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.stackedChartWrap}>
          <StackedRadialChart
            centerLabel={centerLabel}
            radials={decorated}
            trackColor={trackColor}
            textColor={textColor}
          />
        </View>
      </View>
    </Card>
  );
}

function legendValue(radial: DashboardRadial) {
  if (radial.percent !== null && radial.percent !== undefined) {
    return `${toDisplayPercent(radial.percent)}%`;
  }
  if (radial.actual !== null && radial.actual !== undefined) {
    return `${String(radial.actual)} ${radial.unit}`;
  }
  return "No data";
}

function StackedRadialChart({
  centerLabel,
  radials,
  trackColor,
  textColor,
}: {
  centerLabel: string;
  radials: Array<DashboardRadial & { color: string }>;
  trackColor: string;
  textColor: string;
}) {
  const maxRadius = STACKED_SIZE / 2 - STACKED_STROKE / 2;

  return (
    <View style={styles.stackedChart}>
      <Svg width={STACKED_SIZE} height={STACKED_SIZE}>
        <G rotation="-90" originX={STACKED_SIZE / 2} originY={STACKED_SIZE / 2}>
          {radials.map((radial, index) => {
            const radius = maxRadius - index * (STACKED_STROKE + STACKED_GAP);
            if (radius <= STACKED_STROKE / 2) return null;
            const circumference = 2 * Math.PI * radius;
            const percent =
              radial.percent !== null && radial.percent !== undefined
                ? clamp(radial.percent, 0, 1)
                : 0;
            const displayPercent = toDisplayPercent(percent);
            return (
              <React.Fragment key={radial.id}>
                <Circle
                  cx={STACKED_SIZE / 2}
                  cy={STACKED_SIZE / 2}
                  r={radius}
                  stroke={trackColor}
                  strokeWidth={STACKED_STROKE}
                  fill="transparent"
                />
                {displayPercent > 0 ? (
                  <Circle
                    cx={STACKED_SIZE / 2}
                    cy={STACKED_SIZE / 2}
                    r={radius}
                    stroke={radial.color}
                    strokeWidth={STACKED_STROKE}
                    strokeLinecap="round"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={circumference * (1 - percent)}
                    fill="transparent"
                  />
                ) : null}
              </React.Fragment>
            );
          })}
        </G>
      </Svg>
      <ThemedText style={[styles.centerLabel, { color: textColor }]}>
        {centerLabel}
      </ThemedText>
    </View>
  );
}

function toDisplayPercent(value: number) {
  return Math.round(clamp(value, 0, 1) * 100);
}
