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
import { useFocusEffect } from "@react-navigation/native";
import type { TMealType } from "@ckd/core";

import { ThemedText } from "@/components/themed-text";
import { FoodCard } from "@/components/food-card";
import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { Card } from "../dashboard/components/Card";
import { NUTRITION_METRICS } from "../dashboard/constants";
import { formatDateShort } from "../dashboard/utils";
import { NutritionStyles } from "./styles";
import { useAppDispatch } from "@/store/hooks";
import {
  toQueryErrorMessage,
  useGetDashboardQuery,
} from "@/store/services/dashboardApi";

import {
  hydrateMealFromEntry,
  mealTypes,
  setMealType,
} from "@/store/slices/logMealSlice";
import { useDeleteMealDataMutation } from "@/store/services/logMealApi";
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
  const [deleteMealData] = useDeleteMealDataMutation();
  const { data, error, isFetching, isLoading, refetch } =
    useGetDashboardQuery("all");
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your nutrition data",
  );
  const refreshing = isFetching && !!data;
  const loading = isLoading && !data;

  const [selectedMetricId, setSelectedMetricId] = useState(
    NUTRITION_METRICS[0]?.id ?? "protein",
  );
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [showAddForSelectedDay, setShowAddForSelectedDay] = useState(false);

  const chartScrollRef = useRef<ScrollViewType | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(
    null,
  );
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
    setSelectedDayKey(chartSeries[chartSeries.length - 1]?.date ?? null);
    setShowAddForSelectedDay(false);
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
  const selectedMetricValue =
    selectedPoint !== null
      ? metricValue(selectedPoint.totals, metricConfig.key)
      : data?.nutrition.totals?.[metricConfig.key];

  useEffect(() => {
    if (!selectedPoint?.date) return;
    setSelectedDayKey(selectedPoint.date);
  }, [selectedPoint?.date]);

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

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  const canRender = Boolean(data?.nutrition.dailySeries?.length);

  const openLogMealModal = useCallback((forSelectedDay = false) => {
    setShowAddForSelectedDay(forSelectedDay);
    setIsLogModalOpen(true);
  }, []);

  if (loading) {
    return (
      <View style={NutritionStyles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={NutritionStyles.helperText}>
          Loading your nutrition data...
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={NutritionStyles.screen}>
      <ScrollView
        style={NutritionStyles.container}
        contentContainerStyle={NutritionStyles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        <View style={NutritionStyles.header}>
          <View style={NutritionStyles.navRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.replace("/(dashboard)/dashboard")}
              style={NutritionStyles.navButton}
            >
              <ThemedText style={NutritionStyles.navButtonText}>
                ‹ Back
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={NutritionStyles.logButton}
              onPress={() => openLogMealModal(false)}
            >
              <ThemedText style={NutritionStyles.logButtonText}>
                Log meal
              </ThemedText>
            </TouchableOpacity>
          </View>
          <ThemedText type="title">Nutrition</ThemedText>
          <ThemedText style={NutritionStyles.helperText}>
            Track how your meals contribute to renal targets.
          </ThemedText>
        </View>

        {error && (
          <Card>
            <ThemedText type="defaultSemiBold">
              We couldn't refresh your nutrition data
            </ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              {errorMessage}
            </ThemedText>
            <TouchableOpacity
              style={NutritionStyles.retryButton}
              onPress={handleRefresh}
            >
              <ThemedText style={NutritionStyles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </Card>
        )}

        {canRender ? (
          <>
            <Card>
              <View style={NutritionStyles.cardHeader}>
                <ThemedText type="defaultSemiBold">Nutrition intake</ThemedText>
                <ThemedText style={NutritionStyles.helperText}>
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
              <View style={NutritionStyles.chartLegend}>
                <ThemedText style={NutritionStyles.legendMetric}>
                  {metricConfig.label}
                </ThemedText>
                <ThemedText style={NutritionStyles.legendValue}>
                  {formatChartValue(selectedMetricValue, metricConfig.unit)}
                </ThemedText>
              </View>
              <View style={NutritionStyles.chartWrap}>
                <ScrollView
                  horizontal
                  ref={chartScrollRef}
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ width: chartContentWidth }}
                >
                  <View
                    style={[
                      NutritionStyles.chartInner,
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
                      onSelectIndex={(index) => {
                        setSelectedPointIndex(index);
                        setSelectedDayKey(chartSeries[index]?.date ?? null);
                        setShowAddForSelectedDay(true);
                      }}
                      targets={
                        targetLineOffset !== null
                          ? [
                              {
                                id: "nutrition-target",
                                color: "rgba(99,102,241,0.85)",
                                y: targetLineOffset,
                              },
                            ]
                          : []
                      }
                      series={[
                        {
                          id: metricConfig.id,
                          color: metricConfig.color,
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
                <View style={NutritionStyles.targetBadge}>
                  <ThemedText style={NutritionStyles.targetBadgeText}>
                    Target {formatChartValue(chartTarget, metricConfig.unit)}
                  </ThemedText>
                </View>
              ) : null}
              {selectedPoint && (
                <ThemedText style={NutritionStyles.helperText}>
                  Showing {formatFullDate(selectedPoint.date)}
                </ThemedText>
              )}
            </Card>

            {selectedPoint ? (
              <AccordionCard
                title="Daily totals"
                subtitle={formatFullDate(selectedPoint.date)}
              >
                <View style={NutritionStyles.summaryGrid}>
                  {NUTRITION_METRICS.map((metric) => (
                    <View key={metric.id} style={NutritionStyles.summaryRow}>
                      <ThemedText style={NutritionStyles.summaryLabel}>
                        {metric.label}
                      </ThemedText>
                      <ThemedText style={NutritionStyles.summaryValue}>
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

            <View style={NutritionStyles.metricRow}>
              {NUTRITION_METRICS.map((metric) => {
                const isActive = metric.id === metricConfig.id;
                return (
                  <TouchableOpacity
                    key={metric.id}
                    onPress={() => setSelectedMetricId(metric.id)}
                    style={[
                      NutritionStyles.metricButton,
                      isActive && { backgroundColor: metric.color },
                    ]}
                  >
                    <ThemedText
                      style={[
                        NutritionStyles.metricButtonText,
                        isActive && NutritionStyles.metricButtonTextActive,
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
                style={NutritionStyles.editMealsButton}
                onPress={() => setIsEditModalOpen(true)}
              >
                <ThemedText style={NutritionStyles.editMealsButtonText}>
                  Edit meals for this day
                </ThemedText>
              </TouchableOpacity>
            ) : null}
            {showAddForSelectedDay && selectedPoint ? (
              <TouchableOpacity
                style={NutritionStyles.addMealsButton}
                onPress={() => openLogMealModal(true)}
              >
                <ThemedText style={NutritionStyles.addMealsButtonText}>
                  Add food for this day
                </ThemedText>
              </TouchableOpacity>
            ) : null}
            <AccordionCard
              title={highlightTitle}
              subtitle={`Highest ${metricConfig.label.toLowerCase()} sources`}
            >
              {highlights.length ? (
                <View style={NutritionStyles.foodList}>
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
                <ThemedText style={NutritionStyles.helperText}>
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
            <ThemedText style={NutritionStyles.helperText}>
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
        <View style={NutritionStyles.modalBackdrop}>
          <View
            style={[
              NutritionStyles.modalCard,
              theme === "dark" && NutritionStyles.modalCardDark,
            ]}
          >
            <ThemedText type="defaultSemiBold">Log your meal?</ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              {showAddForSelectedDay && selectedPoint
                ? `Add foods for ${formatFullDate(selectedPoint.date)}.`
                : "Add foods to your diary to keep your nutrition targets on track."}
            </ThemedText>
            <View style={NutritionStyles.modalActions}>
              {mealTypes.map((mealType) => (
                <TouchableOpacity
                  key={mealType.value}
                  style={[
                    NutritionStyles.modalButton,
                    NutritionStyles.modalButtonPrimary,
                  ]}
                  onPress={() => {
                    const selectedDayParam =
                      showAddForSelectedDay && selectedDayKey
                        ? selectedDayKey
                        : undefined;
                    dispatch(
                      setMealType({
                        eatenAt: selectedDayParam
                          ? buildLogDateTimeForDay(selectedDayParam)
                          : undefined,
                        mealType: mealType.value,
                      }),
                    );
                    setIsLogModalOpen(false);
                    router.push(
                      selectedDayParam
                        ? `/(log-meal)/log-meal?day=${encodeURIComponent(selectedDayParam)}`
                        : "/(log-meal)/log-meal",
                    );
                  }}
                >
                  <ThemedText style={NutritionStyles.modalButtonTextPrimary}>
                    {mealType.label}
                  </ThemedText>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[
                  NutritionStyles.modalButton,
                  NutritionStyles.modalButtonGhost,
                ]}
                onPress={() => setIsLogModalOpen(false)}
              >
                <ThemedText style={NutritionStyles.modalButtonTextGhost}>
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
        <View style={NutritionStyles.modalBackdrop}>
          <View
            style={[
              NutritionStyles.modalCard,
              theme === "dark" && NutritionStyles.modalCardDark,
            ]}
          >
            <ThemedText type="defaultSemiBold">Edit meals</ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              Select a meal to edit what you logged.
            </ThemedText>
            <View style={NutritionStyles.mealList}>
              {mealsForDay.map((meal) => (
                <FoodCard
                  key={meal.id}
                  title={capitalize(meal.mealType)}
                  subtitle={
                    meal.eatenAt ? formatTime(meal.eatenAt) : "Time not set"
                  }
                  description={meal.items
                    .map(
                      (item) =>
                        `${item.name} (${item.quantity} ${formatDisplayUnit(item.unit)})`,
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
                                deleteMealData({ entryId: meal.id })
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
              style={[
                NutritionStyles.modalButton,
                NutritionStyles.modalButtonGhost,
              ]}
              onPress={() => setIsEditModalOpen(false)}
            >
              <ThemedText style={NutritionStyles.modalButtonTextGhost}>
                Close
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function formatChartValue(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value ?? NaN)) {
    return `0 ${formatDisplayUnit(unit)}`;
  }
  return `${Math.ceil(value ?? 0).toString()} ${formatDisplayUnit(unit)}`;
}

function formatDisplayUnit(unit: string) {
  return ["g", "gram", "grams"].includes(unit.trim().toLowerCase()) ? "g" : unit;
}

function buildLogDateTimeForDay(dayKey: string) {
  const localDate = new Date(`${dayKey}T12:00:00`);
  if (Number.isNaN(localDate.getTime())) {
    return new Date().toISOString();
  }
  return localDate.toISOString();
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
        <ThemedText style={[NutritionStyles.foodAmount, { color }]}>
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
