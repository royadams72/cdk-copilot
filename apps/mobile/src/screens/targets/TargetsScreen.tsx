import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Picker } from "@react-native-picker/picker";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert } from "react-native";
import { API } from "@/constants/api";
import { APP_ROUTES } from "@/constants/routes";
import { authFetch } from "@/lib/authFetch";

import { ThemedText } from "@/components/themed-text";
import { AppButton } from "@/components/ui/button";
import { Card } from "@/screens/dashboard/components/Card";
import {
  type TargetDefinitionValue,
  type TargetDomain,
  type TargetItem,
  toQueryErrorMessage,
  useGetTargetsQuery,
  useUpdateTargetMutation,
} from "@/store/services/dashboardApi";
import { AppScreen } from "@/components/app-screen";

type PickerOption = {
  key: string;
  label: string;
  mode: "unset" | "reference" | "override";
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
      typeof target.low === "number"
        ? formatMetricAmount(metric, target.low)
        : null;
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
    .filter((value) => value > 0)
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
    { key: "__unset__", label: "No personal target", mode: "unset" },
    {
      key: "__recommended__",
      label: `Use general reference • ${describeDefinition(item.recommended, item.metric, item.unit)}`,
      mode: "reference",
    },
    ...deduped,
  ];
}

function getSelectedOptionKey(item: TargetItem, onboarding = false) {
  return item.personalGoal
    ? serialiseOption(item.personalGoal)
    : item.generalReferenceSelected === false ||
        (onboarding && item.generalReferenceSelected !== true)
      ? "__unset__"
      : "__recommended__";
}

export default function TargetsScreen({
  onboarding = false,
}: {
  onboarding?: boolean;
}) {
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

  const { data, error, isLoading, refetch } = useGetTargetsQuery(domain);
  const [updateTarget, { isLoading: isSaving }] = useUpdateTargetMutation();
  const [selectedKeys, setSelectedKeys] = useState<Record<string, string>>({});
  const [customValues, setCustomValues] = useState<
    Record<string, { high?: string; low?: string; value?: string }>
  >({});
  const [savingMetric, setSavingMetric] = useState<string | null>(null);
  const [screenError, setScreenError] = useState<string | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);

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
        items.map((item) => [
          item.metric,
          getSelectedOptionKey(item, onboarding),
        ]),
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
    const savedKey = getSelectedOptionKey(item, onboarding);
    const selectedKey = selectedKeys[item.metric] ?? savedKey;
    const selectedOption =
      optionsByMetric[item.metric]?.find(
        (option) => option.key === selectedKey,
      ) ?? null;

    if (!selectedOption || selectedKey === savedKey) return;

    try {
      setSavingMetric(item.metric);
      setScreenError(null);
      if (selectedOption.mode === "unset") {
        await updateTarget({
          clearTarget: true,
          metric: item.metric,
          reason: "Patient left target unset",
        }).unwrap();
      } else if (selectedOption.mode === "reference") {
        await updateTarget({
          metric: item.metric,
          reason: "Patient chose general reference",
          selectGeneralReference: true,
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

  async function handleSaveCustom(item: TargetItem) {
    const template = item.personalGoal ?? item.recommended;
    const input = customValues[item.metric] ?? {};
    const isRange = template.type === "range";
    const low = Number(input.low);
    const high = Number(input.high);
    const value = Number(input.value);
    if (
      isRange
        ? !input.low ||
          !input.high ||
          !Number.isFinite(low) ||
          !Number.isFinite(high) ||
          low <= 0 ||
          high <= low
        : !input.value || !Number.isFinite(value) || value <= 0
    ) {
      Alert.alert(
        "Check your goal",
        isRange
          ? "Enter a lower and upper value, both above zero."
          : "Enter a value above zero.",
      );
      return;
    }
    try {
      setSavingMetric(item.metric);
      setScreenError(null);
      const definition: TargetDefinitionValue = isRange
        ? { ...template, high, low, value: null }
        : { ...template, value };
      await updateTarget({
        metric: item.metric,
        override: definition,
        reason: "Patient entered a personal goal",
      }).unwrap();
      setCustomValues((current) => ({ ...current, [item.metric]: {} }));
    } catch (error) {
      setScreenError(toQueryErrorMessage(error, "Couldn't save personal goal"));
    } finally {
      setSavingMetric(null);
    }
  }

  async function handleFinish() {
    const updates: Array<{
      clearTarget?: boolean;
      metric: string;
      override?: TargetDefinitionValue;
      reason: string;
      selectGeneralReference?: boolean;
    }> = [];

    for (const item of items) {
      const input = customValues[item.metric] ?? {};
      const hasCustomInput = Object.values(input).some(
        (value) => !!value?.trim(),
      );

      if (hasCustomInput) {
        const template = item.personalGoal ?? item.recommended;
        const isRange = template.type === "range";
        const low = Number(input.low);
        const high = Number(input.high);
        const value = Number(input.value);
        const isInvalid = isRange
          ? !input.low ||
            !input.high ||
            !Number.isFinite(low) ||
            !Number.isFinite(high) ||
            low <= 0 ||
            high <= low
          : !input.value || !Number.isFinite(value) || value <= 0;

        if (isInvalid) {
          Alert.alert(
            `Check ${cleanLabel(item.metric)}`,
            isRange
              ? "Enter a lower and upper value, both above zero."
              : "Enter a value above zero.",
          );
          return;
        }

        updates.push({
          metric: item.metric,
          override: isRange
            ? { ...template, high, low, value: null }
            : { ...template, value },
          reason: "Patient entered a personal goal during onboarding",
        });
        continue;
      }

      const savedKey = getSelectedOptionKey(item, onboarding);
      const selectedKey = selectedKeys[item.metric] ?? savedKey;
      if (selectedKey === savedKey) continue;

      const selectedOption = optionsByMetric[item.metric]?.find(
        (option) => option.key === selectedKey,
      );
      if (!selectedOption) continue;

      if (selectedOption.mode === "unset") {
        updates.push({
          clearTarget: true,
          metric: item.metric,
          reason: "Patient left target unset during onboarding",
        });
      } else if (selectedOption.mode === "reference") {
        updates.push({
          metric: item.metric,
          reason: "Patient chose general reference during onboarding",
          selectGeneralReference: true,
        });
      } else if (selectedOption.value) {
        updates.push({
          metric: item.metric,
          override: selectedOption.value,
          reason: "Patient changed target during onboarding",
        });
      }
    }

    try {
      setIsFinishing(true);
      setScreenError(null);
      for (const update of updates) {
        await updateTarget(update).unwrap();
      }
      const response = await authFetch(
        `${API}/api/targets/confirm-onboarding`,
        {
          body: JSON.stringify({ confirmed: true }),
          method: "POST",
        },
      );
      if (!response.ok)
        throw new Error("Could not confirm target review. Please try again.");
      router.replace(APP_ROUTES.dashboard);
    } catch (error) {
      Alert.alert(
        "Could not save targets",
        error instanceof Error
          ? error.message
          : "Your targets were not all saved. Please try again.",
      );
    } finally {
      setIsFinishing(false);
    }
  }

  function handleFillReferences() {
    const unset = items.filter(
      (item) =>
        !item.careTeamTarget &&
        (selectedKeys[item.metric] ??
          getSelectedOptionKey(item, onboarding)) === "__unset__",
    );
    const unsetMetrics = new Set(unset.map((item) => item.metric));
    setSelectedKeys((current) => ({
      ...current,
      ...Object.fromEntries(
        unset.map((item) => [item.metric, "__recommended__"]),
      ),
    }));
    setCustomValues((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([metric]) => !unsetMetrics.has(metric)),
      ),
    );
  }

  return (
    <AppScreen
      keyboardAware
      contentContainerStyle={{ paddingBottom: 60, paddingTop: 40 }}
    >
      {!onboarding ? (
        <View
          style={{
            alignItems: "center",
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <AppButton
            label="Back"
            onPress={() => router.back()}
            variant="secondary"
            size="compact"
          />
        </View>
      ) : null}

      <View style={{ gap: 4 }}>
        <ThemedText type="title">{title}</ThemedText>
        <ThemedText style={{ opacity: 0.72 }}>
          {onboarding
            ? "Review each target, then save all your choices below. "
            : ""}
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

      {onboarding &&
      items.some(
        (item) =>
          !item.careTeamTarget &&
          (selectedKeys[item.metric] ??
            getSelectedOptionKey(item, onboarding)) === "__unset__",
      ) ? (
        <AppButton
          disabled={isSaving || isFinishing}
          fullWidth
          label="Use general references for unset metrics"
          onPress={handleFillReferences}
          variant="secondary"
        />
      ) : null}

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
          <AppButton
            label="Retry"
            onPress={refetch}
            size="compact"
            style={{ marginTop: 8 }}
            variant="outline"
          />
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
        const savedKey = getSelectedOptionKey(item, onboarding);
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
                    : item.generalReferenceSelected === false ||
                        (onboarding && item.generalReferenceSelected !== true)
                      ? "No target set"
                      : "General reference"}
                {item.effective &&
                !(
                  onboarding &&
                  !item.careTeamTarget &&
                  !item.personalGoal &&
                  item.generalReferenceSelected !== true
                )
                  ? `: ${describeDefinition(item.effective, item.metric, item.unit)}`
                  : ""}
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
              {!onboarding ? (
                <AppButton
                  disabled={isItemSaving || !hasChanged}
                  fullWidth
                  label={hasChanged ? "Save personal goal" : "Saved"}
                  loading={isItemSaving}
                  onPress={() => handleSave(item)}
                />
              ) : null}
              <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                General reference:{" "}
                {describeDefinition(item.recommended, item.metric, item.unit)}
              </ThemedText>
              <ThemedText style={{ fontSize: 12, opacity: 0.7 }}>
                Or enter your own personal goal (
                {displayUnit(item.metric, item.recommended, item.unit)}):
              </ThemedText>
              {(item.personalGoal ?? item.recommended).type === "range" ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {(["low", "high"] as const).map((field) => (
                    <TextInput
                      key={field}
                      accessibilityLabel={`${cleanLabel(item.metric)} ${field} goal`}
                      keyboardType="decimal-pad"
                      placeholder={
                        field === "low" ? "Lower value" : "Upper value"
                      }
                      value={customValues[item.metric]?.[field] ?? ""}
                      onChangeText={(next) =>
                        setCustomValues((current) => ({
                          ...current,
                          [item.metric]: {
                            ...current[item.metric],
                            [field]: next,
                          },
                        }))
                      }
                      style={{
                        borderColor: "#CBD5E1",
                        borderRadius: 10,
                        borderWidth: 1,
                        flex: 1,
                        padding: 10,
                      }}
                    />
                  ))}
                </View>
              ) : (
                <TextInput
                  accessibilityLabel={`${cleanLabel(item.metric)} personal goal`}
                  keyboardType="decimal-pad"
                  placeholder="Enter a value"
                  value={customValues[item.metric]?.value ?? ""}
                  onChangeText={(next) =>
                    setCustomValues((current) => ({
                      ...current,
                      [item.metric]: { ...current[item.metric], value: next },
                    }))
                  }
                  style={{
                    borderColor: "#CBD5E1",
                    borderRadius: 10,
                    borderWidth: 1,
                    padding: 10,
                  }}
                />
              )}
              {!onboarding ? (
                <AppButton
                  disabled={isItemSaving}
                  fullWidth
                  label="Save custom goal"
                  loading={isItemSaving}
                  onPress={() => handleSaveCustom(item)}
                  variant="outline"
                />
              ) : null}
              {item.careTeamTarget ? (
                <ThemedText style={{ fontSize: 12, opacity: 0.65 }}>
                  Set by{" "}
                  {item.careTeamTargetMeta?.setBy.displayName ||
                    "your care team"}
                  {item.careTeamTargetMeta?.setAt
                    ? ` on ${new Date(item.careTeamTargetMeta.setAt).toLocaleDateString()}`
                    : ""}
                  . Your selector above changes only your separate personal
                  goal.
                </ThemedText>
              ) : null}
            </View>
          </Card>
        );
      })}
      {onboarding && !isLoading && !error && items.length > 0 ? (
        <AppButton
          disabled={isFinishing || isSaving}
          fullWidth
          label="Save targets and continue"
          loading={isFinishing}
          onPress={handleFinish}
          size="large"
        />
      ) : null}
    </AppScreen>
  );
}
