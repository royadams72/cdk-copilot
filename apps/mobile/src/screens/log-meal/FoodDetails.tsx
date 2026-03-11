import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "expo-router";
import { Picker } from "@react-native-picker/picker";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { TEdamamMeasure } from "@ckd/core";

import { ThemedText } from "@/components/themed-text";
import { FoodCard } from "@/components/food-card";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useFetchNutritionDataMutation } from "@/store/services/logMealApi";
import {
  applyNutritionResults,
  saveActiveItemToMeal,
  type ItemSummary,
  selectAcitveGroupSummaries,
  selectActiveItem,
  selectEditingEntryId,
  selectGroupInfoById,
  setActiveItem,
  setPortion,
} from "@/store/slices/logMealSlice";

import { NutritionStyles } from "../nutrition/styles";
import { typeStyles } from "../styles";
import { logMealStyles } from "./styles";

type PortionMode = "gram" | "serving";

type PickerOption = {
  label: string;
  value: string;
};

const SERVING_STEP = 0.05;
const GRAM_MIN = 1;
const GRAM_MAX = 500;
const LARGE_GRAM_STEP = 10;
const LARGE_GRAM_MAX = 2000;
const EPSILON = 0.0001;

export default function FoodDetails() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [fetchNutritionData] = useFetchNutritionDataMutation();
  const selectedFood = useAppSelector(selectActiveItem);
  const editingEntryId = useAppSelector(selectEditingEntryId);
  const foods = useAppSelector(selectAcitveGroupSummaries);
  const requestedNutritionByUidRef = useRef(new Set<string>());
  const groupInfo = useAppSelector((state) => {
    const groupId = selectedFood?.groupId;
    if (!groupId) return null;
    return selectGroupInfoById(groupId)(state);
  });

  const hasMissingCoreNutrients = (food: NonNullable<typeof selectedFood>) => {
    const nutrients = food.nutrients ?? {};
    return (
      nutrients.caloriesKcal == null ||
      nutrients.proteinG == null ||
      nutrients.phosphorusMg == null ||
      nutrients.potassiumMg == null ||
      nutrients.sodiumMg == null
    );
  };

  useEffect(() => {
    if (!selectedFood || !groupInfo || !selectedFood.uid) return;
    if (!hasMissingCoreNutrients(selectedFood)) return;
    if (requestedNutritionByUidRef.current.has(selectedFood.uid)) return;

    requestedNutritionByUidRef.current.add(selectedFood.uid);
    void (async () => {
      try {
        const results = await fetchNutritionData({
          foodItems: selectedFood,
        }).unwrap();
        dispatch(
          applyNutritionResults({
            requestedFoodIds: [selectedFood.foodId],
            results,
          }),
        );
      } catch (error) {
        console.log("fetchNutritionData failed", error);
      }
    })();
  }, [selectedFood, groupInfo, dispatch, fetchNutritionData]);

  const portionConfig = useMemo(
    () =>
      selectedFood
        ? resolvePortionConfig(
            selectedFood.measures ?? [],
            selectedFood.unit,
            groupInfo?.quantity ?? selectedFood.quantity,
            groupInfo?.unit ?? selectedFood.unit,
          )
        : null,
    [groupInfo?.quantity, groupInfo?.unit, selectedFood],
  );

  const formatNutrientLabel = (key: string) =>
    nutrientLabels[key] ??
    key
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (char) => char.toUpperCase());

  const applyPortionChange = (
    nextMode: PortionMode,
    nextQuantityRaw: number,
  ) => {
    if (!selectedFood || !selectedFood.groupId || !groupInfo || !portionConfig) {
      return;
    }

    const currentMode = portionConfig.mode;
    const currentQuantity = groupInfo.quantity ?? selectedFood.quantity;
    const currentWeight = quantityToWeight(
      currentQuantity,
      currentMode,
      portionConfig.servingWeight,
    );
    const nextQuantity = sanitizeQuantity(nextQuantityRaw, nextMode);
    const nextWeight = quantityToWeight(
      nextQuantity,
      nextMode,
      portionConfig.servingWeight,
    );
    const nutrientRatio =
      currentWeight > 0 && nextWeight > 0 ? nextWeight / currentWeight : 1;

    dispatch(
      setPortion({
        foodId: selectedFood.foodId,
        groupId: selectedFood.groupId,
        nutrientRatio,
        quantity: nextQuantity,
        uid: selectedFood.uid,
        unit: nextMode === "gram" ? "gram" : portionConfig.servingLabel,
      }),
    );
  };

  const handleModeChange = (nextModeValue: string) => {
    if (!portionConfig || !groupInfo) return;
    const nextMode = nextModeValue === "gram" ? "gram" : "serving";
    if (nextMode === portionConfig.mode) return;

    const currentWeight = quantityToWeight(
      groupInfo.quantity,
      portionConfig.mode,
      portionConfig.servingWeight,
    );
    const convertedQuantity =
      nextMode === "gram"
        ? currentWeight
        : currentWeight / (portionConfig.servingWeight || 1);
    applyPortionChange(nextMode, convertedQuantity);
  };

  const handleQuantityChange = (nextValue: string) => {
    if (!portionConfig) return;
    const nextQuantity = Number.parseFloat(nextValue);
    if (Number.isNaN(nextQuantity)) return;
    applyPortionChange(portionConfig.mode, nextQuantity);
  };

  const quantityOptions = useMemo(() => {
    if (!portionConfig || !groupInfo) return [];
    return buildQuantityOptions(portionConfig.mode, groupInfo.quantity);
  }, [groupInfo, portionConfig]);

  return (
    <View style={NutritionStyles.container}>
      <ScrollView
        style={logMealStyles.screenScroll}
        contentContainerStyle={logMealStyles.screenContent}
      >
        {selectedFood && groupInfo && portionConfig ? (
          <View style={logMealStyles.detailsWrap}>
            <Text style={typeStyles.title}>{selectedFood.name}</Text>

            <View style={logMealStyles.controlCard}>
              <View style={logMealStyles.controlRow}>
                <View style={logMealStyles.controlField}>
                  <Text style={logMealStyles.controlLabel}>Unit</Text>
                  <View style={logMealStyles.pickerShell}>
                    <Picker
                      selectedValue={portionConfig.mode}
                      onValueChange={handleModeChange}
                    >
                      {portionConfig.availableModes.map((mode) => (
                        <Picker.Item
                          key={mode}
                          label={mode === "gram" ? "Grams" : "Serving"}
                          value={mode}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>

                <View style={logMealStyles.controlField}>
                  <Text style={logMealStyles.controlLabel}>Amount</Text>
                  <View style={logMealStyles.pickerShell}>
                    <Picker
                      selectedValue={String(portionConfig.quantity)}
                      onValueChange={handleQuantityChange}
                    >
                      {quantityOptions.map((option) => (
                        <Picker.Item
                          key={option.value}
                          label={option.label}
                          value={option.value}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>
              </View>

              <Text style={logMealStyles.helperText}>
                {portionConfig.servingWeight
                  ? `1 serving = ${portionConfig.servingLabel} (${formatNumber(portionConfig.servingWeight)} g)`
                  : "Serving weight is not available for this food yet."}
              </Text>
            </View>

            <View style={logMealStyles.nutrientList}>
              {Object.entries(selectedFood.nutrients ?? {})
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([key, value]) => (
                  <View key={key} style={logMealStyles.nutrientRow}>
                    <Text style={logMealStyles.nutrientLabel}>
                      {formatNutrientLabel(key)}
                    </Text>
                    <Text style={logMealStyles.nutrientValue}>
                      {formatNutrientValue(key, value)}
                    </Text>
                  </View>
                ))}
            </View>

            <TouchableOpacity
              style={[
                NutritionStyles.modalButton,
                NutritionStyles.modalButtonPrimary,
              ]}
              onPress={() => {
                dispatch(saveActiveItemToMeal());
                router.push("/(log-meal)/log-meal");
              }}
            >
              <ThemedText style={NutritionStyles.modalButtonTextPrimary}>
                {editingEntryId ? "Update food" : "Add food"}
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}

        {foods &&
          foods.map((food) => (
            <FoodCard
              key={food.uid}
              title={food.name}
              subtitle={`${formatNumber(food.quantity)} ${formatMeasureUnit(food.unit)}`}
              description={buildKnownNutrientSummary(food)}
              onPress={() =>
                dispatch(
                  setActiveItem({
                    foodId: food.foodId,
                    groupId: food.groupId,
                    uid: food.uid,
                  }),
                )
              }
              style={logMealStyles.listCard}
            />
          ))}
      </ScrollView>
    </View>
  );
}

function resolvePortionConfig(
  measures: TEdamamMeasure[],
  itemUnit: string,
  quantity: number,
  groupUnit: string,
) {
  const currentUnit = (groupUnit || itemUnit || "").trim();
  const currentUnitNorm = normalizeUnit(currentUnit);
  const measureLookup = createMeasureLookup(measures);
  const currentMeasure = measureLookup.get(currentUnitNorm);
  const fallbackServingMeasure = findServingMeasure(measureLookup);
  const fallbackPortionMeasure = findFirstNonGramMeasure(measures);

  const servingMeasure = isGramUnit(currentUnitNorm)
    ? fallbackServingMeasure ?? fallbackPortionMeasure
    : currentMeasure ?? fallbackServingMeasure ?? fallbackPortionMeasure;

  const servingWeight = servingMeasure?.weight;
  const servingLabel = servingMeasure?.label?.trim() || "serving";
  const mode: PortionMode = isGramUnit(currentUnitNorm) ? "gram" : "serving";
  const availableModes: PortionMode[] = servingWeight
    ? ["serving", "gram"]
    : mode === "gram"
      ? ["gram"]
      : ["serving"];

  const normalizedQuantity = sanitizeQuantity(quantity, mode);

  return {
    availableModes,
    mode,
    quantity: normalizedQuantity,
    servingLabel,
    servingWeight,
  };
}

function buildQuantityOptions(
  mode: PortionMode,
  currentQuantity: number,
): PickerOption[] {
  const values = new Set<number>();
  const safeCurrent = sanitizeQuantity(currentQuantity, mode);

  if (mode === "gram") {
    for (let value = GRAM_MIN; value <= GRAM_MAX; value += 1) {
      values.add(value);
    }
    for (
      let value = GRAM_MAX + LARGE_GRAM_STEP;
      value <= LARGE_GRAM_MAX;
      value += LARGE_GRAM_STEP
    ) {
      values.add(value);
    }
    addLocalRange(values, safeCurrent, 25, 1, GRAM_MIN);
  } else {
    for (let value = 0.25; value <= 20 + EPSILON; value += SERVING_STEP) {
      values.add(roundToStep(value, SERVING_STEP));
    }
    addLocalRange(values, safeCurrent, 20, SERVING_STEP, 0.05);
  }

  values.add(safeCurrent);

  return Array.from(values)
    .sort((a, b) => a - b)
    .map((value) => ({
      label: formatNumber(value),
      value: String(value),
    }));
}

function addLocalRange(
  values: Set<number>,
  center: number,
  stepsEachSide: number,
  step: number,
  minimum: number,
) {
  for (let index = -stepsEachSide; index <= stepsEachSide; index += 1) {
    const nextValue = center + index * step;
    if (nextValue < minimum) continue;
    values.add(roundToStep(nextValue, step));
  }
}

function createMeasureLookup(measures: TEdamamMeasure[]) {
  return new Map(
    measures.map((measure) => [normalizeUnit(measure.label), measure] as const),
  );
}

function findServingMeasure(measuresByLabel: Map<string, TEdamamMeasure>) {
  return measuresByLabel.get("serving");
}

function findFirstNonGramMeasure(measures: TEdamamMeasure[]) {
  return measures.find((measure) => !isGramUnit(normalizeUnit(measure.label)));
}

function quantityToWeight(
  quantity: number,
  mode: PortionMode,
  servingWeight?: number,
) {
  if (mode === "gram") return quantity;
  if (!servingWeight) return quantity;
  return quantity * servingWeight;
}

function sanitizeQuantity(quantity: number, mode: PortionMode) {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return mode === "gram" ? 150 : 1;
  }
  return mode === "gram"
    ? Math.max(GRAM_MIN, Math.round(quantity))
    : roundToStep(Math.max(0.05, quantity), SERVING_STEP);
}

function roundToStep(value: number, step: number) {
  const rounded = Math.round(value / step) * step;
  return Math.round(rounded * 100) / 100;
}

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase();
}

function isGramUnit(unit: string) {
  return ["g", "gram", "grams"].includes(unit);
}

function formatMeasureUnit(unit: string) {
  return isGramUnit(normalizeUnit(unit)) ? "g" : unit;
}

function formatNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  if (Math.abs(rounded - Math.round(rounded)) < EPSILON) {
    return String(Math.round(rounded));
  }
  if (Math.abs(rounded * 10 - Math.round(rounded * 10)) < EPSILON) {
    return rounded.toFixed(1);
  }
  return rounded.toFixed(2);
}

function formatNutrientValue(key: string, value: number) {
  const unit = nutrientUnits[key] ?? "";
  const formattedValue = formatNumber(value);
  return unit ? `${formattedValue} ${unit}` : formattedValue;
}

function buildKnownNutrientSummary(food: ItemSummary) {
  const parts = [
    buildNutrientPart("Calories", food.caloriesKcal, "kcal"),
    buildNutrientPart("Protein", food.proteinG, "g"),
    buildNutrientPart("Phosphorus", food.phosphorusMg, "mg"),
    buildNutrientPart("Potassium", food.potassiumMg, "mg"),
    buildNutrientPart("Sodium", food.sodiumMg, "mg"),
  ].filter(Boolean);

  return parts.join("  |  ");
}

function buildNutrientPart(label: string, rawValue: string, unit: string) {
  const value = Number.parseFloat(rawValue);
  if (!Number.isFinite(value) || value <= 0) return "";
  return `${label} ${formatNumber(value)} ${unit}`;
}

const nutrientUnits: Record<string, string> = {
  caloriesKcal: "kcal",
  carbsG: "g",
  fatG: "g",
  fiberG: "g",
  phosphorusMg: "mg",
  phosphorus_protein_ratio: "",
  potassiumMg: "mg",
  proteinG: "g",
  sodiumMg: "mg",
};

const nutrientLabels: Record<string, string> = {
  caloriesKcal: "Calories",
  carbsG: "Carbs",
  fatG: "Fat",
  fiberG: "Fiber",
  phosphorusMg: "Phosphorus",
  phosphorus_protein_ratio: "Phosphorus/Protein Ratio",
  potassiumMg: "Potassium",
  proteinG: "Protein",
  sodiumMg: "Sodium",
};
