import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Card } from "../dashboard/components/Card";
import { NUTRITION_METRICS } from "../dashboard/constants";
import { NutritionStyles } from "./styles";
import {
  toQueryErrorMessage,
  useGetMonthlyNutritionSummaryQuery,
} from "@/store/services/dashboardApi";
import type {
  MonthlyNutritionFilter,
  MonthlyNutritionFoodRow,
} from "@/store/services/types";

const CHART_HEIGHT = 240;
const CHART_PADDING = { bottom: 36, left: 16, right: 16, top: 20 } as const;
const MONTHLY_CHART_WIDTH = 360;
const MONTHLY_METRICS = NUTRITION_METRICS.filter(
  (metric) => metric.key !== "phosphorus_protein_ratio",
) as Array<
  (typeof NUTRITION_METRICS)[number] & { key: MonthlyNutritionFilter }
>;

export default function MonthlyNutrition() {
  const router = useRouter();
  const [selectedFilter, setSelectedFilter] = useState<MonthlyNutritionFilter>(
    "phosphorusMg",
  );
  const [selectedMonthOverride, setSelectedMonthOverride] = useState<
    string | undefined
  >(undefined);
  const {
    data,
    error,
    isFetching,
    isLoading,
    refetch,
  } = useGetMonthlyNutritionSummaryQuery({
    filter: selectedFilter,
    month: selectedMonthOverride,
  });

  useEffect(() => {
    if (data?.selectedMonth && selectedMonthOverride === undefined) {
      setSelectedMonthOverride(data.selectedMonth);
    }
  }, [data?.selectedMonth, selectedMonthOverride]);

  const activeMetric =
    MONTHLY_METRICS.find((metric) => metric.key === selectedFilter) ??
    MONTHLY_METRICS[0];
  const effectiveSelectedMonth = selectedMonthOverride ?? data?.selectedMonth;
  const loading = isLoading && !data;
  const errorMessage = toQueryErrorMessage(
    error,
    "We couldn't refresh your monthly nutrition data",
  );

  const selectedMonthStat = useMemo(
    () =>
      data?.monthlyStats.find((item) => item.month === effectiveSelectedMonth) ??
      data?.monthlyStats.find((item) => item.target !== null) ??
      null,
    [data?.monthlyStats, effectiveSelectedMonth],
  );
  const selectedTarget = selectedMonthStat?.target ?? null;

  const chartBars = useMemo(() => {
    const stats = data?.monthlyStats ?? [];
    const maxValue = Math.max(
      1,
      ...stats.map((item) => item.value),
      selectedTarget ?? 0,
    );
    const innerWidth = MONTHLY_CHART_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const slotWidth = innerWidth / Math.max(stats.length, 1);
    const barWidth = Math.max(14, slotWidth * 0.55);

    return stats.map((item, index) => {
      const x = CHART_PADDING.left + index * slotWidth + (slotWidth - barWidth) / 2;
      const ratio = item.value / maxValue;
      const barHeight = innerHeight * ratio;
      const y = CHART_PADDING.top + (innerHeight - barHeight);

      return {
        ...item,
        barHeight,
        barWidth,
        slotWidth,
        x,
        y,
      };
    });
  }, [data?.monthlyStats, selectedTarget]);

  const selectedTargetY = useMemo(() => {
    if (!selectedTarget || !chartBars.length) {
      return null;
    }
    const maxValue = Math.max(
      1,
      ...chartBars.map((item) => item.value),
      selectedTarget,
    );
    const innerHeight = CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    return CHART_PADDING.top + innerHeight * (1 - Math.min(selectedTarget / maxValue, 1));
  }, [chartBars, selectedTarget]);

  if (loading) {
    return (
      <View style={NutritionStyles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={NutritionStyles.helperText}>
          Loading your monthly nutrition data...
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
          <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} />
        }
      >
        <View style={NutritionStyles.header}>
          <View style={NutritionStyles.navRow}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => router.back()}
              style={NutritionStyles.navButton}
            >
              <ThemedText style={NutritionStyles.navButtonText}>‹ Back</ThemedText>
            </TouchableOpacity>
          </View>
          <ThemedText type="title">Monthly nutrition</ThemedText>
          <ThemedText style={NutritionStyles.helperText}>
            Review monthly nutrient averages and the foods driving them.
          </ThemedText>
        </View>

        {error ? (
          <Card>
            <ThemedText type="defaultSemiBold">
              We couldn't refresh your monthly nutrition data
            </ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              {errorMessage}
            </ThemedText>
            <TouchableOpacity
              style={NutritionStyles.retryButton}
              onPress={() => refetch()}
            >
              <ThemedText style={NutritionStyles.retryText}>Retry</ThemedText>
            </TouchableOpacity>
          </Card>
        ) : null}

        <Card>
          <View style={NutritionStyles.cardHeader}>
            <ThemedText type="defaultSemiBold">
              {data?.summaryTitle ?? "Monthly nutrition"}
            </ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              Tap a month to inspect the foods behind that period.
            </ThemedText>
          </View>
          <View style={NutritionStyles.metricRow}>
            {MONTHLY_METRICS.map((metric) => {
              const active = metric.key === selectedFilter;
              return (
                <TouchableOpacity
                  key={metric.id}
                  onPress={() => {
                    setSelectedFilter(metric.key);
                    setSelectedMonthOverride(undefined);
                  }}
                  style={[
                    NutritionStyles.metricButton,
                    active && { backgroundColor: metric.color },
                  ]}
                >
                  <ThemedText
                    style={[
                      NutritionStyles.metricButtonText,
                      active && NutritionStyles.metricButtonTextActive,
                    ]}
                  >
                    {metric.label}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={NutritionStyles.monthlyChartWrap}>
            <View style={NutritionStyles.monthlyChartFrame}>
              <Svg width={MONTHLY_CHART_WIDTH} height={CHART_HEIGHT}>
                <Line
                  x1={CHART_PADDING.left}
                  y1={CHART_HEIGHT - CHART_PADDING.bottom}
                  x2={MONTHLY_CHART_WIDTH - CHART_PADDING.right}
                  y2={CHART_HEIGHT - CHART_PADDING.bottom}
                  stroke="rgba(100,116,139,0.6)"
                  strokeWidth={1}
                />
                {chartBars.map((bar) => (
                  <Rect
                    key={bar.month}
                    x={bar.x}
                    y={bar.y}
                    width={bar.barWidth}
                    height={Math.max(bar.barHeight, 2)}
                    rx={4}
                    fill={bar.isSelected ? "#F59E0B" : activeMetric.color}
                  />
                ))}
                {selectedTargetY !== null ? (
                  <>
                    <Line
                      x1={CHART_PADDING.left}
                      y1={selectedTargetY}
                      x2={MONTHLY_CHART_WIDTH - CHART_PADDING.right}
                      y2={selectedTargetY}
                      stroke="rgba(99,102,241,0.95)"
                      strokeWidth={1.5}
                    />
                    <SvgText
                      x={MONTHLY_CHART_WIDTH - CHART_PADDING.right}
                      y={selectedTargetY - 6}
                      textAnchor="end"
                      fontSize={11}
                      fill="#4F46E5"
                    >
                      Target
                    </SvgText>
                  </>
                ) : null}
                {chartBars.map((bar) => (
                  <SvgText
                    key={`label-${bar.month}`}
                    x={bar.x + bar.barWidth / 2}
                    y={CHART_HEIGHT - 10}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#475569"
                  >
                    {bar.label}
                  </SvgText>
                ))}
              </Svg>
              <View style={NutritionStyles.monthlyChartTouchLayer} pointerEvents="box-none">
                {chartBars.map((bar) => (
                  <Pressable
                    key={`press-${bar.month}`}
                    onPress={() => setSelectedMonthOverride(bar.month)}
                    style={[
                      NutritionStyles.monthlyChartTouchTarget,
                      {
                        left: bar.x - (bar.slotWidth - bar.barWidth) / 2,
                        width: bar.slotWidth,
                      },
                    ]}
                  />
                ))}
              </View>
            </View>
          </View>
          <View style={NutritionStyles.chartLegend}>
            <ThemedText style={NutritionStyles.legendMetric}>
              {activeMetric.label}
            </ThemedText>
            <View style={NutritionStyles.chartLegendRight}>
              {selectedTarget !== null ? (
                <ThemedText style={NutritionStyles.legendTarget}>
                  Target {formatMetricValue(selectedTarget, activeMetric.unit)}
                </ThemedText>
              ) : null}
              <ThemedText style={NutritionStyles.legendValue}>
                {data?.selectedMonthLabel ?? ""}
              </ThemedText>
            </View>
          </View>
        </Card>

        <Card>
          <View style={NutritionStyles.cardHeader}>
            <ThemedText type="defaultSemiBold">
              {data?.tableTitle ?? "Top foods"}
            </ThemedText>
            <ThemedText style={NutritionStyles.helperText}>
              {data?.foodRows.length ?? 0} food rows across the selected month
            </ThemedText>
          </View>
          <View style={NutritionStyles.foodList}>
            {(data?.foodRows ?? []).map((row) => (
              <MonthlyFoodRow key={`${row.food}-${row.timesLogged}`} row={row} unit={activeMetric.unit} />
            ))}
            {!data?.foodRows.length ? (
              <ThemedText style={NutritionStyles.helperText}>
                No monthly summary foods available for this month yet.
              </ThemedText>
            ) : null}
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}

function MonthlyFoodRow({
  row,
  unit,
}: {
  row: MonthlyNutritionFoodRow;
  unit: string;
}) {
  return (
    <View style={NutritionStyles.monthlyFoodRow}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText type="defaultSemiBold">{row.food}</ThemedText>
        <ThemedText style={NutritionStyles.helperText}>
          {row.timesLogged} logs · avg {formatMetricValue(row.averageAmount, unit)}
        </ThemedText>
      </View>
      <View style={{ alignItems: "flex-end", gap: 2 }}>
        <ThemedText style={NutritionStyles.summaryValue}>
          {formatMetricValue(row.currentMonthAmount, unit)}
        </ThemedText>
        <ThemedText style={NutritionStyles.helperText}>
          {row.levelLabel} · {formatTrend(row.trend)}
        </ThemedText>
      </View>
    </View>
  );
}

function formatMetricValue(value: number, unit: string) {
  return `${(Math.round(value * 10) / 10).toLocaleString("en-GB", {
    maximumFractionDigits: 1,
  })} ${unit}`;
}

function formatTrend(trend: MonthlyNutritionFoodRow["trend"]) {
  if (trend === "increased") return "increased";
  if (trend === "reduced") return "reduced";
  return "same";
}
