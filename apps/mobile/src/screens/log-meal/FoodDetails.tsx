import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Picker } from "@react-native-picker/picker";
import { Modal, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { TEdamamMeasure } from "@ckd/core";
import type { TNutrientEstimate } from "../../../../../packages/core/src/isomorphic/schemas/nutrient_estimation";

import { ThemedText } from "@/components/themed-text";
import { FoodCard } from "@/components/food-card";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useFetchNutritionDataMutation } from "@/store/services/logMealApi";
import {
  applyNutritionResults,
  type ItemSummary,
  saveActiveItemToMeal,
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
import { hasMissingCoreNutrients } from "./utils";

type PortionMode = "gram" | "serving";

type PickerOption = {
  label: string;
  value: string;
};

type NutrientsWithEstimate = {
  estimate?: TNutrientEstimate;
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
  const [activeEstimateNutrientKey, setActiveEstimateNutrientKey] = useState<
    string | null
  >(null);
  const selectedFood = useAppSelector(selectActiveItem);
  const editingEntryId = useAppSelector(selectEditingEntryId);
  const foods = useAppSelector(selectAcitveGroupSummaries);
  const requestedNutritionByUidRef = useRef(new Set<string>());
  const groupInfo = useAppSelector((state) => {
    const groupId = selectedFood?.groupId;
    if (!groupId) return null;
    return selectGroupInfoById(groupId)(state);
  });

  useEffect(() => {
    if (!selectedFood || !groupInfo || !selectedFood.uid) return;
    if (!hasMissingCoreNutrients(selectedFood)) {
      return;
    }
    if (requestedNutritionByUidRef.current.has(selectedFood.uid)) return;

    requestedNutritionByUidRef.current.add(selectedFood.uid);

    void (async () => {
      try {
        const results = await fetchNutritionData({
          foodItems: selectedFood,
        }).unwrap();
        dispatch(
          applyNutritionResults({
            requestedUids: [selectedFood.uid],
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
    if (
      !selectedFood ||
      !selectedFood.groupId ||
      !groupInfo ||
      !portionConfig
    ) {
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
  const estimate = (selectedFood?.nutrients as NutrientsWithEstimate | undefined)
    ?.estimate;
  const estimatedKeys = estimate?.nutrientKeys ?? [];
  const activeEstimateRows = (estimate?.breakdown ?? []).filter(
    (row: TNutrientEstimate["breakdown"][number]) =>
      row.nutrientKey === activeEstimateNutrientKey,
  );

  return (
    <View style={NutritionStyles.container}>
      <ScrollView
        style={logMealStyles.screenScroll}
        contentContainerStyle={logMealStyles.screenContent}
      >
        {selectedFood && groupInfo && portionConfig ? (
          <View style={logMealStyles.detailsWrap}>
            <Text style={typeStyles.title}>
              {buildDisplayFoodName(selectedFood.name, selectedFood.brand)}
            </Text>

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
                  ? `1 serving = ${formatNumber(portionConfig.servingWeight)} g`
                  : "Serving weight is not available for this food yet."}
              </Text>
            </View>

            <View style={logMealStyles.nutrientList}>
              {estimate?.warning ? (
                <View style={logMealStyles.estimateBanner}>
                  <MaterialIcons
                    color="#b45309"
                    name="info-outline"
                    size={18}
                  />
                  <Text style={logMealStyles.estimateBannerText}>
                    {estimate.warning}
                  </Text>
                </View>
              ) : null}
              {Object.entries(selectedFood.nutrients ?? {})
                .filter(
                  ([key, value]) =>
                    key !== "source" &&
                    key !== "unit" &&
                    key !== "estimate" &&
                    value !== null &&
                    value !== undefined,
                )
                .map(([key, value]) => (
                  <View key={key} style={logMealStyles.nutrientRow}>
                    <View style={logMealStyles.nutrientLabelWrap}>
                      <Text style={logMealStyles.nutrientLabel}>
                        {formatNutrientLabel(key)}
                      </Text>
                      {estimatedKeys.includes(
                        key as "phosphorusMg" | "potassiumMg",
                      ) ? (
                        <TouchableOpacity
                          accessibilityLabel={`View ${formatNutrientLabel(key)} estimate`}
                          onPress={() => setActiveEstimateNutrientKey(key)}
                          style={logMealStyles.estimateIconButton}
                        >
                          <MaterialIcons
                            color="#0f766e"
                            name="info-outline"
                            size={18}
                          />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <Text style={logMealStyles.nutrientValue}>
                      {formatNutrientValue(
                        key,
                        typeof value === "string" ? Number(value) : value,
                      )}
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
                if (
                  selectedFood &&
                  selectedFood.groupId &&
                  portionConfig &&
                  groupInfo
                ) {
                  const nextUnit =
                    portionConfig.mode === "gram"
                      ? "gram"
                      : portionConfig.servingLabel;
                  const nextQuantity = sanitizeQuantity(
                    portionConfig.quantity,
                    portionConfig.mode,
                  );
                  const currentQuantity =
                    groupInfo.quantity ?? selectedFood.quantity;
                  const currentMode = isGramUnit(
                    normalizeUnit(groupInfo.unit ?? selectedFood.unit),
                  )
                    ? "gram"
                    : "serving";
                  const currentWeight = quantityToWeight(
                    currentQuantity,
                    currentMode,
                    portionConfig.servingWeight,
                  );
                  const nextWeight = quantityToWeight(
                    nextQuantity,
                    portionConfig.mode,
                    portionConfig.servingWeight,
                  );

                  dispatch(
                    setPortion({
                      foodId: selectedFood.foodId,
                      groupId: selectedFood.groupId,
                      nutrientRatio:
                        currentWeight > 0 && nextWeight > 0
                          ? nextWeight / currentWeight
                          : 1,
                      quantity: nextQuantity,
                      uid: selectedFood.uid,
                      unit: nextUnit,
                    }),
                  );
                }
                dispatch(saveActiveItemToMeal());
                router.replace("/(log-meal)/log-meal?tab=current");
              }}
            >
              <ThemedText style={NutritionStyles.modalButtonTextPrimary}>
                {editingEntryId ? "Update food" : "Add food"}
              </ThemedText>
            </TouchableOpacity>
          </View>
        ) : null}

        {foods &&
          foods.map(
            (food) =>
              food && (
                <FoodCard
                  key={food.uid}
                  title={buildDisplayFoodName(food.name, food.brand)}
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
              ),
          )}
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={Boolean(activeEstimateNutrientKey)}
        onRequestClose={() => setActiveEstimateNutrientKey(null)}
      >
        <View style={logMealStyles.modalBackdrop}>
          <View style={logMealStyles.modalCard}>
            <View style={logMealStyles.modalHeader}>
              <Text style={logMealStyles.modalTitle}>
                {activeEstimateNutrientKey
                  ? `${formatNutrientLabel(activeEstimateNutrientKey)} estimate`
                  : "Estimate"}
              </Text>
              <TouchableOpacity
                onPress={() => setActiveEstimateNutrientKey(null)}
                style={logMealStyles.modalCloseButton}
              >
                <MaterialIcons color="#475569" name="close" size={20} />
              </TouchableOpacity>
            </View>

            {estimate?.warning ? (
              <Text style={logMealStyles.modalWarning}>{estimate.warning}</Text>
            ) : null}

            <ScrollView style={logMealStyles.modalBody}>
              {activeEstimateRows.map((row: TNutrientEstimate["breakdown"][number], index: number) => (
                <View key={`${row.ingredient}:${index}`} style={logMealStyles.modalRow}>
                  <Text style={logMealStyles.modalIngredient}>
                    {row.ingredient} ({formatNumber(row.assignedPercent)}%)
                  </Text>
                  <Text style={logMealStyles.modalFormula}>
                    {formatNumber(row.mgPer100g)} mg per 100g x{" "}
                    {formatNumber(row.ingredientWeightG)} g / 100 ={" "}
                    {formatNumber(row.amountMg)} mg
                  </Text>
                  {row.matchedFood ? (
                    <Text style={logMealStyles.modalMatchedFood}>
                      Matched as {row.matchedFood}
                    </Text>
                  ) : null}
                </View>
              ))}

              {!activeEstimateRows.length ? (
                <Text style={logMealStyles.modalEmptyText}>
                  No ingredient estimate breakdown is available for this nutrient.
                </Text>
              ) : null}

              {estimate?.missingIngredients?.length ? (
                <Text style={logMealStyles.modalMissingText}>
                  Missing ingredients: {estimate.missingIngredients.join(", ")}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function buildDisplayFoodName(name: string, brand?: string) {
  const trimmedBrand = brand?.trim();
  if (!trimmedBrand) return name;
  if (name.toLowerCase().includes(trimmedBrand.toLowerCase())) return name;
  return `${name} (${trimmedBrand})`;
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
  const preferredPortionMeasure =
    fallbackServingMeasure ?? fallbackPortionMeasure;
  const shouldDefaultToServing =
    isGramUnit(currentUnitNorm) && !currentMeasure && !!preferredPortionMeasure;

  const servingMeasure = shouldDefaultToServing
    ? preferredPortionMeasure
    : isGramUnit(currentUnitNorm)
      ? preferredPortionMeasure
      : (currentMeasure ?? preferredPortionMeasure);

  const servingWeight = servingMeasure?.weight;
  const servingLabel = servingMeasure?.label?.trim() || "serving";
  const mode: PortionMode =
    shouldDefaultToServing || !isGramUnit(currentUnitNorm) ? "serving" : "gram";
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
  phosphorus_protein_ratio: "",
  phosphorusMg: "mg",
  potassiumMg: "mg",
  proteinG: "g",
  sodiumMg: "mg",
};

const nutrientLabels: Record<string, string> = {
  caloriesKcal: "Calories",
  carbsG: "Carbs",
  fatG: "Fat",
  fiberG: "Fiber",
  phosphorus_protein_ratio: "Phosphorus/Protein Ratio",
  phosphorusMg: "Phosphorus",
  potassiumMg: "Potassium",
  proteinG: "Protein",
  sodiumMg: "Sodium",
};
