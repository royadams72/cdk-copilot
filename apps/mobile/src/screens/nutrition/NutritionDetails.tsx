import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import type { ScrollView as ScrollViewType } from "react-native";
import { useColorScheme } from "react-native";
import { useRouter } from "expo-router";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";
import type { TMealType } from "@ckd/core";

import { ThemedText } from "@/components/themed-text";
import { Card } from "../dashboard/components/Card";
import { NUTRITION_METRICS } from "../dashboard/constants";
import { formatDateShort, formatDecimal } from "../dashboard/utils";
import { styles } from "./styles";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  fetchDashboard,
  selectDashboardData,
  selectDashboardError,
  selectDashboardStatus,
} from "@/store/slices/dashboardSlice";

import { mealTypes, setMealType } from "@/store/slices/logMealSlice";
import type { FoodHighlight } from "../dashboard/types";

const CHART_HEIGHT = 240;
const CHART_PADDING = { top: 20, bottom: 40, left: 40, right: 20 } as const;
const CHART_VIEWPORT_WIDTH = Math.min(Dimensions.get("window").width - 64, 420);
const POINT_GAP = 56;

export default function NutritionDetails() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const dispatch = useAppDispatch();
  const data = useAppSelector(selectDashboardData);
  const status = useAppSelector(selectDashboardStatus);
  const error = useAppSelector(selectDashboardError);

  const [selectedMetricId, setSelectedMetricId] = useState(
    NUTRITION_METRICS[0]?.id ?? "protein",
  );
  const refreshing = status === "loading" && !!data;
  const loading = status === "loading" && !data;
  const chartScrollRef = useRef<ScrollViewType | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const metricConfig =
    NUTRITION_METRICS.find((metric) => metric.id === selectedMetricId) ??
    NUTRITION_METRICS[0];

  const chartSeries = useMemo(() => {
    if (!data?.nutrition.dailySeries) return [];
    return data.nutrition.dailySeries.map((point, index) => ({
      ...point,
      index,
      value: Math.max(point.totals[metricConfig.key] ?? 0, 0),
    }));
  }, [data, metricConfig.key]);

  const chartTarget = useMemo(() => {
    if (!data?.nutrition.radials) return null;
    const radial = data.nutrition.radials.find(
      (item) => item.id === metricConfig.id,
    );
    return radial?.target ?? null;
  }, [data, metricConfig.id]);

  const chartDomainMax = useMemo(() => {
    const values = chartSeries.map((point) => point.value);
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
  }, [chartSeries, chartTarget]);

  const targetLineOffset = useMemo(() => {
    if (chartTarget === null || chartDomainMax <= 0) {
      return null;
    }
    const ratio = Math.min(Math.max(chartTarget / chartDomainMax, 0), 1);
    const drawableHeight =
      CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    return CHART_PADDING.top + drawableHeight * (1 - ratio);
  }, [chartTarget, chartDomainMax]);

  const chartContentWidth = useMemo(() => {
    if (!chartSeries.length) {
      return CHART_VIEWPORT_WIDTH;
    }
    const effectiveWidth =
      chartSeries.length > 1
        ? (chartSeries.length - 1) * POINT_GAP
        : CHART_VIEWPORT_WIDTH / 2;
    const innerWidth = Math.max(
      CHART_VIEWPORT_WIDTH - (CHART_PADDING.left + CHART_PADDING.right),
      effectiveWidth,
    );
    return innerWidth + CHART_PADDING.left + CHART_PADDING.right;
  }, [chartSeries.length]);

  const chartPoints = useMemo(() => {
    if (!chartSeries.length) return [];
    const innerWidth =
      chartContentWidth - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const denominator = chartSeries.length > 1 ? chartSeries.length - 1 : 1;

    return chartSeries.map((point, index) => {
      const xRatio = chartSeries.length === 1 ? 0.5 : index / denominator;
      const value = Math.max(point.value, 0);
      const yRatio =
        chartDomainMax > 0 ? Math.min(value / chartDomainMax, 1) : 0;
      return {
        ...point,
        chartX: CHART_PADDING.left + innerWidth * xRatio,
        chartY: CHART_PADDING.top + innerHeight * (1 - yRatio),
      };
    });
  }, [chartSeries, chartDomainMax, chartContentWidth]);

  useEffect(() => {
    if (!chartSeries.length) return;
    setSelectedPointIndex(chartSeries.length - 1);
  }, [chartSeries.length]);

  useEffect(() => {
    if (!chartScrollRef.current) return;
    chartScrollRef.current.scrollTo({
      x: Math.max(chartContentWidth - CHART_VIEWPORT_WIDTH, 0),
      animated: false,
    });
  }, [chartContentWidth, chartSeries.length]);

  const selectedPoint =
    selectedPointIndex !== null ? chartSeries[selectedPointIndex] : null;

  const highlightDate =
    selectedPoint?.date ?? data?.nutrition.foodHighlights.latestDate ?? null;

  const { highlights, hasHighlightBucket } = useMemo(() => {
    if (!highlightDate) {
      return { highlights: [] as FoodHighlight[], hasHighlightBucket: false };
    }
    const dayBucket =
      data?.nutrition.foodHighlights.itemsByDate?.[highlightDate];
    if (!dayBucket) {
      return { highlights: [] as FoodHighlight[], hasHighlightBucket: false };
    }
    return {
      highlights: dayBucket[metricConfig.key] ?? [],
      hasHighlightBucket: true,
    };
  }, [data, highlightDate, metricConfig.key]);

  const highlightTitle = buildHighlightTitle(metricConfig.label, highlightDate);

  const highlightFallbackMessage = buildHighlightFallbackMessage(
    metricConfig.label,
    highlightDate,
    hasHighlightBucket,
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
    <View style={styles.screen}>
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
            <TouchableOpacity
              style={styles.logButton}
              onPress={() => setIsLogModalOpen(true)}
            >
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
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRefresh}
            >
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
                    metricConfig.unit,
                  )}
                </ThemedText>
              </View>
              <View style={styles.chartWrap}>
                <ScrollView
                  horizontal
                  ref={chartScrollRef}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ width: chartContentWidth }}
                >
                  <View
                    style={[
                      styles.chartInner,
                      { width: chartContentWidth, height: CHART_HEIGHT },
                    ]}
                  >
                    <Svg width={chartContentWidth} height={CHART_HEIGHT}>
                      <Line
                        x1={CHART_PADDING.left}
                        y1={CHART_HEIGHT - CHART_PADDING.bottom}
                        x2={chartContentWidth - CHART_PADDING.right}
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
                            x2={chartContentWidth - CHART_PADDING.right}
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
                          x2={chartContentWidth - CHART_PADDING.right}
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
                          key={`dot-${point.chartX}`}
                          cx={point.chartX}
                          cy={point.chartY}
                          r={4}
                          fill={
                            point.index === selectedPointIndex
                              ? metricConfig.color
                              : "#fff"
                          }
                          stroke={
                            point.index === selectedPointIndex
                              ? "#fff"
                              : metricConfig.color
                          }
                          strokeWidth={2}
                          onPress={() => setSelectedPointIndex(point.index)}
                        />
                      ))}
                      {chartPoints.map((point) => (
                        <SvgText
                          key={`label-${point.chartX}`}
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
                </ScrollView>
              </View>
              {chartTarget !== null ? (
                <View style={styles.targetBadge}>
                  <ThemedText style={styles.targetBadgeText}>
                    Target {formatChartValue(chartTarget, metricConfig.unit)}
                  </ThemedText>
                </View>
              ) : null}
              {selectedPoint && (
                <ThemedText style={styles.helperText}>
                  Showing {formatFullDate(selectedPoint.date)}
                </ThemedText>
              )}
            </Card>

            {selectedPoint ? (
              <Card>
                <View style={styles.cardHeader}>
                  <ThemedText type="defaultSemiBold">Daily totals</ThemedText>
                  <ThemedText style={styles.helperText}>
                    {formatFullDate(selectedPoint.date)}
                  </ThemedText>
                </View>
                <View style={styles.summaryGrid}>
                  {NUTRITION_METRICS.map((metric) => (
                    <View key={metric.id} style={styles.summaryRow}>
                      <ThemedText style={styles.summaryLabel}>
                        {metric.label}
                      </ThemedText>
                      <ThemedText style={styles.summaryValue}>
                        {formatChartValue(
                          selectedPoint.totals?.[metric.key] ?? 0,
                          metric.unit,
                        )}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </Card>
            ) : null}

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
                  {highlights.map((item, index) => {
                    return (
                      <FoodRow
                        key={`${item.name}-${index}`}
                        item={item}
                        metricUnit={metricConfig.unit}
                        color={metricConfig.color}
                      />
                    );
                  })}
                </View>
              ) : (
                <ThemedText style={styles.helperText}>
                  {highlightFallbackMessage}
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
              Start tracking your meals to unlock protein, phosphorus,
              potassium, and sodium insights.
            </ThemedText>
          </Card>
        )}
      </ScrollView>
      <Modal
        transparent
        animationType="fade"
        visible={isLogModalOpen}
        onRequestClose={() => setIsLogModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, theme === "dark" && styles.modalCardDark]}
          >
            <ThemedText type="defaultSemiBold">Log your meal?</ThemedText>
            <ThemedText style={styles.helperText}>
              Add foods to your diary to keep your nutrition targets on track.
            </ThemedText>
            <View style={styles.modalActions}>
              {mealTypes.map((mealType) => (
                <TouchableOpacity
                  key={mealType.value}
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={() => {
                    dispatch(setMealType({ mealType: mealType.value }));
                    setIsLogModalOpen(false);
                    router.push("/(log-meal)/log-meal");
                  }}
                >
                  <ThemedText style={styles.modalButtonTextPrimary}>
                    {mealType.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonGhost]}
                onPress={() => setIsLogModalOpen(false)}
              >
                <ThemedText style={styles.modalButtonTextGhost}>
                  Not now
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatChartValue(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value ?? NaN)) {
    return `0 ${unit}`;
  }
  const decimals = unit === "g" ? 1 : 0;
  return `${formatDecimal(value ?? 0, decimals)} ${unit}`;
}

function formatFullDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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
    isoDate,
  )} with highest ${label.toLowerCase()}`;
}

function buildHighlightFallbackMessage(
  label: string,
  isoDate: string | null,
  hasDataForDay: boolean,
) {
  if (!isoDate) {
    return "Log your meals to unlock food highlights.";
  }
  if (!hasDataForDay) {
    return `No meals logged on ${formatFullDate(isoDate)}.`;
  }
  return `No ${label.toLowerCase()} highlights logged on ${formatFullDate(
    isoDate,
  )}.`;
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
