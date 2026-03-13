import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";

import { RootState } from "..";
import { inferUnitFromMeasures } from "@/store/services/utils";
// TODO: put these types into package
import type {
  TEdamamNutritionLookupResult,
  TEdamamNutritionResponse,
  TFoodItem,
  TFoodItemEntry,
  TLogMealEdamamResponse,
  TLogMealItem,
  TMealType,
} from "@ckd/core";

export type ItemSummary = {
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
          requestedFoodIds: string[];
          results: TEdamamNutritionLookupResult[];
        }>,
      ) => {
        applyNutritionResultsToState(
          state,
          action.payload.results,
          action.payload.requestedFoodIds,
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
    registerFoodItem: create.reducer(
      (state, action: PayloadAction<{ food: TFoodItem }>) => {
        state.foodItems = mergeUniqueFoodGroups(state.foodItems, [
          createFoodGroup(action.payload.food),
        ]);
      },
    ),
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
      (state, action: PayloadAction<{ mealType: TMealType }>) => {
        const { mealType } = action.payload;
        if (state.activeMealType !== mealType) {
          state.activeMealType = mealType;
          state.foodItems = [];
          state.isDirty = false;
          state.editingEntryId = null;
          state.eatenAt = new Date().toISOString();
          state.searchResults = null;
        }
      },
    ),
    appendFoodsToMeal: create.reducer(
      (state, action: PayloadAction<{ foods: TFoodItem[] }>) => {
        if (!state.activeMealType) return;
        const nextFoods = action.payload.foods.map((food) => {
          const nextGroup = createFoodGroup(food);
          state.foodItems = mergeUniqueFoodGroups(state.foodItems, [nextGroup]);
          return nextGroup.foodItems[0];
        });
        state.meal[state.activeMealType] = mergeUniqueMealItems(
          state.meal[state.activeMealType],
          nextFoods.filter((item): item is TFoodItem => !!item),
        );
        state.isDirty = true;
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
              v == null ? v : v * safeRatio,
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
          .map((entry) => entry.foodItems[0])
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
          caloriesKcal: item.nutrients.caloriesKcal?.toString() ?? "0",
          carbsG: carbsG?.toString() ?? "0",
          fatG: fatG?.toString() ?? "0",
          fiberG: fiberG?.toString() ?? "0",
          foodId,
          groupId,
          name,
          phosphorusMg: phosphorusMg?.toString() ?? "0",
          potassiumMg: potassiumMg?.toString() ?? "0",
          proteinG: item.nutrients.proteinG?.toString() ?? "0",
          quantity,
          sodiumMg: sodiumMg?.toString() ?? "0",
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
    return entry?.foodItems
      .filter((f) => f.foodId !== foodId)
      .map((food) => {
        const { uid, name, foodId, groupId } = food;
        const { carbsG, fatG, fiberG, phosphorusMg, potassiumMg, sodiumMg } =
          food.nutrients;
        if (!foodId || !groupId) return null;
        return {
          caloriesKcal: food.nutrients.caloriesKcal?.toString() ?? "0",
          carbsG: carbsG?.toString() ?? "0",
          fatG: fatG?.toString() ?? "0",
          fiberG: fiberG?.toString() ?? "0",
          foodId,
          groupId,
          name,
          phosphorusMg: phosphorusMg?.toString() ?? "0",
          potassiumMg: potassiumMg?.toString() ?? "0",
          proteinG: food.nutrients.proteinG?.toString() ?? "0",
          quantity: entry.groupInfo.quantity,
          sodiumMg: sodiumMg?.toString() ?? "0",
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
  requestedFoodIds: string[],
) {
  state.status = "succeeded";
  const requestedSet = new Set(requestedFoodIds.filter(Boolean));
  const shouldFilterGroups = requestedSet.size > 0;

  if (state.foodItems?.length) {
    state.foodItems = state.foodItems.map((group) => {
      if (shouldFilterGroups) {
        const hasMatch = group.foodItems.some((item) =>
          requestedSet.has(item.foodId ?? ""),
        );
        if (!hasMatch) return group;
      }
      const updatedGroupItems = extractNutrition(
        group.foodItems,
        results,
        requestedFoodIds,
      );
      if (!Array.isArray(updatedGroupItems)) return group;

      const resolvedUnit =
        updatedGroupItems.find((item) => requestedSet.has(item.foodId ?? ""))
          ?.unit ?? group.groupInfo.unit;

      return {
        ...group,
        foodItems: updatedGroupItems,
        groupInfo: {
          ...group.groupInfo,
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
      const groupUnit =
        item.item.unit?.trim() ||
        inferUnitFromMeasures(
          item.matches?.[0]?.measures ?? [],
          item.item.unit ?? "",
          item.item.food,
          item.item.quantity,
          item.item.original,
        );
      const unitNorm = groupUnit.trim().toLowerCase();

      return {
        foodItems:
          item.matches?.map<TFoodItem>((m) => {
            const foodId = m.food.foodId;
            const name = m.food.label;
            const inferredUnit =
              item.item.unit?.trim() ||
              inferUnitFromMeasures(
                m.measures,
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
              foodId,
              groupId: item.tempId,
              measures: m.measures,
              name,
              nutrients: {
                caloriesKcal: m.food.nutrients.ENERC_KCAL,
                fatG: m.food.nutrients.FAT,
                carbsG: undefined,
                fiberG: undefined,
                phosphorusMg: undefined,
                potassiumMg: undefined,
                sodiumMg: undefined,
                phosphorus_protein_ratio: undefined,
              },
              quantity: item.item.quantity,
              source: "user",
              uid,
              unit: inferredUnit,
            };
          }) ?? [],
        groupId: item.tempId,
        groupInfo: {
          ...item.item,
          unit: groupUnit,
        },
      };
    }) ?? null
  );
}

function setMealItems(items: FoodItemsObj[] | null): TFoodItem[] {
  if (!items?.length) return [];
  return items
    .map((item) => item.foodItems[0])
    .filter((foodItem): foodItem is TFoodItem => !!foodItem);
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
  requestedFoodIds: string[] = [],
): TFoodItem[] | TFoodItem | null {
  if (Array.isArray(activeItems) && !activeItems?.length) return null;
  if (Array.isArray(data) && data.length === 0) return null;

  const nutrientsByFoodId = new Map<
    string,
    TEdamamNutritionResponse["totalNutrients"]
  >();
  const measureByFoodId = new Map<string, string>();

  data.forEach((result, index) => {
    const requestedFoodId = requestedFoodIds[index];
    if (!requestedFoodId || nutrientsByFoodId.has(requestedFoodId)) return;
    nutrientsByFoodId.set(requestedFoodId, result.response.totalNutrients);
    if (result.resolvedMeasure.label) {
      measureByFoodId.set(requestedFoodId, result.resolvedMeasure.label);
    }
  });

  for (const result of data) {
    for (const ingredient of result.response.ingredients ?? []) {
      for (const parsed of ingredient.parsed ?? []) {
        if (!nutrientsByFoodId.has(parsed.foodId)) {
          nutrientsByFoodId.set(parsed.foodId, result.response.totalNutrients);
        }
        if (
          !measureByFoodId.has(parsed.foodId) &&
          result.resolvedMeasure.label
        ) {
          measureByFoodId.set(parsed.foodId, result.resolvedMeasure.label);
        }
      }
    }
  }

  const returnNutrition = (item: TFoodItem) => {
    const n = item.foodId ? nutrientsByFoodId.get(item.foodId) : undefined;
    if (!n) return item;
    return {
      ...item,
      nutrients: {
        ...item.nutrients,
        caloriesKcal: n.ENERC_KCAL?.quantity ?? item.nutrients.caloriesKcal,
        carbsG: n.CHOCDF?.quantity ?? item.nutrients.carbsG,
        fatG: n.FAT?.quantity ?? item.nutrients.fatG,
        fiberG: n.FIBTG?.quantity ?? item.nutrients.fiberG,
        phosphorus_protein_ratio: phosphorus_protein_ratio(
          n.P?.quantity ?? item.nutrients.phosphorusMg,
          n.PROCNT?.quantity ?? item.nutrients.proteinG,
        ),
        phosphorusMg: n.P?.quantity ?? item.nutrients.phosphorusMg,
        potassiumMg: n.K?.quantity ?? item.nutrients.potassiumMg,
        proteinG: n.PROCNT?.quantity ?? item.nutrients.proteinG,
        sodiumMg: n.NA?.quantity ?? item.nutrients.sodiumMg,
      },
      unit: measureByFoodId.get(item.foodId) ?? item.unit,
    };
  };

  const phosphorus_protein_ratio = (a: number, b: number): number => {
    return a / b;
  };

  const nutritionUpdated = Array.isArray(activeItems)
    ? activeItems.map(returnNutrition)
    : activeItems
      ? returnNutrition(activeItems)
      : null;

  return nutritionUpdated;
}
