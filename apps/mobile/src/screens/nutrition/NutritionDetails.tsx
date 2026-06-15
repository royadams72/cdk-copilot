import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import type { ScrollView as ScrollViewType } from "react-native";
import { useRouter } from "expo-router";
import type { TMealType } from "@ckd/core";

import { HeaderOverflowMenu } from "@/components/header-overflow-menu";
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
  useGetLatestWeeklyNutritionInsightQuery,
  useGetNutritionTrendChunkQuery,
  useLazyGetNutritionTrendChunkQuery,
} from "@/store/services/dashboardApi";

import {
  hydrateMealFromEntry,
  mealTypes,
  setMealType,
} from "@/store/slices/logMealSlice";
import { useDeleteMealDataMutation } from "@/store/services/logMealApi";
import type {
  DashboardRatio,
  FoodHighlight,
  NutrientKey,
  NutritionDailyPoint,
} from "../dashboard/types";
import { AccordionCard } from "../dashboard/components/AccordionCard";

const CHART_HEIGHT = 240;
const CHART_PADDING = { bottom: 40, left: 40, right: 20, top: 20 } as const;
const CHART_VIEWPORT_WIDTH = Math.min(Dimensions.get("window").width - 64, 420);
const POINT_GAP = 56;

export default function NutritionDetails() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const chartRequestDays = 7;
  const [deleteMealData] = useDeleteMealDataMutation();
  const {
    data: trendData,
    error: trendQueryError,
    isLoading: isTrendLoading,
  } = useGetNutritionTrendChunkQuery({ days: chartRequestDays });
  const { data: latestWeeklyInsight } =
    useGetLatestWeeklyNutritionInsightQuery();
  const [loadTrendChunk] = useLazyGetNutritionTrendChunkQuery();
  const [requestError, setRequestError] = useState<unknown>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const requestedBeforeRef = useRef<Set<string>>(new Set());
  const isLoadingMoreRef = useRef(false);
  const pendingScrollWidthRef = useRef<number | null>(null);
  const prefetchArmedRef = useRef(true);
  const contentWidthRef = useRef(CHART_VIEWPORT_WIDTH);
  const scrollOffsetRef = useRef(0);
  const shouldScrollToEndRef = useRef(true);
  const errorMessage = toQueryErrorMessage(
    requestError ?? trendQueryError,
    "We couldn't refresh your nutrition data",
  );
  const hasError = Boolean(requestError ?? trendQueryError);
  const refreshing = isRefreshing;
  const loading = isTrendLoading && !trendData;

  const [selectedMetricId, setSelectedMetricId] = useState(
    NUTRITION_METRICS[0]?.id ?? "protein",
  );
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [showAddForSelectedDay, setShowAddForSelectedDay] = useState(false);

  const chartScrollRef = useRef<ScrollViewType | null>(null);
  const metricConfig =
    NUTRITION_METRICS.find((metric) => metric.id === selectedMetricId) ??
    NUTRITION_METRICS[0];

  useEffect(() => {
    if (trendData) {
      setRequestError(null);
    }
  }, [trendData]);

  const fetchTrend = useCallback(
    async (preserveViewport: boolean) => {
      setIsRefreshing(true);
      setRequestError(null);
      requestedBeforeRef.current.clear();
      isLoadingMoreRef.current = false;
      pendingScrollWidthRef.current = preserveViewport
        ? contentWidthRef.current
        : null;
      prefetchArmedRef.current = true;

      try {
        const currentTrendData = trendData;
        const latestDay =
          currentTrendData?.dailySeries[currentTrendData.dailySeries.length - 1]
            ?.date;
        const requestArgs =
          preserveViewport && currentTrendData?.dailySeries.length
            ? {
                before: latestDay ?? undefined,
                days: Math.max(
                  currentTrendData.dailySeries.length,
                  chartRequestDays,
                ),
                reset: true,
              }
            : { days: chartRequestDays, reset: true };
        await loadTrendChunk(requestArgs).unwrap();
        shouldScrollToEndRef.current = !preserveViewport;
        if (!preserveViewport) {
          scrollOffsetRef.current = 0;
        }
      } catch (err) {
        setRequestError(err);
      } finally {
        setIsRefreshing(false);
      }
    },
    [chartRequestDays, loadTrendChunk, trendData],
  );

  const fetchOlderChunk = useCallback(async () => {
    if (
      !trendData?.hasMore ||
      !trendData.nextBefore ||
      isLoadingMoreRef.current
    ) {
      return;
    }
    if (requestedBeforeRef.current.has(trendData.nextBefore)) {
      return;
    }

    isLoadingMoreRef.current = true;
    setRequestError(null);
    requestedBeforeRef.current.add(trendData.nextBefore);
    pendingScrollWidthRef.current = contentWidthRef.current;

    try {
      await loadTrendChunk({
        before: trendData.nextBefore,
        days: chartRequestDays,
      }).unwrap();
    } catch (err) {
      requestedBeforeRef.current.delete(trendData.nextBefore);
      pendingScrollWidthRef.current = null;
      setRequestError(err);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [chartRequestDays, loadTrendChunk, trendData]);

  const chartSeries = useMemo(() => {
    if (!trendData?.dailySeries) return [];
    return trendData.dailySeries.map((point, index) => ({
      ...point,
      index,
      value: Math.max(metricValue(point.totals, metricConfig.key), 0),
    }));
  }, [metricConfig.key, trendData]);

  const aggregateTotals = useMemo(
    () => sumNutritionTotals(trendData?.dailySeries ?? []),
    [trendData?.dailySeries],
  );

  const chartRatio = useMemo(
    () => buildRatioFromTotals(aggregateTotals, trendData?.targets),
    [aggregateTotals, trendData?.targets],
  );

  const chartTarget = useMemo(() => {
    if (metricConfig.key === "phosphorus_protein_ratio") {
      const ratioTarget = chartRatio.target;
      return typeof ratioTarget === "number" && Number.isFinite(ratioTarget)
        ? ratioTarget
        : null;
    }
    const target = trendData?.targets?.[metricConfig.key as NutrientKey];
    return typeof target === "number" && Number.isFinite(target)
      ? target
      : null;
  }, [chartRatio.target, metricConfig.key, trendData?.targets]);

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
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;

    return chartSeries.map((point, index) => {
      const value = Math.max(point.value, 0);
      const yRatio =
        chartDomainMax > 0 ? Math.min(value / chartDomainMax, 1) : 0;
      return {
        ...point,
        chartX:
          chartSeries.length === 1
            ? chartContentWidth / 2
            : CHART_PADDING.left + index * POINT_GAP,
        chartY: CHART_PADDING.top + innerHeight * (1 - yRatio),
      };
    });
  }, [chartSeries, chartDomainMax, chartContentWidth]);

  useEffect(() => {
    contentWidthRef.current = chartContentWidth;
    if (!chartScrollRef.current) return;

    if (pendingScrollWidthRef.current !== null) {
      const previousWidth = pendingScrollWidthRef.current;
      pendingScrollWidthRef.current = null;
      chartScrollRef.current.scrollTo({
        animated: false,
        x: scrollOffsetRef.current + (chartContentWidth - previousWidth),
      });
      return;
    }

    if (shouldScrollToEndRef.current) {
      shouldScrollToEndRef.current = false;
      const nextOffset = Math.max(chartContentWidth - CHART_VIEWPORT_WIDTH, 0);
      scrollOffsetRef.current = nextOffset;
      chartScrollRef.current.scrollTo({
        animated: false,
        x: nextOffset,
      });
    }
  }, [chartContentWidth, chartSeries.length]);

  useEffect(() => {
    if (!chartSeries.length) return;
    if (selectedDayKey) {
      const hasSelectedDay = chartSeries.some(
        (point) => point.date === selectedDayKey,
      );
      if (hasSelectedDay) {
        return;
      }
    }
    const latestPoint = chartSeries[chartSeries.length - 1];
    setSelectedDayKey(latestPoint?.date ?? null);
    setShowAddForSelectedDay(false);
  }, [chartSeries, selectedDayKey]);

  const selectedPointIndex = useMemo(() => {
    if (!chartSeries.length) return null;
    if (selectedDayKey) {
      const index = chartSeries.findIndex(
        (point) => point.date === selectedDayKey,
      );
      if (index >= 0) return index;
    }
    return chartSeries.length - 1;
  }, [chartSeries, selectedDayKey]);

  const selectedPoint =
    selectedPointIndex !== null ? chartSeries[selectedPointIndex] : null;
  const selectedMetricValue =
    selectedPoint !== null
      ? metricValue(selectedPoint.totals, metricConfig.key)
      : metricValue(aggregateTotals, metricConfig.key);

  useEffect(() => {
    if (!selectedPoint?.date) return;
    setSelectedDayKey(selectedPoint.date);
  }, [selectedPoint?.date]);

  const latestLoadedDate = trendData?.dailySeries.length
    ? (trendData.dailySeries[trendData.dailySeries.length - 1]?.date ?? null)
    : null;

  const highlightDate = selectedPoint?.date ?? latestLoadedDate ?? null;

  const { highlights, hasHighlightBucket } = useMemo(() => {
    if (!highlightDate) {
      return { hasHighlightBucket: false, highlights: [] as FoodHighlight[] };
    }
    const dayBucket = trendData?.foodHighlightsByDate?.[highlightDate];
    if (!dayBucket) {
      return { hasHighlightBucket: false, highlights: [] as FoodHighlight[] };
    }
    return {
      hasHighlightBucket: true,
      highlights: dayBucket[metricConfig.key] ?? [],
    };
  }, [highlightDate, metricConfig.key, trendData?.foodHighlightsByDate]);

  const highlightTitle = buildHighlightTitle(metricConfig.label, highlightDate);

  const highlightFallbackMessage = buildHighlightFallbackMessage(
    metricConfig.label,
    highlightDate,
    hasHighlightBucket,
  );
  const mealsForDay = useMemo(() => {
    if (!highlightDate) return [];
    return trendData?.mealsByDate?.[highlightDate] ?? [];
  }, [highlightDate, trendData?.mealsByDate]);

  useEffect(() => {
    if (mealsForDay.length === 0) {
      setIsEditModalOpen(false);
    }
  }, [mealsForDay.length]);

  const handleRefresh = useCallback(() => {
    void fetchTrend(true);
  }, [fetchTrend]);

  const canRender = Boolean(trendData?.dailySeries?.length);

  const openLogMealModal = useCallback((forSelectedDay = false) => {
    setShowAddForSelectedDay(forSelectedDay);
    setIsLogModalOpen(true);
  }, []);

  const handleChartScroll = useCallback(
    (event: {
      nativeEvent: {
        contentOffset: { x: number };
        contentSize: { width: number };
        layoutMeasurement: { width: number };
      };
    }) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      scrollOffsetRef.current = contentOffset.x;
      const maxOffset = Math.max(
        contentSize.width - layoutMeasurement.width,
        0,
      );
      if (maxOffset <= 0) return;
      const isPastPrefetchThreshold = contentOffset.x <= maxOffset * 0.5;
      if (!isPastPrefetchThreshold) {
        prefetchArmedRef.current = true;
        return;
      }
      if (prefetchArmedRef.current) {
        prefetchArmedRef.current = false;
        void fetchOlderChunk();
      }
    },
    [fetchOlderChunk],
  );

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
            <View
              style={{ alignItems: "center", flexDirection: "row", gap: 10 }}
            >
              <TouchableOpacity
                style={NutritionStyles.logButton}
                onPress={() => openLogMealModal(false)}
              >
                <ThemedText style={NutritionStyles.logButtonText}>
                  Log meal
                </ThemedText>
              </TouchableOpacity>
              <HeaderOverflowMenu
                accessibilityLabel="Open nutrition actions"
                items={[
                  {
                    id: "edit-targets",
                    label: "Edit targets",
                    onPress: () =>
                      router.push({
                        params: {
                          domain: "renal",
                          title: "Nutrition targets",
                        },
                        pathname: "/targets",
                      }),
                  },
                  {
                    id: "monthly-nutrition",
                    label: "Monthly nutrition",
                    onPress: () =>
                      router.push("/(nutrition)/monthly-nutrition" as never),
                  },
                  {
                    id: "weekly-swap-tester",
                    label: "Test weekly swaps",
                    onPress: () =>
                      router.push("/(nutrition)/weekly-swap-tester"),
                  },
                ]}
              />
            </View>
          </View>
          <ThemedText type="title">Nutrition</ThemedText>
          <ThemedText style={NutritionStyles.helperText}>
            Track how your meals contribute to renal targets.
          </ThemedText>
        </View>

        {hasError && (
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

        {latestWeeklyInsight && (
          <Card>
            {(() => {
              const analysisMode =
                latestWeeklyInsight.analysisMode ?? "weekly_average";
              const loggedDays =
                typeof latestWeeklyInsight.loggedDays === "number"
                  ? latestWeeklyInsight.loggedDays
                  : 7;
              return (
                <>
                  <View style={NutritionStyles.cardHeader}>
                    <ThemedText type="defaultSemiBold">
                      Weekly nutrition alert
                    </ThemedText>
                    <ThemedText style={NutritionStyles.helperText}>
                      {latestWeeklyInsight.weekStart} to{" "}
                      {latestWeeklyInsight.weekEnd}
                    </ThemedText>
                    <ThemedText style={NutritionStyles.helperText}>
                      Logged days: {loggedDays} | Mode:{" "}
                      {analysisMode.replace(/_/g, " ")}
                    </ThemedText>
                  </View>
                  <ThemedText style={NutritionStyles.helperText}>
                    {latestWeeklyInsight.humanMessage}
                  </ThemedText>
                  {latestWeeklyInsight.findings.slice(0, 2).map((finding) => (
                    <View key={finding.type}>
                      <ThemedText style={NutritionStyles.helperText}>
                        {finding.type.replace(/_/g, " ")}: {finding.actual} /{" "}
                        {finding.target}
                      </ThemedText>
                      {finding.topContributors?.[0] ? (
                        <ThemedText style={NutritionStyles.helperText}>
                          {finding.topContributors[0].food} contributed{" "}
                          {finding.topContributors[0].contribution}%.
                        </ThemedText>
                      ) : null}
                    </View>
                  ))}
                </>
              );
            })()}
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
                    trendData?.dailySeries[0]?.date ?? Date.now(),
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
                  onScroll={handleChartScroll}
                  scrollEventThrottle={16}
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
                      lineColor="#CBD5F5"
                      labelColor="#1F2937"
                      gridRatios={[0.25, 0.5, 0.75]}
                      selectedIndex={selectedPointIndex}
                      onSelectIndex={(index) => {
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
                    <View
                      style={NutritionStyles.chartTouchLayer}
                      pointerEvents="box-none"
                    >
                      {chartPoints.map((point) => (
                        <Pressable
                          key={`hit-${point.index}`}
                          onPress={() => {
                            setSelectedDayKey(
                              chartSeries[point.index]?.date ?? null,
                            );
                            setShowAddForSelectedDay(true);
                          }}
                          style={[
                            NutritionStyles.chartTouchTarget,
                            {
                              left: point.chartX - 22,
                              top: point.chartY - 22,
                            },
                          ]}
                        />
                      ))}
                    </View>
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
        ) : !hasError ? (
          <Card>
            <ThemedText type="defaultSemiBold">
              No meals logged this week
            </ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              Start tracking your meals to unlock protein, phosphorus,
              potassium, and sodium insights.
            </ThemedText>
          </Card>
        ) : null}
      </ScrollView>
      <Modal
        transparent
        animationType="fade"
        visible={isLogModalOpen}
        onRequestClose={() => setIsLogModalOpen(false)}
      >
        <View style={NutritionStyles.modalBackdrop}>
          <View style={NutritionStyles.modalCard}>
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
          <View style={NutritionStyles.modalCard}>
            <ThemedText type="defaultSemiBold">Edit meals</ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              Select a meal to edit what you logged.
            </ThemedText>
            <ScrollView
              style={NutritionStyles.modalScroll}
              contentContainerStyle={NutritionStyles.mealList}
              showsVerticalScrollIndicator
            >
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
                                  .then(() => fetchTrend(true));
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
            </ScrollView>
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

const EMPTY_TOTALS: Record<NutrientKey, number> = {
  caloriesKcal: 0,
  phosphorusMg: 0,
  potassiumMg: 0,
  proteinG: 0,
  sodiumMg: 0,
};

function sumNutritionTotals(series: NutritionDailyPoint[]) {
  return series.reduce(
    (totals, point) => {
      totals.caloriesKcal += point.totals.caloriesKcal ?? 0;
      totals.phosphorusMg += point.totals.phosphorusMg ?? 0;
      totals.potassiumMg += point.totals.potassiumMg ?? 0;
      totals.proteinG += point.totals.proteinG ?? 0;
      totals.sodiumMg += point.totals.sodiumMg ?? 0;
      return totals;
    },
    { ...EMPTY_TOTALS },
  );
}

function buildRatioFromTotals(
  totals: Record<NutrientKey, number>,
  targets?: Partial<Record<NutrientKey, number>>,
): DashboardRatio {
  const value =
    totals.proteinG > 0
      ? Math.round((totals.phosphorusMg / totals.proteinG) * 100) / 100
      : null;
  const target =
    typeof targets?.proteinG === "number" &&
    typeof targets?.phosphorusMg === "number" &&
    targets.proteinG > 0
      ? Math.round((targets.phosphorusMg / targets.proteinG) * 100) / 100
      : 12;

  return {
    status: value === null ? "unknown" : value <= target ? "in-range" : "high",
    target,
    unit: "mg phosphorus per g protein",
    value,
  };
}

function formatChartValue(value: number | null | undefined, unit: string) {
  if (!Number.isFinite(value ?? NaN)) {
    return `0 ${formatDisplayUnit(unit)}`;
  }
  return `${Math.ceil(value ?? 0).toString()} ${formatDisplayUnit(unit)}`;
}

function formatDisplayUnit(unit: string) {
  return ["g", "gram", "grams"].includes(unit.trim().toLowerCase())
    ? "g"
    : unit;
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
type AllowedItemSource = "user" | "image_ai" | "api";

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
  if (value === "user" || value === "image_ai" || value === "api") {
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
