import { useColorScheme } from "@/hooks/use-color-scheme";
import { DashboardRadial } from "../types";
import { ThemedText } from "@/components/themed-text";
import React from "react";
import { View, useWindowDimensions } from "react-native";
import Svg, { G, Circle, Path } from "react-native-svg";
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
  const { width } = useWindowDimensions();
  const isCompactLayout = width < 430;
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
      <View
        style={[
          styles.stackedLayout,
          isCompactLayout && styles.stackedLayoutCompact,
        ]}
      >
        <View
          style={[
            styles.legendColumn,
            isCompactLayout && styles.legendColumnCompact,
          ]}
        >
          {decorated.map((radial) => (
            <View key={radial.id} style={styles.legendRow}>
              <View
                style={[styles.legendDot, { backgroundColor: radial.color }]}
              />
              <View style={styles.legendCopy}>
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
        <View
          style={[
            styles.stackedChartWrap,
            isCompactLayout && styles.stackedChartWrapCompact,
          ]}
        >
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
  radials: (DashboardRadial & { color: string })[];
  trackColor: string;
  textColor: string;
}) {
  const maxRadius = STACKED_SIZE / 2 - STACKED_STROKE / 2;
  const center = STACKED_SIZE / 2;

  return (
    <View style={styles.stackedChart}>
      <Svg width={STACKED_SIZE} height={STACKED_SIZE}>
        <G>
          {radials.map((radial, index) => {
            const radius = maxRadius - index * (STACKED_STROKE + STACKED_GAP);
            if (radius <= STACKED_STROKE / 2) return null;
            const rawPercent =
              radial.percent !== null && radial.percent !== undefined
                ? Math.max(radial.percent, 0)
                : 0;
            const percent = Math.min(rawPercent, 1);
            const overTargetPercent = clampValue(rawPercent - 1, 0, 1);
            const overTargetColor = darkenHexColor(radial.color, 0.68);
            return (
              <React.Fragment key={radial.id}>
                <Circle
                  cx={center}
                  cy={center}
                  r={radius}
                  stroke={trackColor}
                  strokeWidth={STACKED_STROKE}
                  fill="transparent"
                />
                {percent >= 0.999 ? (
                  <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={radial.color}
                    strokeWidth={STACKED_STROKE}
                    fill="transparent"
                  />
                ) : percent > 0 ? (
                  <Path
                    d={describeArc(center, center, radius, percent)}
                    stroke={radial.color}
                    strokeWidth={STACKED_STROKE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="transparent"
                  />
                ) : null}
                {overTargetPercent >= 0.999 ? (
                  <Circle
                    cx={center}
                    cy={center}
                    r={radius}
                    stroke={overTargetColor}
                    strokeWidth={STACKED_STROKE}
                    fill="transparent"
                  />
                ) : overTargetPercent > 0 ? (
                  <Path
                    d={describeArc(center, center, radius, overTargetPercent)}
                    stroke={overTargetColor}
                    strokeWidth={STACKED_STROKE}
                    strokeLinecap="round"
                    strokeLinejoin="round"
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
  return Math.round(Math.max(value, 0) * 100);
}

function darkenHexColor(color: string, factor: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) =>
    Math.round(((value >> shift) & 0xff) * factor)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function clampValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describeArc(
  centerX: number,
  centerY: number,
  radius: number,
  percent: number,
) {
  const safePercent = clampValue(percent, 0, 0.9999);
  const startAngle = 0;
  const endAngle = safePercent * 360;
  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`,
  ].join(" ");
}
