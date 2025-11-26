import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import Svg, { Circle, G, Text as SvgText } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { API } from "@/constants/api";
import { Colors } from "@/constants/theme";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";

type DashboardRadial = {
  id: string;
  label: string;
  unit: string;
  actual: number | null;
  target: number | null;
  percent: number | null;
};

type DashboardRatio = {
  value: number | null;
  target: number | null;
  unit: string;
  status: "in-range" | "high" | "unknown";
};

type DashboardRange = {
  from: string;
  to: string;
  days: number;
  entries: number;
  lastEntryAt: string | null;
};

type LabSummary = {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  takenAt: string | null;
  abnormalFlag: string | null;
};

type DashboardData = {
  patientId: string;
  summary: {
    ckdStage: string | null;
    egfrCurrent: number | null;
    dialysisStatus: string | null;
    lastClinicalUpdateAt: string | null;
  };
  labs: Record<string, LabSummary | null>;
  nutrition: {
    range: DashboardRange;
    totals: Record<string, number>;
    radials: DashboardRadial[];
    ratio: DashboardRatio;
  };
};

type ApiResponse = {
  ok: boolean;
  data: DashboardData;
};

const LAB_CONFIG = [
  { id: "egfr", label: "eGFR", unit: "mL/min/1.73m²", precision: 0 },
  {
    id: "phosphorus",
    label: "Serum phosphorus",
    unit: "mg/dL",
    precision: 1,
  },
  { id: "potassium", label: "Serum potassium", unit: "mmol/L", precision: 1 },
] as const;

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setError(null);
      const res = await authFetch(`${API}/api/dashboard`, {
        method: "GET",
      });
      // parse as unknown because the response could be a success shape (ApiResponse) or an error shape
      const body: unknown = await res.json().catch(() => null);
      // check for success shape before using it as ApiResponse
      if (!res.ok || !(body as ApiResponse)?.ok) {
        // formatApiError expects an ApiErrorBody; assert to any here so TypeScript accepts the possible error shape
        throw new Error(formatApiError(res.status, (body as any) ?? null));
      }
      setData((body as ApiResponse).data);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load your dashboard");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    fetchDashboard();
  }, [fetchDashboard]);

  const handleRetry = useCallback(() => {
    if (!data) {
      setLoading(true);
    }
    fetchDashboard();
  }, [data, fetchDashboard]);

  const rangeSummary = useMemo(() => {
    if (!data) return "";
    return describeRange(data.nutrition.range);
  }, [data]);

  if (loading && !data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.helperText}>
          Loading your dashboard...
        </ThemedText>
      </View>
    );
  }

  const showBlockingError = !loading && !data && !!error;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {showBlockingError && error ? (
        <ErrorState message={error} onRetry={handleRetry} />
      ) : (
        <>
          <View style={styles.header}>
            <ThemedText type="title">Your dashboard</ThemedText>
            {data?.summary.ckdStage && (
              <ThemedText style={styles.subtleText}>
                CKD stage {data.summary.ckdStage.toUpperCase()}
              </ThemedText>
            )}
            {rangeSummary ? (
              <ThemedText style={styles.subtleText}>{rangeSummary}</ThemedText>
            ) : null}
          </View>

          {error && data && (
            <InlineError message={error} onRetry={handleRetry} />
          )}

          <View style={styles.radialsRow}>
            {data?.nutrition.radials.map((radial) => (
              <RadialCard key={radial.id} radial={radial} />
            ))}
          </View>

          {data && <RatioCard ratio={data.nutrition.ratio} />}

          {data && <LabsCard labs={data.labs} />}
        </>
      )}
    </ScrollView>
  );
}

function Card({
  children,
  style,
}: PropsWithChildren<{ style?: ViewStyle | ViewStyle[] }>) {
  const theme = useColorScheme() ?? "light";
  return (
    <View
      style={[
        styles.card,
        theme === "light" ? styles.cardLight : styles.cardDark,
        style,
      ]}
    >
      {children}
    </View>
  );
}

function RadialCard({ radial }: { radial: DashboardRadial }) {
  const theme = useColorScheme() ?? "light";
  const accent = theme === "light" ? "#4338CA" : "#A5B4FC";
  const track = theme === "light" ? "#E5E7EB" : "rgba(255,255,255,0.2)";
  const clamped =
    radial.percent !== null && radial.percent !== undefined
      ? clamp(radial.percent, 0, 1)
      : 0;
  const percentText =
    radial.percent !== null && radial.percent !== undefined
      ? `${Math.round(clamped * 100)}%`
      : "N/A";
  const precision = radial.unit === "g" ? 1 : 0;
  const hasActual = radial.actual !== null && radial.actual !== undefined;
  const actualValue = hasActual
    ? formatDecimal(radial.actual!, precision)
    : "—";
  const targetText =
    radial.target !== null && radial.target !== undefined
      ? `Goal ${formatDecimal(radial.target, precision)} ${radial.unit}`
      : "No goal set";
  const isOverTarget = radial.percent !== null && radial.percent > 1;

  return (
    <Card style={styles.radialCard}>
      <ThemedText type="defaultSemiBold">{radial.label}</ThemedText>
      <View style={styles.radialChart}>
        <RadialProgress
          percent={radial.percent}
          accentColor={accent}
          trackColor={track}
          label={percentText}
          textColor={Colors[theme].text}
        />
      </View>
      <View style={styles.metricRow}>
        <ThemedText style={styles.metricValue}>{actualValue}</ThemedText>
        <ThemedText style={styles.metricUnit}>
          {hasActual ? radial.unit : ""}
        </ThemedText>
      </View>
      <ThemedText style={styles.helperText}>{targetText}</ThemedText>
      {isOverTarget && (
        <View style={styles.warningPill}>
          <ThemedText style={styles.warningPillText}>Above target</ThemedText>
        </View>
      )}
    </Card>
  );
}

function RatioCard({ ratio }: { ratio: DashboardRatio }) {
  const theme = useColorScheme() ?? "light";
  const statusStyles = getStatusStyles(ratio.status, theme);

  return (
    <Card>
      <ThemedText type="defaultSemiBold">
        Phosphorus to protein ratio
      </ThemedText>
      <View style={styles.ratioRow}>
        <ThemedText style={styles.ratioValue}>
          {ratio.value !== null && ratio.value !== undefined
            ? `${formatDecimal(ratio.value, 2)} ${ratio.unit}`
            : "Not enough data"}
        </ThemedText>
        <View style={[styles.statusPill, statusStyles.pill]}>
          <ThemedText style={[styles.statusPillText, statusStyles.text]}>
            {ratioStatusLabel(ratio.status)}
          </ThemedText>
        </View>
      </View>
      {ratio.target !== null && (
        <ThemedText style={styles.helperText}>
          Target ≤ {formatDecimal(ratio.target, 2)} {ratio.unit}
        </ThemedText>
      )}
      <ThemedText style={styles.helperText}>
        Based on the meals you logged this week.
      </ThemedText>
    </Card>
  );
}

function LabsCard({ labs }: { labs: Record<string, LabSummary | null> }) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">Latest labs</ThemedText>
      {LAB_CONFIG.map((config) => {
        const lab = labs?.[config.id];
        return (
          <View key={config.id} style={styles.labRow}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.labLabel}>{config.label}</ThemedText>
              <ThemedText style={styles.labSubtext}>
                {lab?.takenAt
                  ? `Taken ${formatDateShort(lab.takenAt)}`
                  : "No recent result"}
              </ThemedText>
            </View>
            <View style={styles.labValueWrap}>
              <ThemedText style={styles.labValue}>
                {lab?.value !== null && lab?.value !== undefined
                  ? formatDecimal(lab.value, config.precision)
                  : "—"}
              </ThemedText>
              <ThemedText style={styles.labUnit}>
                {lab?.unit ?? config.unit}
              </ThemedText>
              {lab?.abnormalFlag && (
                <View style={styles.flagPill}>
                  <ThemedText style={styles.flagPillText}>
                    {lab.abnormalFlag}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">
        We couldn't load your dashboard
      </ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <ThemedText style={styles.retryText}>Try again</ThemedText>
      </TouchableOpacity>
    </Card>
  );
}

function InlineError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">Couldn't refresh</ThemedText>
      <ThemedText style={styles.helperText}>{message}</ThemedText>
      <TouchableOpacity style={styles.retryButton} onPress={onRetry}>
        <ThemedText style={styles.retryText}>Retry</ThemedText>
      </TouchableOpacity>
    </Card>
  );
}

function ratioStatusLabel(status: DashboardRatio["status"]) {
  switch (status) {
    case "in-range":
      return "In range";
    case "high":
      return "Above target";
    default:
      return "No data";
  }
}

function getStatusStyles(
  status: DashboardRatio["status"],
  theme: "light" | "dark"
) {
  if (status === "in-range") {
    return {
      pill: {
        backgroundColor:
          theme === "light" ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.25)",
      },
      text: { color: theme === "light" ? "#047857" : "#6EE7B7" },
    };
  }
  if (status === "high") {
    return {
      pill: {
        backgroundColor:
          theme === "light" ? "rgba(239,68,68,0.15)" : "rgba(248,113,113,0.3)",
      },
      text: { color: theme === "light" ? "#B91C1C" : "#FCA5A5" },
    };
  }
  return {
    pill: {
      backgroundColor:
        theme === "light" ? "rgba(148,163,184,0.25)" : "rgba(148,163,184,0.35)",
    },
    text: { color: theme === "light" ? "#1F2937" : "#E5E7EB" },
  };
}

function describeRange(range: DashboardRange) {
  if (!range.entries) {
    return `No meals logged in the last ${range.days} days`;
  }
  const from = formatDateShort(range.from);
  const to = formatDateShort(range.to);
  return `${range.entries} meals logged between ${from} and ${to}`;
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDecimal(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  if (decimals === 0) {
    return Math.round(value).toString();
  }
  return parseFloat(value.toFixed(decimals)).toString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

const RADIAL_SIZE = 140;
const RADIAL_STROKE = 14;
const RADIAL_RADIUS = (RADIAL_SIZE - RADIAL_STROKE) / 2;
const RADIAL_CIRCUMFERENCE = 2 * Math.PI * RADIAL_RADIUS;

function RadialProgress({
  percent,
  accentColor,
  trackColor,
  label,
  textColor,
}: {
  percent: number | null;
  accentColor: string;
  trackColor: string;
  label: string;
  textColor: string;
}) {
  const hasPercent = percent !== null && percent !== undefined;
  const clamped = hasPercent ? clamp(percent!, 0, 1) : 0;
  const dashOffset = RADIAL_CIRCUMFERENCE * (1 - clamped);

  return (
    <Svg width={RADIAL_SIZE} height={RADIAL_SIZE}>
      <G rotation="-90" originX={RADIAL_SIZE / 2} originY={RADIAL_SIZE / 2}>
        <Circle
          cx={RADIAL_SIZE / 2}
          cy={RADIAL_SIZE / 2}
          r={RADIAL_RADIUS}
          stroke={trackColor}
          strokeWidth={RADIAL_STROKE}
          fill="transparent"
        />
        <Circle
          cx={RADIAL_SIZE / 2}
          cy={RADIAL_SIZE / 2}
          r={RADIAL_RADIUS}
          stroke={accentColor}
          strokeWidth={RADIAL_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${RADIAL_CIRCUMFERENCE} ${RADIAL_CIRCUMFERENCE}`}
          strokeDashoffset={hasPercent ? dashOffset : RADIAL_CIRCUMFERENCE + 4}
          fill="transparent"
        />
      </G>
      <SvgText
        x={RADIAL_SIZE / 2}
        y={RADIAL_SIZE / 2 + 6}
        textAnchor="middle"
        fill={textColor}
        fontSize={18}
        fontWeight="600"
      >
        {label}
      </SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  header: {
    gap: 4,
  },
  subtleText: {
    opacity: 0.7,
  },
  radialsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
  },
  radialCard: {
    flexBasis: "48%",
    minWidth: 160,
  },
  radialChart: {
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: "600",
  },
  metricUnit: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 2,
  },
  helperText: {
    fontSize: 13,
    opacity: 0.7,
  },
  warningPill: {
    alignSelf: "flex-start",
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(248,113,113,0.18)",
  },
  warningPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7F1D1D",
  },
  ratioRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  ratioValue: {
    fontSize: 24,
    fontWeight: "600",
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "600",
  },
  labRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(148,163,184,0.4)",
  },
  labLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  labSubtext: {
    fontSize: 13,
    opacity: 0.7,
    marginTop: 2,
  },
  labValueWrap: {
    alignItems: "flex-end",
  },
  labValue: {
    fontSize: 22,
    fontWeight: "600",
  },
  labUnit: {
    fontSize: 12,
    opacity: 0.7,
  },
  flagPill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: "rgba(234,179,8,0.25)",
  },
  flagPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#854D0E",
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  cardLight: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  cardDark: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  retryButton: {
    marginTop: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(79,70,229,0.15)",
  },
  retryText: {
    fontWeight: "600",
  },
});
