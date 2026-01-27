import {
  createAsyncThunk,
  createSelector,
  createSlice,
  current,
  PayloadAction,
} from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import type {
  TEdamamFoodMeasure,
  TLogMealEdamamResponse,
  TLogMealResponseItem,
  TFoodItem,
  TLogMealItem,
  TEdamamMeasure,
  TEdamamNutritionResponse,
  TNutrients,
  TMealType,
} from "@ckd/core";
import { RootState } from "..";

export type ItemSummary = {
  groupId: string;
  foodId: string;
  uid: string;
  name: string;
  quantity: number;
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
  groupId: string;
  groupInfo: TLogMealItem;
  foodItems: TFoodItem[];
};

export type logMealState = {
  activeItems: TFoodItem[] | null;
  activeItem: TFoodItem | null;
  activeMealType: TMealType | null;
  foodItems: FoodItemsObj[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  lastLoadedAt: string | null;
  meal: Record<TMealType, TFoodItem[]>;
};

const createEmptyMeals = (): Record<TMealType, TFoodItem[]> => ({
  breakfast: [],
  lunch: [],
  dinner: [],
  snack: [],
  drink: [],
});

const initialState: logMealState = {
  activeItems: null,
  activeItem: null,
  activeMealType: null,
  foodItems: null,
  status: "idle",
  error: null,
  lastLoadedAt: null,
  meal: createEmptyMeals(),
};

export const fetchMealData = createAsyncThunk<
  TLogMealEdamamResponse,
  { searchTerm: string },
  { rejectValue: string }
>("logMeal/fetchMealData", async ({ searchTerm }, { rejectWithValue }) => {
  try {
    const res = await authFetch(
      `${API}/api/food/search?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" },
    );
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as any)?.ok;
    const data = (body as any)?.data;

    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as TLogMealEdamamResponse;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to load your meal data");
  }
});

export const fetchNutritionData = createAsyncThunk<
  TEdamamNutritionResponse[],
  { foodItems: TFoodItem[] | TFoodItem },
  { rejectValue: string }
>("logMeal/fetchNutritionData", async ({ foodItems }, { rejectWithValue }) => {
  const reqBody = setNutrientsBody({ foodItems });

  try {
    const res = await authFetch(`${API}/api/food/nutrients`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(reqBody),
    });
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as any)?.ok;
    const data = (body as any)?.data;
    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as TEdamamNutritionResponse[];
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to load your meal data");
  }
});

const logMealSlice = createSlice({
  name: "logMeal",
  initialState,
  reducers: (create) => ({
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
    setQuantity: create.reducer(
      (
        state,
        action: PayloadAction<{
          quantity: number;
          groupId: string;
          foodId: string;
          uid: string;
        }>,
      ) => {
        const { uid, quantity, groupId, foodId } = action.payload;
        const group = findGroupById(groupId, state);
        if (!group) return;

        const item = group.foodItems.find(
          (f) => f.foodId === foodId && f.uid === uid,
        );
        if (!item) return;
        if (item.quantity !== quantity) {
          const oldQty = item.quantity;
          const ratio = quantity / oldQty;

          item.nutrients = Object.fromEntries(
            Object.entries(item.nutrients).map(([k, v]) => [
              k,
              v == null ? v : v * ratio,
            ]),
          ) as typeof item.nutrients;

          item.quantity = quantity;
          state.activeItem = item;
          group.groupInfo.quantity = quantity;
        }
      },
    ),
    setMealType: create.reducer(
      (state, action: PayloadAction<{ mealType: TMealType }>) => {
        const { mealType } = action.payload;
        if (state.activeMealType !== mealType) {
          state.activeMealType = mealType;
          state.foodItems = [];
        }
      },
    ),
    setMeal: create.reducer(
      (state, action: PayloadAction<{ food: TFoodItem }>) => {
        if (!state.activeMealType) return;
        state.meal[state.activeMealType].push({
          ...action.payload.food,
        });
      },
    ),
    removeMealItem: create.reducer(
      (state, action: PayloadAction<{ groupId: string }>) => {
        const { groupId } = action.payload;

        if (state.foodItems?.length) {
          state.foodItems = state.foodItems.filter(
            (group) => group.groupId === groupId,
          );
        }

        if (state.activeMealType) {
          state.meal[state.activeMealType] = state.meal[
            state.activeMealType
          ].filter((item) => item.groupId === groupId);
        }

        if (state.activeItem?.groupId === groupId) {
          state.activeItem = null;
        }
      },
    ),
  }),
  extraReducers: (builder) => {
    builder
      .addCase(fetchMealData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMealData.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.status = "succeeded";
        state.foodItems = mapFoodItems(action.payload);
        if (state.activeMealType) {
          state.meal[state.activeMealType] = [
            ...state.meal[state.activeMealType],
            ...setMealItems(state.foodItems),
          ];
        }

        state.error = null;
        state.lastLoadedAt = new Date().toISOString();

        // console.log(current(state));
      })
      .addCase(fetchMealData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't refresh your dashboard.";
      })
      // Fetch nutrition data
      .addCase(fetchNutritionData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchNutritionData.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.status = "succeeded";
        console.log("action.payload", action.payload);

        const requested = action.meta.arg.foodItems;
        const requestedItems = Array.isArray(requested)
          ? requested
          : [requested];
        const requestedFoodIds = new Set(
          requestedItems.map((item) => item.foodId).filter(Boolean),
        );
        const shouldFilterGroups = requestedFoodIds.size > 0;

        if (state.foodItems?.length) {
          state.foodItems = state.foodItems.map((group) => {
            if (shouldFilterGroups) {
              const hasMatch = group.foodItems.some((item) =>
                requestedFoodIds.has(item.foodId ?? ""),
              );
              if (!hasMatch) return group;
            }
            const updatedGroupItems = extractNutrition(
              group.foodItems,
              action.payload,
            );
            return Array.isArray(updatedGroupItems)
              ? { ...group, foodItems: updatedGroupItems }
              : group;
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
            state.meal[state.activeMealType] = state.meal[
              state.activeMealType
            ].map((item) => resolveUpdated(item) ?? item);
          }
        }

        console.log(
          "activeItems nutrients snapshot",
          JSON.stringify(
            state.activeItems?.map((i) => ({
              foodId: i.foodId,
              caloriesKcal: i.nutrients?.caloriesKcal,
              sodiumMg: i.nutrients?.sodiumMg,
            })) ?? [],
            null,
            2,
          ),
        );

        state.error = null;
        state.lastLoadedAt = new Date().toISOString();
      })
      .addCase(fetchNutritionData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't refresh your dashboard.";
      });
  },
});

export default logMealSlice.reducer;
export const {
  setQuantity,
  setActiveItem,
  setMealType,
  setMeal,
  removeMealItem,
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
  selectFoodItems,
  (foodItemsArr: FoodItemsObj[] | null) => {
    return Array.isArray(foodItemsArr)
      ? foodItemsArr
          .map((entry: FoodItemsObj) => {
            // const label = entry.matches?.[0]?.food?.label;
            if (!entry) return null;
            const item = entry.foodItems[0];
            const { uid, name, foodId, groupId, quantity } = item;
            if (!foodId || !groupId) return null;
            return {
              groupId,
              uid,
              foodId,
              name,
              quantity,
              unit: entry.groupInfo.unit ?? "",
            } satisfies ItemSummary;
          })
          .filter((item): item is ItemSummary => item !== null)
      : [];
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
        const { uid, name, foodId, groupId, quantity } = food;
        if (!foodId || !groupId) return null;
        return {
          groupId,
          foodId,
          uid,
          name,
          quantity,
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

function setNutrientsBody({
  foodItems,
}: {
  foodItems: TFoodItem[] | TFoodItem | null;
}) {
  if (!foodItems) return;
  const items = Array.isArray(foodItems) ? foodItems : [foodItems];
  return items.map((foodItem) => {
    const unit = foodItem?.unit?.trim() ?? "";
    const { measureURI, qualifiers } = getMeasureUri(
      foodItem.measures,
      unit,
      foodItem.name,
    );

    return {
      quantity: foodItem.quantity,
      measureURI,
      qualifiers,
      foodId: foodItem.foodId,
    };
  });
}

function getMeasureUri(
  measures: TEdamamMeasure[],
  unit: string,
  foodName?: string,
): { measureURI: string; qualifiers?: string[] } {
  if (!measures?.length) return { measureURI: "" };

  const normalizedUnit = unit.trim().toLowerCase();
  const normalizedFood = foodName?.trim().toLowerCase() ?? "";

  const resolveMeasure = (
    measure: TEdamamMeasure,
  ): { measureURI: string; qualifiers?: string[] } => {
    if (Array.isArray(measure.qualified) && measure.qualified.length > 0) {
      const qualifierUris = Array.from(
        new Set(
          measure.qualified.flatMap((q) => q.qualifiers.map((b) => b.uri)),
        ),
      );
      return { measureURI: measure.uri, qualifiers: qualifierUris };
    }
    return { measureURI: measure.uri };
  };

  if (normalizedUnit) {
    const match = measures.find(
      (measure) => measure.label.toLowerCase() === normalizedUnit,
    );
    if (match) return resolveMeasure(match);
  }

  if (normalizedFood) {
    const match = measures.find((measure) =>
      normalizedFood.includes(measure.label.toLowerCase()),
    );
    if (match) return resolveMeasure(match);
  }

  const fallbackOrder = [
    "whole",
    "serving",
    "gram",
    "ounce",
    "pound",
    "kilogram",
  ];
  for (const label of fallbackOrder) {
    const match = measures.find(
      (measure) => measure.label.toLowerCase() === label,
    );
    if (match) return resolveMeasure(match);
  }

  return resolveMeasure(measures[0]);
}
function mapFoodItems(data: TLogMealEdamamResponse): FoodItemsObj[] | null {
  if (!data) return null;
  return (
    data?.items?.map((item) => {
      const unitNorm = (item.item.unit ?? "").trim().toLowerCase();
      const seen = new Map<string, number>();

      return {
        groupId: item.tempId,
        groupInfo: item.item,
        foodItems:
          item.matches?.map<TFoodItem>((m) => {
            const foodId = m.food.foodId;
            const name = m.food.label;
            const keyBase = `${item.tempId}|${foodId}|${unitNorm}|${name
              .trim()
              .toLowerCase()}`;
            const next = (seen.get(keyBase) ?? 0) + 1;
            seen.set(keyBase, next);
            const uid = `${keyBase}|${next}`;

            return {
              uid,
              foodId,
              name,
              quantity: item.item.quantity,
              groupId: item.tempId,
              source: "user",
              nutrients: {
                caloriesKcal: m.food.nutrients.ENERC_KCAL,
                fatG: m.food.nutrients.FAT,
                carbsG: undefined,
                fiberG: undefined,
                phosphorusMg: undefined,
                potassiumMg: undefined,
                sodiumMg: undefined,
              },
              measures: m.measures,
              unit: item.item.unit ?? "",
            };
          }) ?? [],
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

function extractNutrition(
  activeItems: TFoodItem[] | TFoodItem | null,
  data: TEdamamNutritionResponse[],
): TFoodItem[] | TFoodItem | null {
  if (Array.isArray(activeItems) && !activeItems?.length) return null;
  if (Array.isArray(data) && data.length === 0) return null;

  const nutrientsByFoodId = new Map<
    string,
    TEdamamNutritionResponse["totalNutrients"]
  >();

  for (const response of data) {
    for (const ingredient of response.ingredients ?? []) {
      for (const parsed of ingredient.parsed ?? []) {
        if (!nutrientsByFoodId.has(parsed.foodId)) {
          nutrientsByFoodId.set(parsed.foodId, response.totalNutrients);
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
        proteinG: n.PROCNT?.quantity ?? item.nutrients.proteinG,
        fatG: n.FAT?.quantity ?? item.nutrients.fatG,
        carbsG: n.CHOCDF?.quantity ?? item.nutrients.carbsG,
        fiberG: n.FIBTG?.quantity ?? item.nutrients.fiberG,
        sodiumMg: n.NA?.quantity ?? item.nutrients.sodiumMg,
        potassiumMg: n.K?.quantity ?? item.nutrients.potassiumMg,
        phosphorusMg: n.P?.quantity ?? item.nutrients.phosphorusMg,
      },
    };
  };

  const nutritionUpdated = Array.isArray(activeItems)
    ? activeItems.map(returnNutrition)
    : activeItems
      ? returnNutrition(activeItems)
      : null;

  return nutritionUpdated;
}
