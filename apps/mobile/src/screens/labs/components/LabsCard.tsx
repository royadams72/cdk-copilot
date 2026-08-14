import { ThemedText } from "@/components/themed-text";
import { View } from "react-native";

import { LAB_CONFIG } from "../../dashboard/constants";
import { Card } from "../../dashboard/components/Card";
import { LabSummary } from "../../dashboard/types";
import { formatDateShort, formatDecimal } from "../../dashboard/utils";
import { AppButton } from "@/components/ui/button";
import { theme } from "@/constants/theme";

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
  labs: {
    tracked: Record<string, LabSummary | null>;
    recent: LabSummary[];
  };
  onAdd: () => void;
  onEdit: () => void;
  onHistory: () => void;
}) {
  const displayLabs =
    labs.recent?.length > 0
      ? labs.recent.slice(0, 3)
      : Object.values(labs.tracked ?? {})
          .filter((lab): lab is LabSummary => !!lab)
          .slice(0, 3);

  return (
    <Card>
      <ThemedText type="defaultSemiBold" style={{ color: theme.colors.panelHeader }}>Latest labs</ThemedText>
      {displayLabs.map((lab, index) => {
        const config =
          LAB_CONFIG.find((item) =>
            item.codes.some((code) => code.toLowerCase() === lab.code.toLowerCase()),
          ) ??
          LAB_CONFIG.find((item) => item.label.toLowerCase() === lab.label.toLowerCase());

        const value = lab?.value ?? null;
        const range = resolveRange(lab, config?.normalLow, config?.normalHigh);
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
            key={`${lab.id ?? lab.code ?? "lab"}-${lab.takenAt ?? "no-date"}-${index}`}
            style={{
              borderTopWidth: 1,
              borderColor: theme.colors.borderSubtle,
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
                  {lab.label}
                </ThemedText>
                <ThemedText style={{ opacity: 0.72, fontSize: 13 }}>
                  {range.low !== null && range.high !== null
                    ? `Normal range: ${formatDecimal(range.low, config?.precision ?? 1)} - ${formatDecimal(range.high, config?.precision ?? 1)} ${lab?.unit ?? config?.unit ?? ""}`
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
                    borderColor: theme.colors.warning,
                    backgroundColor: isOutOfRange
                      ? theme.colors.warningSoft
                      : theme.colors.successSoft,
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      backgroundColor: isOutOfRange ? theme.colors.warningDark : theme.colors.successDark,
                    }}
                  >
                    <ThemedText style={{ color: "white", fontWeight: "700" }}>
                      {value !== null ? formatDecimal(value, config?.precision ?? 1) : "—"}
                    </ThemedText>
                  </View>
                  {!!status && (
                    <View style={{ paddingHorizontal: 8, paddingVertical: 6 }}>
                      <ThemedText style={{ fontWeight: "700", color: theme.colors.warningDark }}>
                        {status}
                      </ThemedText>
                    </View>
                  )}
                </View>
                <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                  {lab?.unit ?? config?.unit ?? ""}
                </ThemedText>
              </View>
            </View>

            <View style={{ paddingTop: 4 }}>
              <View
                style={{
                  height: 10,
                  borderRadius: 999,
                  overflow: "hidden",
                  backgroundColor: theme.colors.control,
                  flexDirection: "row",
                }}
              >
                <View style={{ width: `${lowPct}%`, backgroundColor: theme.colors.warning }} />
                <View
                  style={{
                    width: `${Math.max(0, highPct - lowPct)}%`,
                    backgroundColor: theme.colors.success,
                  }}
                />
                <View
                  style={{
                    width: `${Math.max(0, 100 - highPct)}%`,
                    backgroundColor: theme.colors.warning,
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
                    borderTopColor: theme.colors.textSecondary,
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
                    {formatDecimal(range.low, config?.precision ?? 1)}
                  </ThemedText>
                  <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                    {formatDecimal(range.high, config?.precision ?? 1)}
                  </ThemedText>
                </View>
              )}
            </View>
          </View>
        );
      })}
      {displayLabs.length === 0 ? (
        <ThemedText style={{ opacity: 0.7 }}>No recent lab results yet.</ThemedText>
      ) : null}
      <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <AppButton label="Add lab results" onPress={onAdd} size="compact" />
        <AppButton label="Edit" onPress={onEdit} variant="outline" size="compact" />
        <AppButton label="Labs history" onPress={onHistory} variant="secondary" size="compact" />
      </View>
    </Card>
  );
}
