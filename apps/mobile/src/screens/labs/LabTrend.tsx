import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import Svg, { Circle, Line, Polyline, Text as SvgText } from "react-native-svg";

import { FeedbackModal } from "@/components/feedback-modal";
import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatMobileShortDayMonth } from "@/lib/format/date";
import { AppScreen } from "@/components/app-screen";
import { AppButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { theme } from "@/constants/theme";
import { NutritionStyles } from "../nutrition/styles";

type TrendPoint = {
  takenAt: string | null;
  value: number | string;
};

function asNumber(value: number | string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function LabTrend() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const params = useLocalSearchParams<{ code?: string; unit?: string; name?: string }>();
  const code = typeof params.code === "string" ? params.code : "";
  const unit = typeof params.unit === "string" ? params.unit : "";
  const name = typeof params.name === "string" ? params.name : "Lab trend";
  const [loading, setLoading] = useState(true);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!code) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        const res = await authFetch(
          `${API}/api/labs/history?code=${encodeURIComponent(code)}&unit=${encodeURIComponent(unit)}`,
          { method: "GET" },
        );
        const body: any = await res.json().catch(() => null);
        if (!res.ok || !body?.ok) {
          throw new Error(body?.message ?? "Failed to load trend");
        }
        if (cancelled) return;
        setPoints(body.data?.points ?? []);
      } catch (err: any) {
        if (cancelled) return;
        setErrorMessage(err?.message ?? "Failed to load trend");
        setShowErrorModal(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [code, unit]);

  const numericPoints = useMemo(
    () =>
      points
        .map((point) => ({
          label: formatMobileShortDayMonth(point.takenAt),
          value: asNumber(point.value),
        }))
        .filter((point) => point.value !== null) as { label: string; value: number }[],
    [points],
  );

  const chart = useMemo(() => {
    const width = Math.min(Math.max(screenWidth - 72, 240), 360);
    const height = theme.charts.compactHeight;
    const pad = 22;
    if (numericPoints.length === 0) {
      return { circles: [], polyline: "", width, height, xTicks: [], yMax: 0, yMin: 0 };
    }

    const values = numericPoints.map((point) => point.value);
    const yMin = Math.min(...values);
    const yMax = Math.max(...values);
    const span = Math.max(1, yMax - yMin);
    const xStep =
      numericPoints.length > 1 ? (width - pad * 2) / (numericPoints.length - 1) : 0;

    const coords = numericPoints.map((point, index) => {
      const x = pad + index * xStep;
      const y = height - pad - ((point.value - yMin) / span) * (height - pad * 2);
      return { x, y };
    });

    return {
      circles: coords,
      polyline: coords.map((coord) => `${coord.x},${coord.y}`).join(" "),
      width,
      height,
      xTicks: numericPoints.map((point, index) => ({
        label: point.label,
        x: pad + index * xStep,
      })),
      yMax,
      yMin,
    };
  }, [numericPoints, screenWidth]);

  return (
    <>
      <AppScreen>
        <AppButton label="Back" onPress={() => router.replace("/(labs)/labs-history")} variant="secondary" size="compact" />
        <ThemedText type="title" style={NutritionStyles.screenTitle}>{name}</ThemedText>
        <ThemedText style={{ color: theme.colors.copy }}>
          {unit ? `Values in ${unit}` : "Value history"}
        </ThemedText>

        {loading ? (
          <View style={{ alignItems: "center", gap: 8, paddingVertical: 24 }}>
            <ActivityIndicator size="large" />
            <ThemedText>Loading trend...</ThemedText>
          </View>
        ) : numericPoints.length === 0 ? (
          <ThemedText style={{ opacity: 0.7 }}>No numeric history available.</ThemedText>
        ) : (
          <Section title="Reading trend">
            <Svg width={chart.width} height={chart.height}>
              <Line
                x1={24}
                y1={chart.height - 24}
                x2={chart.width - 24}
                y2={chart.height - 24}
                stroke={theme.colors.border}
                strokeWidth={1}
              />
              <Line
                x1={24}
                y1={24}
                x2={24}
                y2={chart.height - 24}
                stroke={theme.colors.border}
                strokeWidth={1}
              />
              <Polyline
                points={chart.polyline}
                fill="none"
                stroke={theme.colors.primary}
                strokeWidth={2.5}
              />
              {chart.circles.map((coord, index) => (
                <Circle key={`${coord.x}-${coord.y}-${index}`} cx={coord.x} cy={coord.y} r={3.5} fill={theme.colors.primary} />
              ))}
              <SvgText x={4} y={26} fontSize={11} fill={theme.colors.copy}>
                {chart.yMax.toFixed(1)}
              </SvgText>
              <SvgText x={4} y={chart.height - 22} fontSize={11} fill={theme.colors.copy}>
                {chart.yMin.toFixed(1)}
              </SvgText>
              {chart.xTicks.map((tick, index) => (
                <SvgText
                  key={`${tick.x}-${index}`}
                  x={tick.x}
                  y={chart.height - 8}
                  fontSize={10}
                  fill={theme.colors.copy}
                  textAnchor="middle"
                >
                  {tick.label}
                </SvgText>
              ))}
            </Svg>
          </Section>
        )}
      </AppScreen>

      <FeedbackModal
        mode="error"
        visible={showErrorModal}
        title="Lab trend error"
        message={errorMessage}
        onClose={() => setShowErrorModal(false)}
      />
    </>
  );
}
