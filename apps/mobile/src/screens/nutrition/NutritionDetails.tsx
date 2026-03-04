import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import type { TMealType } from "@ckd/core";

import { ThemedText } from "@/components/themed-text";
import { FoodCard } from "@/components/food-card";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { Card } from "../dashboard/components/Card";
import { NUTRITION_METRICS } from "../dashboard/constants";
import { formatDateShort, formatDecimal } from "../dashboard/utils";
import { styles } from "./styles";
import { useAppDispatch } from "@/store/hooks";
import {
  toQueryErrorMessage,
  useGetDashboardQuery,
} from "@/store/services/dashboardApi";

import {
  deleteMealData,
  hydrateMealFromEntry,
  mealTypes,
  setMealType,
} from "@/store/slices/logMealSlice";
import type { FoodHighlight } from "../dashboard/types";
import { RatioCard } from "../dashboard/components/RatioCard";
import { AccordionCard } from "../dashboard/components/AccordionCard";

const CHART_HEIGHT = 240;
const CHART_PADDING = { bottom: 40, left: 40, right: 20, top: 20 } as const;
const CHART_VIEWPORT_WIDTH = Math.min(Dimensions.get("window").width - 64, 420);
const POINT_GAP = 56;

export default function NutritionDetails() {
  const router = useRouter();
  const theme = useColorScheme() ?? "light";
  const dispatch = useAppDispatch();
  const { data, error, isFetching, isLoading, refetch } =
    useGetDashboardQuery("all", {
      refetchOnFocus: true,
      refetchOnMountOrArgChange: true,
    });
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your nutrition data",
  );

  const [selectedMetricId, setSelectedMetricId] = useState(
    NUTRITION_METRICS[0]?.id ?? "protein",
  );
  const refreshing = isFetching && !!data;
  const loading = isLoading && !data;
  const chartScrollRef = useRef<ScrollViewType | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const metricConfig =
    NUTRITION_METRICS.find((metric) => metric.id === selectedMetricId) ??
    NUTRITION_METRICS[0];

  const chartSeries = useMemo(() => {
    if (!data?.nutrition.dailySeries) return [];
    return data.nutrition.dailySeries.map((point, index) => ({
      ...point,
      index,
      value: Math.max(metricValue(point.totals, metricConfig.key), 0),
    }));
  }, [data, metricConfig.key]);

  const chartTarget = useMemo(() => {
    if (metricConfig.key === "phosphorus_protein_ratio") {
      const ratioTarget = data?.nutrition.ratio?.target;
      return typeof ratioTarget === "number" && Number.isFinite(ratioTarget)
        ? ratioTarget
        : null;
    }
    if (!data?.nutrition.radials) return null;
    const radial = data.nutrition.radials.find(
      (item) => item.id === metricConfig.id,
    );
    return radial?.target ?? null;
  }, [data, metricConfig.id, metricConfig.key]);

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
      animated: false,
      x: Math.max(chartContentWidth - CHART_VIEWPORT_WIDTH, 0),
    });
  }, [chartContentWidth, chartSeries.length]);

  const selectedPoint =
    selectedPointIndex !== null ? chartSeries[selectedPointIndex] : null;

  const highlightDate =
    selectedPoint?.date ?? data?.nutrition.foodHighlights.latestDate ?? null;

  const { highlights, hasHighlightBucket } = useMemo(() => {
    if (!highlightDate) {
      return { hasHighlightBucket: false, highlights: [] as FoodHighlight[] };
    }
    const dayBucket =
      data?.nutrition.foodHighlights.itemsByDate?.[highlightDate];
    if (!dayBucket) {
      return { hasHighlightBucket: false, highlights: [] as FoodHighlight[] };
    }
    return {
      hasHighlightBucket: true,
      highlights: dayBucket[metricConfig.key] ?? [],
    };
  }, [data, highlightDate, metricConfig.key]);

  const highlightTitle = buildHighlightTitle(metricConfig.label, highlightDate);

  const highlightFallbackMessage = buildHighlightFallbackMessage(
    metricConfig.label,
    highlightDate,
    hasHighlightBucket,
  );
  const mealsForDay = useMemo(() => {
    if (!highlightDate) return [];
    return data?.nutrition.mealsByDate?.[highlightDate] ?? [];
  }, [data, highlightDate]);

  useEffect(() => {
    if (mealsForDay.length === 0) {
      setIsEditModalOpen(false);
    }
  }, [mealsForDay.length]);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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

        {error && (
          <Card>
            <ThemedText type="defaultSemiBold">
              We couldn't refresh your nutrition data
            </ThemedText>
            <ThemedText style={styles.helperText}>{errorMessage}</ThemedText>
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
                <ThemedText type="defaultSemiBold">Nutrition intake</ThemedText>
                <ThemedText style={styles.helperText}>
                  Since{" "}
                  {new Date(
                    data?.nutrition.range.from ?? Date.now(),
                  ).toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
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
                      { height: CHART_HEIGHT, width: chartContentWidth },
                    ]}
                  >
                    <TrendLineChart
                      width={chartContentWidth}
                      height={CHART_HEIGHT}
                      padding={CHART_PADDING}
                      lineColor={theme === "light" ? "#CBD5F5" : "#475569"}
                      labelColor={theme === "light" ? "#1F2937" : "#E2E8F0"}
                      gridRatios={[0.25, 0.5, 0.75]}
                      selectedIndex={selectedPointIndex}
                      onSelectIndex={setSelectedPointIndex}
                      targets={
                        targetLineOffset !== null
                          ? [
                              {
                                color: "rgba(99,102,241,0.85)",
                                id: "nutrition-target",
                                y: targetLineOffset,
                              },
                            ]
                          : []
                      }
                      series={[
                        {
                          color: metricConfig.color,
                          id: metricConfig.id,
                          points: chartPoints.map((point) => ({
                            index: point.index,
                            visible: true,
                            x: point.chartX,
                            y: point.chartY,
                          })),
                        },
                      ]}
                      xLabels={chartPoints.map((point) => ({
                        index: point.index,
                        label: point.label,
                        x: point.chartX,
                      }))}
                    />
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
              <AccordionCard
                title="Daily totals"
                subtitle={formatFullDate(selectedPoint.date)}
              >
                <View style={styles.summaryGrid}>
                  {NUTRITION_METRICS.map((metric) => (
                    <View key={metric.id} style={styles.summaryRow}>
                      <ThemedText style={styles.summaryLabel}>
                        {metric.label}
                      </ThemedText>
                      <ThemedText style={styles.summaryValue}>
                        {formatChartValue(
                          metricValue(selectedPoint.totals, metric.key),
                          metric.unit,
                        )}
                      </ThemedText>
                    </View>
                  ))}
                </View>
              </AccordionCard>
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

            {mealsForDay.length ? (
              <TouchableOpacity
                style={styles.editMealsButton}
                onPress={() => setIsEditModalOpen(true)}
              >
                <ThemedText style={styles.editMealsButtonText}>
                  Edit meals for this day
                </ThemedText>
              </TouchableOpacity>
            ) : null}
            <AccordionCard
              title={highlightTitle}
              subtitle={`Highest ${metricConfig.label.toLowerCase()} sources`}
            >
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
            </AccordionCard>
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
        {data && <RatioCard ratio={data.nutrition.ratio} />}
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
      <Modal
        transparent
        animationType="fade"
        visible={isEditModalOpen}
        onRequestClose={() => setIsEditModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[styles.modalCard, theme === "dark" && styles.modalCardDark]}
          >
            <ThemedText type="defaultSemiBold">Edit meals</ThemedText>
            <ThemedText style={styles.helperText}>
              Select a meal to edit what you logged.
            </ThemedText>
            <View style={styles.mealList}>
              {mealsForDay.map((meal) => (
                <FoodCard
                  key={meal.id}
                  title={capitalize(meal.mealType)}
                  subtitle={
                    meal.eatenAt ? formatTime(meal.eatenAt) : "Time not set"
                  }
                  description={meal.items
                    .map(
                      (item) => `${item.name} (${item.quantity} ${item.unit})`,
                    )
                    .join(", ")}
                  actions={[
                    {
                      label: "Edit",
                      onPress: () => {
                        const coercedItems =
                          meal.items.map(coerceLoggedMealItem);
                        dispatch(
                          hydrateMealFromEntry({
                            eatenAt: meal.eatenAt,
                            entryId: meal.id,
                            items: coercedItems,
                            mealType: meal.mealType as TMealType,
                          }),
                        );
                        setIsEditModalOpen(false);
                        router.push("/(log-meal)/log-meal");
                      },
                    },
                    {
                      label: "Delete",
                      onPress: () => {
                        Alert.alert(
                          "Delete this meal?",
                          "This cannot be undone.",
                          [
                            { style: "cancel", text: "Cancel" },
                            {
                              onPress: () => {
                                dispatch(deleteMealData({ entryId: meal.id }))
                                  .unwrap()
                                  .then(() => refetch());
                              },
                              style: "destructive",
                              text: "Delete",
                            },
                          ],
                        );
                      },
                      variant: "danger",
                    },
                  ]}
                />
              ))}
            </View>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonGhost]}
              onPress={() => setIsEditModalOpen(false)}
            >
              <ThemedText style={styles.modalButtonTextGhost}>Close</ThemedText>
            </TouchableOpacity>
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
  const decimals = unit === "g" ? 1 : unit === "mg/g" ? 2 : 0;
  return `${formatDecimal(value ?? 0, decimals)} ${unit}`;
}

function metricValue(
  totals: Record<string, number> | null | undefined,
  key: string,
) {
  if (!totals) return 0;
  if (key === "phosphorus_protein_ratio") {
    const phosphorus = totals.phosphorusMg ?? 0;
    const protein = totals.proteinG ?? 0;
    if (!protein || protein <= 0) return 0;
    return phosphorus / protein;
  }
  return totals[key] ?? 0;
}

function formatFullDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    weekday: "short",
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
  color: string;
  item: FoodHighlight;
  metricUnit: string;
}) {
  return (
    <FoodCard
      title={item.name}
      subtitle={formatFoodMeta(item)}
      description={`Adds ${formatChartValue(item.amount, metricUnit)} to your day.`}
      rightContent={
        <ThemedText style={[styles.foodAmount, { color }]}>
          {formatChartValue(item.amount, metricUnit)}
        </ThemedText>
      }
    />
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

// Helper types and functions for meal item coercion
type AllowedItemSource = "user" | "barcode" | "image_ai" | "api";

type ExpectedNutrients = {
  caloriesKcal?: number;
  carbsG?: number;
  fatG?: number;
  fiberG?: number;
  phosphorusMg?: number;
  potassiumMg?: number;
  proteinG?: number;
  sodiumMg?: number;
  sugarG?: number;
};

function coerceLoggedMealItem(item: {
  foodId: string;
  name: string;
  nutrients: Record<string, number | undefined>;
  quantity: number;
  source?: string;
  uid: string;
  unit: string;
  [key: string]: unknown;
}) {
  return {
    ...item,
    nutrients: normalizeNutrients(item.nutrients),
    source: normalizeSource(item.source),
  };
}

function normalizeSource(value?: string): AllowedItemSource {
  if (
    value === "user" ||
    value === "barcode" ||
    value === "image_ai" ||
    value === "api"
  ) {
    return value;
  }
  return "user";
}

function normalizeNutrients(
  nutrients: Record<string, number | undefined> | null | undefined,
): ExpectedNutrients {
  if (!nutrients) return {};
  return {
    caloriesKcal: nutrients.caloriesKcal,
    carbsG: nutrients.carbsG,
    fatG: nutrients.fatG,
    fiberG: nutrients.fiberG,
    phosphorusMg: nutrients.phosphorusMg,
    potassiumMg: nutrients.potassiumMg,
    proteinG: nutrients.proteinG,
    sodiumMg: nutrients.sodiumMg,
    sugarG: nutrients.sugarG,
  };
}
