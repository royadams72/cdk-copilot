import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { RootState } from "..";
import { inferUnitFromMeasures } from "@/store/services/utils";
// TODO: put these types into package
import type {
  TEdamamMeasure,
  TEdamamNutritionLookupResult,
  TEdamamNutritionResponse,
  TFoodItem,
  TFoodItemEntry,
  TMealType,
} from "@ckd/core";
import type {
  TLogMealEdamamResponse,
  TLogMealItem,
} from "../../../../../packages/core/src/isomorphic/schemas/log_meal";
import type { TFoodSearchCandidate } from "../../../../../packages/core/src/isomorphic/schemas/food_search";

export type ItemSummary = {
  brand: string | undefined;
  caloriesKcal: string;
  carbsG: string;
  fatG: string;
  fiberG: string;
  foodId: string;
  groupId: string;
  name: string;
  phosphorusMg: string;
  potassiumMg: string;
  proteinG: string;
  quantity: number;
  sodiumMg: string;
  uid: string;
  unit: string;
};

export type Meal = Partial<Omit<TFoodItem, "measures" | "groupId">>;

export const mealTypes: { label: string; value: TMealType }[] = [
  { label: "Breakfast", value: "breakfast" },
  { label: "Lunch", value: "lunch" },
  { label: "Dinner", value: "dinner" },
  { label: "Snack", value: "snack" },
  { label: "Drink", value: "drink" },
];
export type FoodItemsObj = {
  foodItems: TFoodItem[];
  groupId: string;
  groupInfo: TLogMealItem;
};

export type logMealState = {
  activeItem: TFoodItem | null;
  activeItems: TFoodItem[] | null;
  activeMealType: TMealType | null;
  eatenAt: string | null;
  editingEntryId: string | null;
  error: string | null;
  foodItems: FoodItemsObj[] | null;
  isDirty: boolean;
  lastLoadedAt: string | null;
  meal: Record<TMealType, TFoodItem[]>;
  mealCandidate: {
    entryId: string;
    mealType: TMealType;
    eatenAt: string | null;
  } | null;
  searchResults: FoodItemsObj[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
};

const createEmptyMeals = (): Record<TMealType, TFoodItem[]> => ({
  breakfast: [],
  dinner: [],
  drink: [],
  lunch: [],
  snack: [],
});

const initialState: logMealState = {
  activeItem: null,
  activeItems: null,
  activeMealType: null,
  eatenAt: new Date().toISOString(),
  editingEntryId: null,
  error: null,
  foodItems: null,
  isDirty: false,
  lastLoadedAt: null,
  meal: createEmptyMeals(),
  mealCandidate: null,
  searchResults: null,
  status: "idle",
};

const logMealSlice = createSlice({
  initialState,
  name: "logMeal",
  reducers: (create) => ({
    appendFoodsToMeal: create.reducer(
      (state, action: PayloadAction<{ foods: TFoodItem[] }>) => {
        if (!state.activeMealType) return;
        const nextFoods = action.payload.foods.map((food) => {
          const nextGroup = createFoodGroup(food);
          return nextGroup.foodItems[0];
        });
        state.meal[state.activeMealType] = mergeUniqueMealItems(
          state.meal[state.activeMealType],
          nextFoods.filter((item): item is TFoodItem => !!item),
        );
        state.isDirty = true;
      },
    ),
    applyFetchMealByDate: create.reducer(
      (
        state,
        action: PayloadAction<{
          entry: {
            eatenAt: string | null;
            entryId: string;
            items: TFoodItemEntry[];
            mealType: TMealType;
          } | null;
        }>,
      ) => {
        state.status = "succeeded";
        if (!action.payload.entry) return;
        mergeEntryIntoState(state, action.payload.entry);
        state.mealCandidate = null;
      },
    ),
    applyFetchMealData: create.reducer(
      (
        state,
        action: PayloadAction<{
          results: TLogMealEdamamResponse;
        }>,
      ) => {
        state.status = "succeeded";
        const incomingGroups = mapFoodItems(action.payload.results);
        state.foodItems = mergeUniqueFoodGroups(
          state.foodItems,
          incomingGroups,
        );
        state.searchResults = incomingGroups;
        if (state.activeMealType) {
          state.meal[state.activeMealType] = mergeUniqueMealItems(
            state.meal[state.activeMealType],
            setMealItems(incomingGroups),
          );
          state.isDirty = true;
        }
        state.error = null;
        state.lastLoadedAt = new Date().toISOString();
      },
    ),
    applyMealCandidate: create.reducer(
      (
        state,
        action: PayloadAction<{
          candidate: {
            eatenAt: string | null;
            entryId: string;
            mealType: TMealType;
          } | null;
        }>,
      ) => {
        state.mealCandidate = action.payload.candidate;
      },
    ),
    applyNutritionResults: create.reducer(
      (
        state,
        action: PayloadAction<{
          requestedUids: string[];
          results: TEdamamNutritionLookupResult[];
        }>,
      ) => {
        applyNutritionResultsToState(
          state,
          action.payload.results,
          action.payload.requestedUids,
        );
      },
    ),
    clearMealCandidate: create.reducer((state) => {
      state.mealCandidate = null;
    }),
    clearMealState: create.reducer((state) => {
      resetLogMeal(state);
    }),
    hydrateMealFromEntry: create.reducer(
      (
        state,
        action: PayloadAction<{
          eatenAt: string | null;
          entryId: string;
          items: TFoodItemEntry[];
          mealType: TMealType;
        }>,
      ) => {
        const { entryId, mealType, eatenAt, items } = action.payload;
        const nextFoodItems: FoodItemsObj[] = items.map((item, index) => {
          const groupId = `${entryId}:${item.uid ?? index}`;
          const foodItem: TFoodItem = {
            ...item,
            groupId,
            measures: [],
          };
          return {
            foodItems: [foodItem],
            groupId,
            groupInfo: {
              original: item.name,
              normalised: item.name.toLowerCase(),
              quantity: item.quantity,
              unit: item.unit ?? "",
              food: item.name,
            },
          };
        });

        state.activeMealType = mealType;
        state.eatenAt = eatenAt ?? new Date().toISOString();
        state.editingEntryId = entryId;
        state.foodItems = nextFoodItems;
        state.meal = createEmptyMeals();
        state.searchResults = null;
        state.meal[mealType] = nextFoodItems
          .map((entry) => entry.foodItems[0])
          .filter((foodItem): foodItem is TFoodItem => !!foodItem);
        state.activeItem = null;
        state.activeItems = null;
        state.isDirty = false;
        state.error = null;
        state.status = "idle";
      },
    ),
    registerFoodItem: create.reducer(
      (state, action: PayloadAction<{ food: TFoodItem }>) => {
        state.foodItems = mergeUniqueFoodGroups(state.foodItems, [
          createFoodGroup(action.payload.food),
        ]);
      },
    ),
    removeMealItem: create.reducer(
      (state, action: PayloadAction<{ groupId: string }>) => {
        const { groupId } = action.payload;

        if (state.activeMealType) {
          state.meal[state.activeMealType] = state.meal[
            state.activeMealType
          ].filter((item) => item.groupId !== groupId);
        }

        if (state.activeItem?.groupId === groupId) {
          state.activeItem = null;
        }

        state.isDirty = true;
      },
    ),
    saveActiveItemToMeal: create.reducer((state) => {
      if (!state.activeMealType || !state.activeItem) return;
      const nextFood = { ...state.activeItem };
      const mealItems = state.meal[state.activeMealType];
      const existingGroupIndex = mealItems.findIndex(
        (item) => item.groupId === nextFood.groupId,
      );

      if (existingGroupIndex >= 0) {
        if (isSameMealItem(mealItems[existingGroupIndex], nextFood)) return;
        mealItems[existingGroupIndex] = nextFood;
        state.isDirty = true;
        return;
      }

      const hasDuplicate = mealItems.some((item) =>
        isSameMealItem(item, nextFood),
      );
      if (hasDuplicate) return;
      mealItems.push(nextFood);
      state.isDirty = true;
    }),
    setActiveItem: create.reducer(
      (
        state,
        action: PayloadAction<{ foodId: string; groupId: string; uid: string }>,
      ) => {
        const { uid, foodId, groupId } = action.payload;
        const item = findGroupById(groupId, state)?.foodItems?.find(
          (item) => item.foodId === foodId && item.uid === uid,
        );
        item ? (state.activeItem = item) : null;
      },
    ),
    setEatenAt: create.reducer(
      (state, action: PayloadAction<{ eatenAt: string }>) => {
        state.eatenAt = action.payload.eatenAt;
        state.isDirty = true;
      },
    ),
    setMeal: create.reducer(
      (state, action: PayloadAction<{ food: TFoodItem }>) => {
        if (!state.activeMealType) return;
        const nextFood = { ...action.payload.food };
        const mealItems = state.meal[state.activeMealType];
        const existingGroupIndex = mealItems.findIndex(
          (item) => item.groupId === nextFood.groupId,
        );

        if (existingGroupIndex >= 0) {
          if (isSameMealItem(mealItems[existingGroupIndex], nextFood)) return;
          mealItems[existingGroupIndex] = nextFood;
          state.isDirty = true;
          return;
        }

        const hasDuplicate = mealItems.some((item) =>
          isSameMealItem(item, nextFood),
        );
        if (hasDuplicate) return;
        mealItems.push(nextFood);
        state.isDirty = true;
      },
    ),
    setMealType: create.reducer(
      (
        state,
        action: PayloadAction<{ eatenAt?: string | null; mealType: TMealType }>,
      ) => {
        const { mealType, eatenAt } = action.payload;
        state.activeMealType = mealType;
        state.activeItem = null;
        state.activeItems = null;
        state.foodItems = [];
        state.isDirty = false;
        state.editingEntryId = null;
        state.eatenAt = eatenAt ?? new Date().toISOString();
        state.meal = createEmptyMeals();
        state.mealCandidate = null;
        state.searchResults = null;
      },
    ),
    setPortion: create.reducer(
      (
        state,
        action: PayloadAction<{
          foodId: string;
          groupId: string;
          nutrientRatio: number;
          quantity: number;
          uid: string;
          unit: string;
        }>,
      ) => {
        const { uid, quantity, groupId, foodId, unit, nutrientRatio } =
          action.payload;
        const group = findGroupById(groupId, state);
        if (!group) return;

        const item = group.foodItems.find(
          (f) => f.foodId === foodId && f.uid === uid,
        );
        if (!item) return;
        const normalizedUnit = unit.trim();
        const safeRatio =
          Number.isFinite(nutrientRatio) && nutrientRatio > 0
            ? nutrientRatio
            : 1;
        const hasQuantityChanged = item.quantity !== quantity;
        const hasUnitChanged = (item.unit ?? "").trim() !== normalizedUnit;

        if (hasQuantityChanged || hasUnitChanged) {
          item.nutrients = Object.fromEntries(
            Object.entries(item.nutrients).map(([k, v]) => [
              k,
              typeof v === "number" ? v * safeRatio : v,
            ]),
          ) as typeof item.nutrients;

          item.quantity = quantity;
          item.unit = normalizedUnit;
          state.activeItem = item;
          group.groupInfo.quantity = quantity;
          group.groupInfo.unit = normalizedUnit;
          state.isDirty = true;
        }
      },
    ),
  }),
});

export default logMealSlice.reducer;
export const {
  applyNutritionResults,
  applyMealCandidate,
  applyFetchMealByDate,
  setPortion,
  setActiveItem,
  setMealType,
  applyFetchMealData,
  saveActiveItemToMeal,
  registerFoodItem,
  removeMealItem,
  clearMealState,
  setEatenAt,
  hydrateMealFromEntry,
  clearMealCandidate,
  appendFoodsToMeal,
} = logMealSlice.actions;

const state = (state: RootState) => state.logMeal;
const mealState = (state: RootState) => state.logMeal.meal;

export const selectGroupInfoById = (groupId: string) => {
  return createSelector(
    selectFoodItems,
    (foodItems) =>
      foodItems?.find((group) => group.groupId === groupId)?.groupInfo ?? null,
  );
};
//
export const selectMeal = (mealType: TMealType) => {
  return createSelector(mealState, (meal) => meal[mealType]);
};

export const selectActiveMealType = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.activeMealType,
);

export const selectActiveItem = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.activeItem,
);

export const selectFoodItems = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.foodItems,
);

export const selectSearchResults = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.searchResults,
);
export const selectIsDirty = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.isDirty,
);

export const selectEatenAt = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.eatenAt,
);

export const selectEditingEntryId = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.editingEntryId,
);

export const selectMealCandidate = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.mealCandidate,
);

export const selectMealItemsFromFoodItems = createSelector(
  selectFoodItems,
  (foodItemsArr: FoodItemsObj[] | null) => {
    return Array.isArray(foodItemsArr)
      ? foodItemsArr
          .map((entry) => getPreferredFoodItem(entry))
          .filter((foodItem): foodItem is TFoodItem => !!foodItem)
      : [];
  },
);

export const selectItemsSummary = createSelector(
  mealState,
  selectActiveMealType,
  (meal, activeMealType) => {
    if (!activeMealType) return [];
    const activeMealItems = meal[activeMealType] ?? [];
    return activeMealItems
      .map((item) => {
        const { uid, name, foodId, groupId, quantity, unit } = item;
        const { carbsG, fatG, fiberG, phosphorusMg, potassiumMg, sodiumMg } =
          item.nutrients;
        if (!uid || !foodId || !groupId) return null;
        return {
          brand: item.brand,
          caloriesKcal: item.nutrients.caloriesKcal?.toString() ?? "",
          carbsG: carbsG?.toString() ?? "",
          fatG: fatG?.toString() ?? "",
          fiberG: fiberG?.toString() ?? "",
          foodId,
          groupId,
          name,
          phosphorusMg: phosphorusMg?.toString() ?? "",
          potassiumMg: potassiumMg?.toString() ?? "",
          proteinG: item.nutrients.proteinG?.toString() ?? "",
          quantity,
          sodiumMg: sodiumMg?.toString() ?? "",
          uid,
          unit: unit ?? "",
        } satisfies ItemSummary;
      })
      .filter((entry): entry is ItemSummary => entry !== null);
  },
);

export const selectAcitveGroupSummaries = createSelector(
  selectActiveItem,
  selectFoodItems,

  (activeItem: TFoodItem | null, foodItemsArr: FoodItemsObj[] | null) => {
    if (!activeItem) return null;
    const { foodId, groupId } = activeItem;
    const entry = foodItemsArr?.find((e) => e.groupId === groupId);
    if (!entry) return null;
    return dedupeFoodItemsByLabel(entry?.foodItems ?? [])
      .filter((f) => f.foodId !== foodId)
      .map((food) => {
        const { uid, name, foodId, groupId } = food;
        const { carbsG, fatG, fiberG, phosphorusMg, potassiumMg, sodiumMg } =
          food.nutrients;
        if (!foodId || !groupId) return null;
        return {
          brand: food.brand,
          caloriesKcal: food.nutrients.caloriesKcal?.toString() ?? "",
          carbsG: carbsG?.toString() ?? "",
          fatG: fatG?.toString() ?? "",
          fiberG: fiberG?.toString() ?? "",
          foodId,
          groupId,
          name,
          phosphorusMg: phosphorusMg?.toString() ?? "",
          potassiumMg: potassiumMg?.toString() ?? "",
          proteinG: food.nutrients.proteinG?.toString() ?? "",
          quantity: entry.groupInfo.quantity,
          sodiumMg: sodiumMg?.toString() ?? "",
          uid,
          unit: entry.groupInfo.unit ?? "",
        } satisfies ItemSummary;
      })
      .filter((item): item is ItemSummary => item !== null);
  },
);
// Utils

function findGroupById(groupId: string, state: any): FoodItemsObj {
  return state?.foodItems?.find(
    (item: FoodItemsObj) => item?.groupId === groupId,
  );
}

function applyNutritionResultsToState(
  state: RootState["logMeal"],
  results: TEdamamNutritionLookupResult[],
  requestedUids: string[],
) {
  state.status = "succeeded";
  const requestedSet = new Set(requestedUids.filter(Boolean));
  const shouldFilterGroups = requestedSet.size > 0;

  if (state.foodItems?.length) {
    state.foodItems = state.foodItems.map((group) => {
      if (shouldFilterGroups) {
        const hasMatch = group.foodItems.some((item) =>
          requestedSet.has(item.uid ?? ""),
        );
        if (!hasMatch) return group;
      }
      const updatedGroupItems = extractNutrition(
        group.foodItems,
        results,
        requestedUids,
      );
      if (!Array.isArray(updatedGroupItems)) return group;

      const resolvedUnit =
        updatedGroupItems.find((item) => requestedSet.has(item.uid ?? ""))
          ?.unit ?? group.groupInfo.unit;
      const resolvedQuantity =
        updatedGroupItems.find((item) => requestedSet.has(item.uid ?? ""))
          ?.quantity ?? group.groupInfo.quantity;

      return {
        ...group,
        foodItems: updatedGroupItems,
        groupInfo: {
          ...group.groupInfo,
          quantity: resolvedQuantity,
          unit: resolvedUnit,
        },
      };
    });

    const itemsByUid = new Map<string, TFoodItem>();
    for (const group of state.foodItems) {
      for (const item of group.foodItems) {
        if (item.uid) itemsByUid.set(item.uid, item);
      }
    }

    const resolveUpdated = (item: TFoodItem | null) => {
      if (!item) return null;
      const byUid = item.uid ? itemsByUid.get(item.uid) : undefined;
      return byUid ?? item;
    };

    if (state.activeItem) {
      state.activeItem = resolveUpdated(state.activeItem);
    }

    if (state.activeMealType) {
      state.meal[state.activeMealType] = state.meal[state.activeMealType].map(
        (item) => resolveUpdated(item) ?? item,
      );
    }
  }

  state.error = null;
  state.lastLoadedAt = new Date().toISOString();
}

function mapFoodItems(data: TLogMealEdamamResponse): FoodItemsObj[] | null {
  if (!data) return null;
  return (
    data?.items?.map((item) => {
      const seen = new Map<string, number>();
      const primaryMeasures = item.matches?.[0]
        ? buildMeasuresForMatch(item.matches[0])
        : [];
      const groupUnit =
        item.item.unit?.trim() ||
        inferUnitFromMeasures(
          primaryMeasures,
          item.item.unit ?? "",
          item.item.food,
          item.item.quantity,
          item.item.original,
        );
      const unitNorm = groupUnit.trim().toLowerCase();

      return {
        foodItems: sortFoodItemsForQuery(
          dedupeFoodMatches(item.matches ?? []).map<TFoodItem>((match) => {
            const foodId =
              match.provider === "open_food_facts"
                ? (match.metadata?.barcode ?? match.food.foodId)
                : match.food.foodId;
            const name = match.food.label;
            const measures = buildMeasuresForMatch(match);
            const inferredUnit =
              item.item.unit?.trim() ||
              inferUnitFromMeasures(
                measures,
                item.item.unit ?? "",
                name,
                item.item.quantity,
                item.item.original,
              );
            const keyBase = `${item.tempId}|${foodId}|${unitNorm}|${name
              .trim()
              .toLowerCase()}`;
            const next = (seen.get(keyBase) ?? 0) + 1;
            seen.set(keyBase, next);
            const uid = `${keyBase}|${next}`;

            return {
              brand: match.food.brand,
              foodId,
              groupId: item.tempId,
              measures,
              name,
              nutrients: {
                caloriesKcal: match.food.nutrients.caloriesKcal,
                carbsG: match.food.nutrients.carbsG,
                fatG: match.food.nutrients.fatG,
                fiberG: match.food.nutrients.fiberG,
                phosphorusMg: normalizeBarcodeMicronutrient(
                  match.provider,
                  match.food.nutrients.phosphorusMg,
                ),
                potassiumMg: normalizeBarcodeMicronutrient(
                  match.provider,
                  match.food.nutrients.potassiumMg,
                ),
                proteinG: match.food.nutrients.proteinG,
                sodiumMg: normalizeBarcodeMicronutrient(
                  match.provider,
                  match.food.nutrients.sodiumMg,
                ),
                phosphorus_protein_ratio: undefined,
                source:
                  match.provider === "open_food_facts"
                    ? "open_food_facts"
                    : "edamam",
              },
              quantity: item.item.quantity,
              openFoodFacts:
                match.provider === "open_food_facts" ? match.metadata : undefined,
              source: match.provider === "open_food_facts" ? "barcode" : "api",
              uid,
              unit: inferredUnit,
            };
          }),
          item.item.normalised,
        ),
        groupId: item.tempId,
        groupInfo: {
          ...item.item,
          unit: groupUnit,
        },
      };
    }) ?? null
  );
}

function dedupeFoodMatches(matches: TFoodSearchCandidate[]) {
  const deduped = new Map<string, TFoodSearchCandidate>();

  for (const match of matches) {
    const key = [
      match.provider,
      normalizeFoodMatchKey(match.food.label)
        .replace(/\bchicken burgers\b/g, "chicken burger")
        .replace(/\bburgers\b/g, "burger")
        .replace(/\bpatties\b/g, "patty"),
    ].join("|");

    if (!deduped.has(key)) {
      deduped.set(key, match);
    }
  }

  return [...deduped.values()];
}

function dedupeFoodItemsByLabel(items: TFoodItem[]) {
  const deduped = new Map<string, TFoodItem>();

  for (const item of items) {
    const key = normalizeFoodMatchKey(item.name)
      .replace(/\bchicken burgers\b/g, "chicken burger")
      .replace(/\bburgers\b/g, "burger")
      .replace(/\bpatties\b/g, "patty");

    if (!deduped.has(key)) {
      deduped.set(key, item);
    }
  }

  return [...deduped.values()];
}

function buildMeasuresForMatch(match: TFoodSearchCandidate): TEdamamMeasure[] {
  if (match.measures?.length) return match.measures;
  const parsedServingMeasure = parseServingSizeMeasure(
    match.metadata?.servingSize,
  );
  return parsedServingMeasure ? [parsedServingMeasure] : [];
}

function parseServingSizeMeasure(servingSize?: string): TEdamamMeasure | null {
  if (!servingSize) return null;

  const normalized = servingSize.trim().replace(/\s+/g, " ");
  const match = normalized.match(
    /^(\d+(?:\.\d+)?)\s+(.+?)\s*\((\d+(?:\.\d+)?)\s*g\)$/i,
  );
  if (!match) return null;

  const quantity = Number.parseFloat(match[1]);
  const label = match[2].trim();
  const grams = Number.parseFloat(match[3]);

  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    !Number.isFinite(grams) ||
    grams <= 0 ||
    !label
  ) {
    return null;
  }

  return {
    label: normalizeServingLabel(label),
    uri: `local://measure/${normalizeServingLabel(label).replace(/\s+/g, "-")}`,
    weight: grams / quantity,
  };
}

function normalizeServingLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ");
}

function sortFoodItemsForQuery(items: TFoodItem[], query: string) {
  return [...dedupeFoodItemsByLabel(items)].sort(
    (a, b) => scoreFoodItemForQuery(b, query) - scoreFoodItemForQuery(a, query),
  );
}

function getPreferredFoodItem(group: FoodItemsObj) {
  return sortFoodItemsForQuery(
    group.foodItems ?? [],
    group.groupInfo?.normalised ?? group.groupInfo?.food ?? "",
  )[0];
}

function scoreFoodItemForQuery(item: TFoodItem, query: string) {
  const normalizedQuery = normalizeFoodMatchKey(query);
  const normalizedName = normalizeFoodMatchKey(item.name);
  const normalizedBrand = normalizeFoodMatchKey(item.brand);
  const combined = `${normalizedBrand} ${normalizedName}`.trim();
  const tokens = normalizedQuery
    .split(" ")
    .filter(
      (token) =>
        token && !["with", "and", "the", "a", "an", "of"].includes(token),
    );
  let score = 0;

  if (normalizedName === normalizedQuery) score += 200;
  else if (normalizedName.includes(normalizedQuery)) score += 120;

  for (const token of tokens) {
    if (combined.includes(token)) score += 20;
    else score -= 40;
  }

  if (/\bburger\b/.test(normalizedQuery)) {
    if (/\bburger\b|\bburgers\b|\bpatty\b|\bpatties\b/.test(normalizedName)) {
      score += 120;
    } else {
      score -= 160;
    }

    if (/\bbun\b|\bbread\b|\broll\b/.test(normalizedName)) {
      score -= 220;
    }
  }

  if (/\bchicken\b/.test(normalizedQuery)) {
    if (/\bchicken\b/.test(normalizedName)) score += 60;
    else score -= 160;
  }

  return score;
}

function normalizeFoodMatchKey(value: string | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ");
}

function buildGroupSignature(group: FoodItemsObj) {
  const first = group.foodItems?.[0];
  const name = (first?.name ?? "").trim().toLowerCase();
  const foodId = first?.foodId ?? "";
  const quantity = first?.quantity ?? 0;
  const unit = (group.groupInfo?.unit ?? first?.unit ?? "")
    .trim()
    .toLowerCase();
  return `${foodId}|${name}|${quantity}|${unit}`;
}

function setMealItems(items: FoodItemsObj[] | null): TFoodItem[] {
  if (!items?.length) return [];
  return items
    .map((item) => getPreferredFoodItem(item))
    .filter((foodItem): foodItem is TFoodItem => !!foodItem);
}

function mergeUniqueFoodGroups(
  existing: FoodItemsObj[] | null,
  incoming: FoodItemsObj[] | null,
): FoodItemsObj[] {
  const base = existing ?? [];
  const next = incoming ?? [];
  if (!next.length) return base;

  const seen = new Set(base.map(buildGroupSignature));
  const merged = [...base];
  for (const group of next) {
    const signature = buildGroupSignature(group);
    if (seen.has(signature)) continue;
    seen.add(signature);
    merged.push(group);
  }
  return merged;
}

function isSameMealItem(a: TFoodItem, b: TFoodItem) {
  const sameIdentity =
    a.uid && b.uid
      ? a.uid === b.uid
      : a.foodId === b.foodId &&
        (a.name ?? "").trim().toLowerCase() ===
          (b.name ?? "").trim().toLowerCase();

  if (!sameIdentity) return false;

  return (
    a.quantity === b.quantity &&
    (a.unit ?? "").trim().toLowerCase() === (b.unit ?? "").trim().toLowerCase()
  );
}

function mergeUniqueMealItems(existing: TFoodItem[], incoming: TFoodItem[]) {
  if (!incoming.length) return existing;
  const merged = [...existing];
  for (const item of incoming) {
    if (merged.some((existingItem) => isSameMealItem(existingItem, item))) {
      continue;
    }
    merged.push(item);
  }
  return merged;
}

function resetLogMeal(state: RootState["logMeal"]) {
  state.activeItem = null;
  state.foodItems = null;
  state.meal = createEmptyMeals();
  state.activeMealType = null;
  state.eatenAt = new Date().toISOString();
  state.editingEntryId = null;
  state.mealCandidate = null;
  state.searchResults = null;
}

function createFoodGroup(food: TFoodItem): FoodItemsObj {
  const groupId =
    food.groupId ??
    `${food.foodId}:${food.uid}:${food.quantity}:${(food.unit ?? "").trim().toLowerCase()}`;
  const nextFood = {
    ...food,
    groupId,
  };

  return {
    foodItems: [nextFood],
    groupId,
    groupInfo: {
      food: nextFood.name,
      normalised: nextFood.name.toLowerCase(),
      original: nextFood.name,
      quantity: nextFood.quantity,
      unit: nextFood.unit ?? "",
    },
  };
}

function mergeEntryIntoState(
  state: RootState["logMeal"],
  payload: {
    eatenAt: string | null;
    entryId: string;
    items: TFoodItemEntry[];
    mealType: TMealType;
  },
) {
  const { entryId, mealType, eatenAt, items } = payload;
  const existingGroups = new Set(
    (state.foodItems ?? []).map((group) => group.groupId),
  );
  const nextGroups: FoodItemsObj[] = items.map((item, index) => {
    const baseId = `${entryId}:${item.uid ?? index}`;
    let groupId = baseId;
    let suffix = 1;
    while (existingGroups.has(groupId)) {
      groupId = `${baseId}:${suffix++}`;
    }
    existingGroups.add(groupId);
    const foodItem: TFoodItem = {
      ...item,
      groupId,
      measures: [],
    };
    return {
      foodItems: [foodItem],
      groupId,
      groupInfo: {
        original: item.name,
        normalised: item.name.toLowerCase(),
        quantity: item.quantity,
        unit: item.unit ?? "",
        food: item.name,
      },
    };
  });

  state.activeMealType = mealType;
  state.eatenAt = eatenAt ?? state.eatenAt ?? new Date().toISOString();
  state.editingEntryId = entryId;
  state.foodItems = mergeUniqueFoodGroups(state.foodItems, nextGroups);
  state.meal = state.meal ?? createEmptyMeals();
  state.meal[mealType] = mergeUniqueMealItems(
    state.meal[mealType] ?? [],
    nextGroups
      .map((entry) => entry.foodItems[0])
      .filter((foodItem): foodItem is TFoodItem => !!foodItem),
  );
  state.isDirty = false;
}

function extractNutrition(
  activeItems: TFoodItem[] | TFoodItem | null,
  data: TEdamamNutritionLookupResult[],
  requestedUids: string[] = [],
): TFoodItem[] | TFoodItem | null {
  if (Array.isArray(activeItems) && !activeItems?.length) return null;
  if (Array.isArray(data) && data.length === 0) return null;

  const nutrientsByUid = new Map<
    string,
    TEdamamNutritionResponse["totalNutrients"]
  >();
  const measureByUid = new Map<string, string>();
  const nutrientsByFoodId = new Map<
    string,
    TEdamamNutritionResponse["totalNutrients"]
  >();
  const measureByFoodId = new Map<string, string>();
  const weightByUid = new Map<string, number>();
  const weightByFoodId = new Map<string, number>();
  const parsedMeasureByUid = new Map<string, string>();
  const parsedMeasureByFoodId = new Map<string, string>();

  data.forEach((result, index) => {
    const requestedUid = requestedUids[index];
    if (requestedUid && !nutrientsByUid.has(requestedUid)) {
      nutrientsByUid.set(requestedUid, result.response.totalNutrients);
      if (result.resolvedMeasure.label) {
        measureByUid.set(requestedUid, result.resolvedMeasure.label);
      }
      if (typeof result.response.totalWeight === "number") {
        weightByUid.set(requestedUid, result.response.totalWeight);
      }
    }

    const requestedFoodId = result.requestedFoodId;
    if (!requestedFoodId || nutrientsByFoodId.has(requestedFoodId)) return;
    nutrientsByFoodId.set(requestedFoodId, result.response.totalNutrients);
    if (result.resolvedMeasure.label) {
      measureByFoodId.set(requestedFoodId, result.resolvedMeasure.label);
    }
    if (typeof result.response.totalWeight === "number") {
      weightByFoodId.set(requestedFoodId, result.response.totalWeight);
    }
  });

  for (const result of data) {
    for (const ingredient of result.response.ingredients ?? []) {
      for (const parsed of ingredient.parsed ?? []) {
        const parsedMeasureLabel =
          typeof parsed.measure === "string" ? parsed.measure : undefined;
        const parsedWeight =
          typeof parsed.weight === "number" && Number.isFinite(parsed.weight)
            ? parsed.weight
            : undefined;

        const requestedUid = requestedUids[data.indexOf(result)];
        if (requestedUid) {
          if (parsedMeasureLabel && !parsedMeasureByUid.has(requestedUid)) {
            parsedMeasureByUid.set(requestedUid, parsedMeasureLabel);
          }
          if (
            typeof parsedWeight === "number" &&
            !weightByUid.has(requestedUid)
          ) {
            weightByUid.set(requestedUid, parsedWeight);
          }
        }

        if (!nutrientsByFoodId.has(parsed.foodId)) {
          nutrientsByFoodId.set(parsed.foodId, result.response.totalNutrients);
        }
        if (
          !measureByFoodId.has(parsed.foodId) &&
          result.resolvedMeasure.label
        ) {
          measureByFoodId.set(parsed.foodId, result.resolvedMeasure.label);
        }
        if (parsedMeasureLabel && !parsedMeasureByFoodId.has(parsed.foodId)) {
          parsedMeasureByFoodId.set(parsed.foodId, parsedMeasureLabel);
        }
        if (
          !weightByFoodId.has(parsed.foodId) &&
          typeof parsedWeight === "number"
        ) {
          weightByFoodId.set(parsed.foodId, parsedWeight);
        }
      }
    }
  }

  const returnNutrition = (item: TFoodItem) => {
    const n =
      (item.uid ? nutrientsByUid.get(item.uid) : undefined) ??
      (item.foodId ? nutrientsByFoodId.get(item.foodId) : undefined);
    if (!n) return item;
    const resolvedUnit =
      (item.uid ? parsedMeasureByUid.get(item.uid) : undefined) ??
      (item.uid ? measureByUid.get(item.uid) : undefined) ??
      parsedMeasureByFoodId.get(item.foodId) ??
      measureByFoodId.get(item.foodId) ??
      item.unit;
    const resolvedWeight =
      (item.uid ? weightByUid.get(item.uid) : undefined) ??
      weightByFoodId.get(item.foodId);
    const normalizedResolvedUnit = (resolvedUnit ?? "").trim().toLowerCase();
    const shouldAdoptResolvedWeight =
      typeof resolvedWeight === "number" &&
      Number.isFinite(resolvedWeight) &&
      resolvedWeight > 1 &&
      item.quantity <= 1 &&
      (normalizedResolvedUnit === "gram" ||
        normalizedResolvedUnit === "grams" ||
        normalizedResolvedUnit === "g");
    return {
      ...item,
      nutrients: {
        ...item.nutrients,
        caloriesKcal: item.nutrients.caloriesKcal ?? n.ENERC_KCAL?.quantity,
        carbsG: item.nutrients.carbsG ?? n.CHOCDF?.quantity,
        fatG: item.nutrients.fatG ?? n.FAT?.quantity,
        fiberG: n.FIBTG?.quantity ?? item.nutrients.fiberG,
        phosphorus_protein_ratio: phosphorus_protein_ratio(
          item.nutrients.phosphorusMg ?? n.P?.quantity,
          item.nutrients.proteinG ?? n.PROCNT?.quantity,
        ),
        phosphorusMg: item.nutrients.phosphorusMg ?? n.P?.quantity,

        potassiumMg: item.nutrients.potassiumMg ?? n.K?.quantity,
        proteinG: item.nutrients.proteinG ?? n.PROCNT?.quantity,
        sodiumMg: item.nutrients.sodiumMg ?? n.NA?.quantity,
      },
      quantity: shouldAdoptResolvedWeight
        ? Math.round(resolvedWeight)
        : item.quantity,
      unit: resolvedUnit,
    };
  };

  const phosphorus_protein_ratio = (
    a: number | undefined,
    b: number | undefined,
  ): number | undefined => {
    if (
      typeof a !== "number" ||
      !Number.isFinite(a) ||
      a <= 0 ||
      typeof b !== "number" ||
      !Number.isFinite(b) ||
      b <= 0
    ) {
      return undefined;
    }
    return a / b;
  };

  const nutritionUpdated = Array.isArray(activeItems)
    ? activeItems.map(returnNutrition)
    : activeItems
      ? returnNutrition(activeItems)
      : null;

  return nutritionUpdated;
}

function normalizeBarcodeMicronutrient(
  provider: TFoodSearchCandidate["provider"],
  value: number | undefined,
) {
  if (provider === "open_food_facts" && value === 0) {
    return undefined;
  }
  return value;
}
