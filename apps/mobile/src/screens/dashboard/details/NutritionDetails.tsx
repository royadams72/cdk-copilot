import { useMemo, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Card } from "../copmonents/Card";
import { NUTRITION_METRICS } from "../constants";
import { formatDateShort, formatDecimal } from "../utils";
import { styles } from "./styles";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  selectDashboardData,
  selectDashboardError,
  selectDashboardStatus,
} from "@/store/selectors";
import { fetchDashboard } from "@/store/slices/dashboardSlice";
import type {
  FoodHighlight,
  NutritionDailyPoint,
  NutritionMetricKey,
} from "../types";

const CHART_HEIGHT = 240;
const CHART_PADDING = { top: 20, bottom: 40, left: 40, right: 20 } as const;

const CHART_WIDTH = Math.min(Dimensions.get("window").width - 64, 420);

export default function NutritionDetails() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const error = useAppSelector(selectDashboardError);
  const [selectedMetricId, setSelectedMetricId] = useState(
    NUTRITION_METRICS[0]?.id ?? "protein"
  );
  const refreshing = status === "loading" && !!data;
  const loading = status === "loading" && !data;
  const metricConfig =
    NUTRITION_METRICS.find((metric) => metric.id === selectedMetricId) ??
    NUTRITION_METRICS[0];

  const chartData = useMemo(() => {
    if (!data?.nutrition.dailySeries) return [];
    return data.nutrition.dailySeries.map((point, index) =>
      mapPointToChart(point, metricConfig.key, index)
    );
  }, [data, metricConfig.key]);

  const chartTarget = useMemo(() => {
    if (!data?.nutrition.radials) return null;
    const radial = data.nutrition.radials.find(
      (item) => item.id === metricConfig.id
    );
    return radial?.target ?? null;
  }, [data, metricConfig.id]);

  const highlights = useMemo(() => {
    if (!data?.nutrition.foodHighlights?.items) return [];
    return data.nutrition.foodHighlights.items[metricConfig.key] ?? [];
  }, [data, metricConfig.key]);

  const chartDomainMax = useMemo(() => {
    const values = chartData.map((point) => point.y);
    const targetValue =
      typeof chartTarget === "number" && Number.isFinite(chartTarget)
        ? chartTarget
        : null;
    if (targetValue !== null) {
      values.push(targetValue);
    }
    const maxValue = values.length ? Math.max(...values) : 0;
    if (maxValue <= 0) {
      return 1;
    }
    return maxValue * 1.15;
  }, [chartData, chartTarget]);

  const targetLineOffset = useMemo(() => {
    if (chartTarget === null || chartDomainMax <= 0) {
      return null;
    }
    const ratio = Math.min(Math.max(chartTarget / chartDomainMax, 0), 1);
    const drawableHeight =
      CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    return CHART_PADDING.top + drawableHeight * (1 - ratio);
  }, [chartTarget, chartDomainMax]);

  const chartPoints = useMemo(() => {
    if (!chartData.length) return [];
    const innerWidth = CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const denominator = chartData.length > 1 ? chartData.length - 1 : 1;

    return chartData.map((point, index) => {
      const xRatio = chartData.length === 1 ? 0.5 : index / denominator;
      const value = Math.max(point.y, 0);
      const yRatio =
        chartDomainMax > 0 ? Math.min(value / chartDomainMax, 1) : 0;
      return {
        ...point,
        chartX: CHART_PADDING.left + innerWidth * xRatio,
        chartY: CHART_PADDING.top + innerHeight * (1 - yRatio),
      };
    });
  }, [chartData, chartDomainMax]);

  const highlightTitle = buildHighlightTitle(
    metricConfig.label,
    data?.nutrition.foodHighlights?.date ?? null
  );

  const handleRefresh = useCallback(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading your nutrition data...
        </ThemedText>
      </View>
    );
  }

  const canRender = Boolean(data?.nutrition.dailySeries?.length);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      <View style={styles.header}>
        <View style={styles.navRow}>
          <TouchableOpacity
            accessibilityRole="button"
            onPress={() => router.back()}
            style={styles.navButton}
          >
            <ThemedText style={styles.navButtonText}>‹ Back</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logButton}>
            <ThemedText style={styles.logButtonText}>Log meal</ThemedText>
          </TouchableOpacity>
        </View>
        <ThemedText type="title">Nutrition</ThemedText>
        <ThemedText style={styles.helperText}>
          Track how your meals contribute to renal targets.
        </ThemedText>
      </View>

      {error && status === "failed" && (
        <Card>
          <ThemedText type="defaultSemiBold">
            We couldn't refresh your nutrition data
          </ThemedText>
          <ThemedText style={styles.helperText}>{error}</ThemedText>
          <TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
            <ThemedText style={styles.retryText}>Retry</ThemedText>
          </TouchableOpacity>
        </Card>
      )}

      {canRender ? (
        <>
          <Card>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">Weekly intake</ThemedText>
              <ThemedText style={styles.helperText}>
                Last {data?.nutrition.range.days ?? 7} days
              </ThemedText>
            </View>
            <View style={styles.chartLegend}>
              <ThemedText style={styles.legendMetric}>
                {metricConfig.label}
              </ThemedText>
              <ThemedText style={styles.legendValue}>
                {formatChartValue(
                  data?.nutrition.totals?.[metricConfig.key],
                  metricConfig.unit
                )}
              </ThemedText>
            </View>
            <View style={styles.chartWrap}>
              <View
                style={[
                  styles.chartInner,
                  { width: CHART_WIDTH, height: CHART_HEIGHT },
                ]}
              >
                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                  <Line
                    x1={CHART_PADDING.left}
                    y1={CHART_HEIGHT - CHART_PADDING.bottom}
                    x2={CHART_WIDTH - CHART_PADDING.right}
                    y2={CHART_HEIGHT - CHART_PADDING.bottom}
                    stroke={theme === "light" ? "#CBD5F5" : "#475569"}
                    strokeWidth={1}
                  />
                  <Line
                    x1={CHART_PADDING.left}
                    y1={CHART_PADDING.top}
                    x2={CHART_PADDING.left}
                    y2={CHART_HEIGHT - CHART_PADDING.bottom}
                    stroke={theme === "light" ? "#CBD5F5" : "#475569"}
                    strokeWidth={1}
                  />
                  {[0.25, 0.5, 0.75].map((ratio) => {
                    const y =
                      CHART_PADDING.top +
                      (CHART_HEIGHT -
                        CHART_PADDING.top -
                        CHART_PADDING.bottom) *
                        ratio;
                    return (
                      <Line
                        key={`grid-${ratio}`}
                        x1={CHART_PADDING.left}
                        x2={CHART_WIDTH - CHART_PADDING.right}
                        y1={y}
                        y2={y}
                        stroke={
                          theme === "light"
                            ? "rgba(148,163,184,0.35)"
                            : "rgba(148,163,184,0.2)"
                        }
                        strokeWidth={1}
                      />
                    );
                  })}
                  {targetLineOffset !== null ? (
                    <Line
                      x1={CHART_PADDING.left}
                      x2={CHART_WIDTH - CHART_PADDING.right}
                      y1={targetLineOffset}
                      y2={targetLineOffset}
                      stroke="rgba(99,102,241,0.85)"
                      strokeWidth={2}
                      strokeDasharray="6,4"
                    />
                  ) : null}
                  {chartPoints.length > 1 ? (
                    <Polyline
                      points={chartPoints
                        .map((point) => `${point.chartX},${point.chartY}`)
                        .join(" ")}
                      fill="none"
                      stroke={metricConfig.color}
                      strokeWidth={3}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {chartPoints.map((point) => (
                    <Circle
                      key={`dot-${point.x}`}
                      cx={point.chartX}
                      cy={point.chartY}
                      r={4}
                      fill="#fff"
                      stroke={metricConfig.color}
                      strokeWidth={2}
                      onPress={() => console.log("Circle pressed")}
                    />
                  ))}
                  {chartPoints.map((point) => (
                    <SvgText
                      key={`label-${point.x}`}
                      x={point.chartX}
                      y={CHART_HEIGHT - CHART_PADDING.bottom + 16}
                      fontSize={12}
                      fill={theme === "light" ? "#1F2937" : "#E2E8F0"}
                      alignmentBaseline="hanging"
                      textAnchor="middle"
                    >
                      {point.label}
                    </SvgText>
                  ))}
                </Svg>
              </View>
            </View>
            {chartTarget !== null ? (
              <View style={styles.targetBadge}>
                <ThemedText style={styles.targetBadgeText}>
                  Target {formatChartValue(chartTarget, metricConfig.unit)}
                </ThemedText>
              </View>
            ) : null}
          </Card>

          <View style={styles.metricRow}>
            {NUTRITION_METRICS.map((metric) => {
              const isActive = metric.id === metricConfig.id;
              return (
                <TouchableOpacity
                  key={metric.id}
                  onPress={() => setSelectedMetricId(metric.id)}
                  style={[
                    styles.metricButton,
                    isActive && { backgroundColor: metric.color },
                  ]}
                >
                  <ThemedText
                    style={[
                      styles.metricButtonText,
                      isActive && styles.metricButtonTextActive,
                    ]}
                  >
                    {metric.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <Card>
            <View style={styles.cardHeader}>
              <ThemedText type="defaultSemiBold">{highlightTitle}</ThemedText>
              <ThemedText style={styles.helperText}>
                Highest {metricConfig.label.toLowerCase()} sources
              </ThemedText>
            </View>
            {highlights.length ? (
              <View style={styles.foodList}>
                {highlights.map((item, index) => (
                  <FoodRow
                    key={`${item.name}-${index}`}
                    item={item}
                    metricUnit={metricConfig.unit}
                    color={metricConfig.color}
                  />
                ))}
              </View>
            ) : (
              <ThemedText style={styles.helperText}>
                No meals logged for this day yet.
              </ThemedText>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <ThemedText type="defaultSemiBold">
            No meals logged this week
          </ThemedText>
          <ThemedText style={styles.helperText}>
            Start tracking your meals to unlock protein, phosphorus, potassium,
            and sodium insights.
          </ThemedText>
        </Card>
      )}
    </ScrollView>
  );
}

function mapPointToChart(
  point: NutritionDailyPoint,
  key: NutritionMetricKey,
  index: number
) {
  const value = point.totals[key] ?? 0;
  return {
    x: index,
    label: point.label,
    y: value > 0 ? Number(value.toFixed(1)) : 0,
  };
}

function formatChartValue(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value ?? NaN)) {
    return `0 ${unit}`;
  }
  const decimals = unit === "g" ? 1 : 0;
  return `${formatDecimal(value ?? 0, decimals)} ${unit}`;
}

function buildHighlightTitle(label: string, isoDate: string | null) {
  if (!isoDate) {
    return `Foods with highest ${label.toLowerCase()}`;
  }
  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) {
    return `Foods with highest ${label.toLowerCase()}`;
  }
  if (isToday(date)) {
    return `Foods for today with highest ${label.toLowerCase()}`;
  }
  return `Foods for ${formatDateShort(
    isoDate
  )} with highest ${label.toLowerCase()}`;
}

function isToday(date: Date) {
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function FoodRow({
  item,
  metricUnit,
  color,
}: {
  item: FoodHighlight;
  metricUnit: string;
  color: string;
}) {
  return (
    <View style={styles.foodRow}>
      <View style={{ flex: 1 }}>
        <ThemedText type="defaultSemiBold">{item.name}</ThemedText>
        <ThemedText style={styles.foodMeta}>{formatFoodMeta(item)}</ThemedText>
        <ThemedText style={styles.helperText}>
          Adds {formatChartValue(item.amount, metricUnit)} to your day.
        </ThemedText>
      </View>
      <ThemedText style={[styles.foodAmount, { color }]}>
        {formatChartValue(item.amount, metricUnit)}
      </ThemedText>
    </View>
  );
}

function formatFoodMeta(item: FoodHighlight) {
  const bits: string[] = [];
  if (item.mealType) {
    bits.push(capitalize(item.mealType));
  }
  if (item.eatenAt) {
    bits.push(formatTime(item.eatenAt));
  }
  return bits.length ? bits.join(" • ") : "Logged meal";
}

function formatTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}
