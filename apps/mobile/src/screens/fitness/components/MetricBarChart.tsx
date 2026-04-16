import { ScrollView, View } from "react-native";
import Svg, { Line, Rect, Text as SvgText } from "react-native-svg";

import { TrendLineChart } from "@/components/charts/TrendLineChart";
import { ThemedText } from "@/components/themed-text";

import type { ChartPoint, MeasurementKind } from "../metricTrendTypes";
import {
  BAR_WIDTH,
  CHART_HEIGHT,
  CHART_PAD,
  formatYAxisValue,
} from "../metricTrendUtils";

type TargetLine = {
  color: string;
  label: string;
  y: number;
};

type Props = {
  chartWidth: number;
  kind: MeasurementKind;
  points: ChartPoint[];
  selectedBarIndex: number | null;
  setSelectedBarIndex: (value: number | null) => void;
  targetLines: TargetLine[];
  yMax: number;
  yMin: number;
};

export function MetricBarChart({
  chartWidth,
  kind,
  points,
  selectedBarIndex,
  setSelectedBarIndex,
  targetLines,
  yMax,
  yMin,
}: Props) {
  return (
    <View style={{ position: "relative" }}>
      <View
        pointerEvents="none"
        style={{
          backgroundColor: "white",
          bottom: 0,
          justifyContent: "space-between",
          left: 0,
          paddingBottom: CHART_PAD - 2,
          paddingTop: CHART_PAD + 4,
          position: "absolute",
          top: 0,
          width: CHART_PAD,
          zIndex: 1,
        }}
      >
        <View
          style={{
            backgroundColor: "rgba(100,116,139,0.6)",
            bottom: CHART_PAD,
            left: CHART_PAD - 1,
            position: "absolute",
            top: CHART_PAD,
            width: 1,
          }}
        />
        <ThemedText style={{ color: "#475569", fontSize: 11 }}>
          {formatYAxisValue(kind, yMax)}
        </ThemedText>
        <ThemedText style={{ color: "#475569", fontSize: 11 }}>
          {formatYAxisValue(kind, yMin)}
        </ThemedText>
      </View>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false}>
        {kind === "blood_pressure" ? (
          <TrendLineChart
            width={chartWidth}
            height={CHART_HEIGHT}
            padding={{
              bottom: CHART_PAD,
              left: CHART_PAD,
              right: CHART_PAD,
              top: CHART_PAD,
            }}
            selectedIndex={selectedBarIndex}
            onSelectIndex={setSelectedBarIndex}
            lineColor="rgba(100,116,139,0.6)"
            labelColor="#475569"
            gridRatios={[0.25, 0.5, 0.75]}
            targets={targetLines.map((line) => ({
              id: line.label,
              color: line.color,
              y: line.y,
            }))}
            series={[
              {
                id: "systolic",
                color: "#2563EB",
                points: points.map((point, idx) => ({
                  index: idx,
                  visible: point.hasValue,
                  x: point.x,
                  y: point.y,
                })),
              },
              {
                id: "diastolic",
                color: "#F97316",
                points: points.map((point, idx) => ({
                  index: idx,
                  visible: typeof point.y2 === "number",
                  x: point.x,
                  y: typeof point.y2 === "number" ? point.y2 : 0,
                })),
              },
            ]}
            xLabels={points.map((point, idx) => ({
              index: idx,
              label: point.label,
              x: point.x,
            }))}
          />
        ) : (
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            <Line
              x1={CHART_PAD}
              x2={chartWidth - CHART_PAD}
              y1={CHART_HEIGHT - CHART_PAD}
              y2={CHART_HEIGHT - CHART_PAD}
              stroke="rgba(100,116,139,0.6)"
              strokeWidth={1}
            />

            {targetLines.map((line) => (
              <Line
                key={line.label}
                x1={CHART_PAD}
                x2={chartWidth - CHART_PAD}
                y1={line.y}
                y2={line.y}
                stroke={line.color}
                strokeDasharray="6 4"
                strokeWidth={1.5}
              />
            ))}

            {points.map((point, idx) => (
              <Rect
                key={`${point.x}-bar-${idx}`}
                x={point.barX}
                y={point.y}
                width={BAR_WIDTH}
                height={
                  point.hasValue ? Math.max(1, CHART_HEIGHT - CHART_PAD - point.y) : 0
                }
                fill="#2563EB"
                opacity={
                  point.hasValue && (selectedBarIndex === null || selectedBarIndex === idx)
                    ? 1
                    : point.hasValue
                      ? 0.55
                      : 0
                }
                onPress={() => setSelectedBarIndex(idx)}
                rx={3}
              />
            ))}

            {points.map((point, idx) => (
              <SvgText
                key={`t-${point.x}-${idx}`}
                x={point.x}
                y={CHART_HEIGHT - 8}
                textAnchor="middle"
                fontSize={10}
                fill="#475569"
              >
                {point.label}
              </SvgText>
            ))}
          </Svg>
        )}
      </ScrollView>
    </View>
  );
}
