import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";

import { ThemedText } from "@/components/themed-text";
import { Card } from "@/screens/dashboard/components/Card";
import {
  type TargetDefinitionValue,
  type TargetDomain,
  type TargetItem,
  toQueryErrorMessage,
  useGetTargetsQuery,
  useUpdateTargetMutation,
} from "@/store/services/dashboardApi";

type PickerOption = {
  key: string;
  label: string;
  mode: "clear" | "override";
  value?: TargetDefinitionValue;
};

const METRIC_LABELS: Record<string, string> = {
  caloriesKcal: "Calories",
  phosphorusMg: "Phosphorus",
  potassiumMg: "Potassium",
  proteinG: "Protein",
  sleep_duration_min_day: "Sleep duration",
  sodiumMg: "Sodium",
  steps_per_day: "Steps",
  weight_kg: "Weight",
};

const DOMAIN_LABELS: Record<TargetDomain, string> = {
  lifestyle: "Health targets",
  renal: "Nutrition targets",
};

function cleanLabel(metric: string) {
  return (
    METRIC_LABELS[metric] ??
    metric
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

function displayUnit(
  metric: string,
  target: TargetDefinitionValue,
  unit: string,
) {
  if (metric === "sleep_duration_min_day") return "hours/day";
  if (target.basis === "perKgPerDay") return "per kg/day";
  return unit;
}

function formatMetricAmount(metric: string, value: number) {
  if (metric === "sleep_duration_min_day") {
    const hours = value / 60;
    return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  }
  return Math.round(value).toString();
}

function describeDefinition(
  target: TargetDefinitionValue,
  metric: string,
  unit: string,
) {
  const basisLabel = displayUnit(metric, target, unit);
  if (target.type === "range") {
    const low =
      typeof target.low === "number" ? formatMetricAmount(metric, target.low) : null;
    const high =
      typeof target.high === "number"
        ? formatMetricAmount(metric, target.high)
        : null;
    if (low && high) return `${low} to ${high} ${basisLabel}`;
    if (low) return `${low}+ ${basisLabel}`;
    if (high) return `Up to ${high} ${basisLabel}`;
    return basisLabel;
  }

  const value =
    typeof target.value === "number"
      ? formatMetricAmount(metric, target.value)
      : typeof target.high === "number"
        ? formatMetricAmount(metric, target.high)
        : typeof target.low === "number"
          ? formatMetricAmount(metric, target.low)
          : null;

  if (!value) return basisLabel;
  if (target.type === "max") return `Up to ${value} ${basisLabel}`;
  if (target.type === "min") return `${value}+ ${basisLabel}`;
  return `${value} ${basisLabel}`;
}

function getStep(
  metric: string,
  unit: string,
  basis?: "perDay" | "perKgPerDay" | null,
) {
  if (basis === "perKgPerDay") return 0.1;
  if (metric.includes("steps")) return 2000;
  if (metric.includes("sleep")) return 60;
  if (metric.includes("weight")) return 1;
  if (metric.includes("calories")) return 100;
  if (metric.includes("protein")) return 5;
  if (unit.includes("mg")) return 100;
  return 1;
}

function getOffsets(metric: string) {
  if (metric === "weight_kg") {
    return [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  }
  return [-4, -3, -2, -1, 0, 1, 2, 3, 4];
}

function serialiseOption(value: TargetDefinitionValue) {
  return JSON.stringify(value);
}

function buildNumericOptions(
  item: TargetItem,
  selected: TargetDefinitionValue,
): PickerOption[] {
  const pivot =
    typeof selected.value === "number"
      ? selected.value
      : typeof selected.high === "number"
        ? selected.high
        : (selected.low ?? 0);
  const step = getStep(item.metric, item.unit, selected.basis);
  const values = getOffsets(item.metric)
    .map((offset) => Math.max(0, pivot + offset * step))
    .filter((value, index, list) => list.indexOf(value) === index);

  return values.map((value) => ({
    key: serialiseOption({ ...selected, value }),
    label: describeDefinition({ ...selected, value }, item.metric, item.unit),
    mode: "override",
    value: { ...selected, value },
  }));
}

function buildRangeOptions(
  item: TargetItem,
  selected: TargetDefinitionValue,
): PickerOption[] {
  const low = selected.low ?? 0;
  const baseStep = getStep(item.metric, item.unit, selected.basis);
  const high = selected.high ?? low + baseStep * 2;
  const width = Math.max(high - low, baseStep);
  const step = baseStep;

  return getOffsets(item.metric).map((offset) => {
    const nextLow = Math.max(0, low + offset * step);
    const nextHigh = nextLow + width;
    const value: TargetDefinitionValue = {
      ...selected,
      high: nextHigh,
      low: nextLow,
      value: null,
    };
    return {
      key: serialiseOption(value),
      label: describeDefinition(value, item.metric, item.unit),
      mode: "override",
      value,
    };
  });
}

function buildPickerOptions(item: TargetItem): PickerOption[] {
  const selected = item.personalGoal ?? item.recommended;
  const options =
    selected.type === "range"
      ? buildRangeOptions(item, selected)
      : buildNumericOptions(item, selected);

  const deduped = options.filter(
    (option, index, list) =>
      list.findIndex((candidate) => candidate.key === option.key) === index,
  );

  return [
    {
      key: "__recommended__",
      label: `Use general reference • ${describeDefinition(item.recommended, item.metric, item.unit)}`,
      mode: "clear",
    },
    ...deduped,
  ];
}

function getSelectedOptionKey(item: TargetItem) {
  return item.personalGoal
    ? serialiseOption(item.personalGoal)
    : "__recommended__";
}

export default function TargetsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    domain?: string;
    title?: string;
  }>();
  const domainParam = Array.isArray(params.domain)
    ? params.domain[0]
    : params.domain;
  const titleParam = Array.isArray(params.title)
    ? params.title[0]
    : params.title;
  const domain: TargetDomain | undefined =
    domainParam === "renal" || domainParam === "lifestyle"
      ? domainParam
      : undefined;

  const { data, error, isFetching, isLoading, refetch } =
    useGetTargetsQuery(domain);
  const [updateTarget, { isLoading: isSaving }] = useUpdateTargetMutation();
  const [selectedKeys, setSelectedKeys] = useState<Record<string, string>>({});
  const [savingMetric, setSavingMetric] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const title =
    typeof titleParam === "string" && titleParam.trim()
      ? titleParam
      : domain
        ? DOMAIN_LABELS[domain]
        : "Targets";

  useEffect(() => {
    if (!items.length) return;
    setSelectedKeys(
      Object.fromEntries(
        items.map((item) => [item.metric, getSelectedOptionKey(item)]),
      ),
    );
  }, [items]);

  const optionsByMetric = useMemo(
    () =>
      Object.fromEntries(
        items.map((item) => [item.metric, buildPickerOptions(item)]),
      ),
    [items],
  );

  const errorMessage =
    screenError ??
    toQueryErrorMessage(error, "We couldn't load your targets right now");

  async function handleSave(item: TargetItem) {
    const savedKey = getSelectedOptionKey(item);
    const selectedKey = selectedKeys[item.metric] ?? savedKey;
    const selectedOption =
      optionsByMetric[item.metric]?.find(
        (option) => option.key === selectedKey,
      ) ?? null;

    if (!selectedOption || selectedKey === savedKey) return;

    try {
      setSavingMetric(item.metric);
      setScreenError(null);
      if (selectedOption.mode === "clear") {
        await updateTarget({
          clearOverride: true,
          metric: item.metric,
          reason: "Patient changed target from target screen",
        }).unwrap();
      } else if (selectedOption.value) {
        await updateTarget({
          metric: item.metric,
          override: selectedOption.value,
          reason: "Patient changed target from target screen",
        }).unwrap();
      }
    } catch (err) {
      setScreenError(toQueryErrorMessage(err, "Couldn't save target"));
    } finally {
      setSavingMetric(null);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ gap: 12, padding: 16, paddingBottom: 32 }}
      refreshControl={
        <RefreshControl
          refreshing={isFetching && !isLoading}
          onRefresh={refetch}
        />
      }
    >
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <TouchableOpacity onPress={() => router.back()}>
          <ThemedText style={{ fontWeight: "600" }}>‹ Back</ThemedText>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.back()}>
          <MaterialIcons color="#475569" name="close" size={22} />
        </TouchableOpacity>
      </View>

      <View style={{ gap: 4 }}>
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          General references are educational starting points, not personalised
          clinical advice. You can set a separate personal goal; a care-team
          target, when present, remains unchanged.
        </ThemedText>
        {typeof data?.weightKg === "number" ? (
          <ThemedText style={{ opacity: 0.6 }}>
            Weight-based references use {Math.round(data.weightKg)} kg.
          </ThemedText>
        ) : items.some(
            (item) =>
              item.recommended?.basis === "perKgPerDay" ||
              item.effective?.basis === "perKgPerDay",
          ) ? (
          <ThemedText style={{ opacity: 0.6 }}>
            Add your weight to convert per kg targets into daily amounts.
          </ThemedText>
        ) : null}
      </View>

      {isLoading ? (
        <View style={{ alignItems: "center", gap: 10, paddingVertical: 28 }}>
          <ActivityIndicator size="large" />
          <ThemedText>Loading targets...</ThemedText>
        </View>
      ) : null}

      {screenError || error ? (
        <Card>
          <ThemedText type="defaultSemiBold">Could not load targets</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>{errorMessage}</ThemedText>
          <TouchableOpacity onPress={refetch} style={{ marginTop: 8 }}>
            <ThemedText style={{ fontWeight: "700" }}>Retry</ThemedText>
          </TouchableOpacity>
        </Card>
      ) : null}

      {!isLoading && items.length === 0 ? (
        <Card>
          <ThemedText type="defaultSemiBold">No targets found</ThemedText>
          <ThemedText style={{ opacity: 0.7 }}>
            This section does not have editable targets yet.
          </ThemedText>
        </Card>
      ) : null}

      {items.map((item) => {
        const savedKey = getSelectedOptionKey(item);
        const currentKey = selectedKeys[item.metric] ?? savedKey;
        const pickerOptions = optionsByMetric[item.metric] ?? [];
        const isItemSaving = isSaving && savingMetric === item.metric;
        const hasChanged = currentKey !== savedKey;

        return (
          <Card key={item.metric}>
            <View style={{ gap: 6 }}>
              <View
                style={{
                  alignItems: "center",
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <ThemedText type="defaultSemiBold">
                  {cleanLabel(item.metric)}
                </ThemedText>
                <ThemedText style={{ opacity: 0.6 }}>{item.unit}</ThemedText>
              </View>
              <ThemedText style={{ opacity: 0.75 }}>
                {item.careTeamTarget
                  ? "Care-team target"
                  : item.personalGoal
                    ? "Personal goal"
                    : "General reference"}
                : {describeDefinition(item.effective, item.metric, item.unit)}
              </ThemedText>
              <View
                style={{
                  backgroundColor: "#F8FAFC",
                  borderColor: "#CBD5E1",
                  borderRadius: 14,
                  borderWidth: 1,
                  overflow: "hidden",
                }}
              >
                <Picker
                  selectedValue={currentKey}
                  onValueChange={(value) =>
                    setSelectedKeys((current) => ({
                      ...current,
                      [item.metric]: String(value),
                    }))
                  }
                >
                  {pickerOptions.map((option) => (
                    <Picker.Item
                      key={option.key}
                      label={option.label}
                      value={option.key}
                    />
                  ))}
                </Picker>
              </View>
              <TouchableOpacity
                disabled={isItemSaving || !hasChanged}
                onPress={() => handleSave(item)}
                style={{
                  alignItems: "center",
                  backgroundColor:
                    isItemSaving || !hasChanged ? "#94A3B8" : "#0F172A",
                  borderRadius: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                }}
              >
                <ThemedText style={{ color: "#FFF", fontWeight: "700" }}>
                  {isItemSaving
                    ? "Saving..."
                    : hasChanged
                      ? "Save personal goal"
                      : "Saved"}
                </ThemedText>
              </TouchableOpacity>
              <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                General reference: {describeDefinition(item.recommended, item.metric, item.unit)}
              </ThemedText>
              {item.careTeamTarget ? (
                <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                  Set by {item.careTeamTargetMeta?.setBy.displayName || "your care team"}
                  {item.careTeamTargetMeta?.setAt
                    ? ` on ${new Date(item.careTeamTargetMeta.setAt).toLocaleDateString()}`
                    : ""}
                  . Your selector above changes only your separate personal goal.
                </ThemedText>
              ) : null}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
