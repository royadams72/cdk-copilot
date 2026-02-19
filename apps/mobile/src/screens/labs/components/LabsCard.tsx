import { ThemedText } from "@/components/themed-text";
import { TouchableOpacity, View } from "react-native";

import { LAB_CONFIG } from "../../dashboard/constants";
import { Card } from "../../dashboard/components/Card";
import { LabSummary } from "../../dashboard/types";
import { formatDateShort, formatDecimal } from "../../dashboard/utils";

function resolveRange(
  lab: LabSummary | null,
  fallbackLow: number | undefined,
  fallbackHigh: number | undefined,
) {
  const low = lab?.refRange?.low ?? fallbackLow ?? null;
  const high = lab?.refRange?.high ?? fallbackHigh ?? null;
  return { high, low, text: lab?.refRange?.text ?? null };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function computeScale(
  value: number | null,
  low: number | null,
  high: number | null,
) {
  const fallbackMin = 0;
  const fallbackMax = 100;
  if (low === null || high === null || high <= low) {
    const safeValue = value ?? (fallbackMin + fallbackMax) / 2;
    const min = Math.min(fallbackMin, safeValue * 0.5);
    const max = Math.max(fallbackMax, safeValue * 1.5);
    return {
      max,
      min,
      normalHigh: null as number | null,
      normalLow: null as number | null,
    };
  }

  const span = high - low;
  const pad = span * 0.6;
  return {
    max: high + pad,
    min: Math.max(0, low - pad),
    normalHigh: high,
    normalLow: low,
  };
}

function statusLabel(
  value: number | null,
  low: number | null,
  high: number | null,
  abnormalFlag: string | null,
) {
  if (abnormalFlag === "L" || abnormalFlag === "LL") return "Low";
  if (abnormalFlag === "H" || abnormalFlag === "HH") return "High";
  if (abnormalFlag === "N") return "Normal";
  if (value === null || low === null || high === null || high <= low) return "";
  if (value < low) return "Low";
  if (value > high) return "High";
  return "Normal";
}

export function LabsCard({
  labs,
  onAdd,
  onEdit,
  onHistory,
}: {
  labs: Record<string, LabSummary | null>;
  onAdd: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  return (
    <Card>
      <ThemedText type="defaultSemiBold">Latest labs</ThemedText>
      {LAB_CONFIG.map((config) => {
        const lab = labs?.[config.id];
        const value = lab?.value ?? null;
        const range = resolveRange(lab, config.normalLow, config.normalHigh);
        const { min, max, normalLow, normalHigh } = computeScale(
          value,
          range.low,
          range.high,
        );

        const lowPct =
          normalLow !== null && normalHigh !== null
            ? clamp(((normalLow - min) / (max - min)) * 100, 0, 100)
            : 30;
        const highPct =
          normalLow !== null && normalHigh !== null
            ? clamp(((normalHigh - min) / (max - min)) * 100, 0, 100)
            : 70;
        const markerPct =
          value !== null ? clamp(((value - min) / (max - min)) * 100, 0, 100) : 50;

        const status = statusLabel(
          value,
          range.low,
          range.high,
          lab?.abnormalFlag ?? null,
        );
        const isOutOfRange = status === "High" || status === "Low";

        return (
          <View
            key={config.id}
            style={{
              borderTopWidth: 1,
              borderColor: "rgba(148,163,184,0.35)",
              paddingTop: 12,
              paddingBottom: 10,
              gap: 8,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View style={{ flex: 1 }}>
                <ThemedText style={{ fontSize: 17, fontWeight: "600" }}>
                  {config.label}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72, fontSize: 13 }}>
                  {range.low !== null && range.high !== null
                    ? `Normal range: ${formatDecimal(range.low, config.precision)} - ${formatDecimal(range.high, config.precision)} ${lab?.unit ?? config.unit}`
                    : range.text ?? "Reference range unavailable"}
                </ThemedText>
                <ThemedText style={{ opacity: 0.68, fontSize: 12, marginTop: 2 }}>
                  {lab?.takenAt ? `Taken ${formatDateShort(lab.takenAt)}` : "No recent result"}
                </ThemedText>
              </View>

              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    borderRadius: 8,
                    overflow: "hidden",
                    borderWidth: 1,
                    borderColor: "rgba(146,64,14,0.35)",
                    backgroundColor: isOutOfRange
                      ? "rgba(234,179,8,0.18)"
                      : "rgba(16,185,129,0.16)",
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: isOutOfRange ? "#A16207" : "#047857",
                    }}
                  >
                    <ThemedText style={{ color: "white", fontWeight: "700" }}>
                      {value !== null ? formatDecimal(value, config.precision) : "—"}
                    </ThemedText>
                  </View>
                  {!!status && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                      <ThemedText style={{ fontWeight: "700", color: "#6B4F00" }}>
                        {status}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                  {lab?.unit ?? config.unit}
                </ThemedText>
              </View>
            </View>

            <View style={{ paddingTop: 4 }}>
              <View
                style={{
                  height: 10,
                  borderRadius: 999,
                  overflow: "hidden",
                  backgroundColor: "rgba(148,163,184,0.2)",
                  flexDirection: "row",
                }}
              >
                <View style={{ width: `${lowPct}%`, backgroundColor: "#D4AF37" }} />
                <View
                  style={{
                    width: `${Math.max(0, highPct - lowPct)}%`,
                    backgroundColor: "#2F9E44",
                  }}
                />
                <View
                  style={{
                    width: `${Math.max(0, 100 - highPct)}%`,
                    backgroundColor: "#D4AF37",
                  }}
                />
              </View>

              {value !== null && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    left: `${markerPct}%`,
                    marginLeft: -7,
                    width: 0,
                    height: 0,
                    borderLeftWidth: 7,
                    borderRightWidth: 7,
                    borderTopWidth: 9,
                    borderLeftColor: "transparent",
                    borderRightColor: "transparent",
                    borderTopColor: "#334155",
                  }}
                />
              )}

              {range.low !== null && range.high !== null && (
                <View
                  style={{
                    marginTop: 6,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    paddingHorizontal: 2,
                  }}
                >
                  <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                    {formatDecimal(range.low, config.precision)}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                    {formatDecimal(range.high, config.precision)}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        );
      })}
      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <TouchableOpacity
          onPress={onAdd}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: "rgba(16,185,129,0.16)",
          }}
        >
          <ThemedText style={{ fontWeight: "700", color: "#065F46" }}>
            Add lab results
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onEdit}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: "rgba(59,130,246,0.15)",
          }}
        >
          <ThemedText style={{ fontWeight: "700", color: "#1E3A8A" }}>
            Edit
          </ThemedText>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onHistory}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: "rgba(245,158,11,0.18)",
          }}
        >
          <ThemedText style={{ fontWeight: "700", color: "#92400E" }}>
            Labs history
          </ThemedText>
        </TouchableOpacity>
      </View>
    </Card>
  );
}
