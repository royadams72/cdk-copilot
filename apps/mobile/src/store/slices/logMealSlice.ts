import {
  createAsyncThunk,
  createSelector,
  createSlice,
  current,
  PayloadAction,
} from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { RootState } from "..";
import { formatApiError } from "@/lib/formatApiError";
// TODO: put these types into package
import type { ApiResponse } from "@/screens/dashboard/types";
import type {
  TEdamamMeasure,
  TEdamamNutritionResponse,
  TFoodItem,
  TFoodItemEntry,
  TLogMealEdamamResponse,
  TLogMealItem,
  TMealType,
} from "@ckd/core";

export type ItemSummary = {
  foodId: string;
  groupId: string;
  name: string;
  quantity: number;
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
  status: "idle",
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
      body: JSON.stringify(reqBody),
      headers: { "content-type": "application/json" },
      method: "POST",
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

export const saveMealData = createAsyncThunk<
  ApiResponse<any> | null | string | undefined,
  void,
  { rejectValue: string; state: RootState }
>("logMeal/saveMealData", async (_, { getState, rejectWithValue }) => {
  const state = getState() as RootState;
  const activeMealType = state.logMeal.activeMealType;
  if (!activeMealType) {
    return rejectWithValue("No active meal type");
  }
  const meal = state.logMeal.meal[activeMealType] ?? [];
  const payload = {
    [activeMealType]: meal,
    eatenAt: state.logMeal.eatenAt ?? new Date().toISOString(),
  } as Record<TMealType, TFoodItem[]> & {
    eatenAt: string;
  };

  try {
    const res = await authFetch(`${API}/api/food/save`, {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    type Response = ApiResponse<any>;
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as Response)?.ok;
    const data = (body as Response)?.data;
    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as Response;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to save your meal data");
  }
});

export const updateMealData = createAsyncThunk<
  ApiResponse<any> | null | string | undefined,
  void,
  { rejectValue: string; state: RootState }
>("logMeal/updateMealData", async (_, { getState, rejectWithValue }) => {
  const state = getState() as RootState;
  const activeMealType = state.logMeal.activeMealType;
  const entryId = state.logMeal.editingEntryId;
  if (!activeMealType) {
    return rejectWithValue("No active meal type");
  }
  if (!entryId) {
    return rejectWithValue("No meal to update");
  }
  const meal = state.logMeal.meal[activeMealType] ?? [];
  const payload = {
    [activeMealType]: meal,
    eatenAt: state.logMeal.eatenAt ?? new Date().toISOString(),
    entryId,
  } as Record<TMealType, TFoodItem[]> & {
    eatenAt: string;
    entryId: string;
  };

  try {
    const res = await authFetch(`${API}/api/food/update`, {
      body: JSON.stringify(payload),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    type Response = ApiResponse<any>;
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as Response)?.ok;
    const data = (body as Response)?.data;
    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as Response;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to update your meal data");
  }
});

export const deleteMealData = createAsyncThunk<
  ApiResponse<any> | null | string | undefined,
  { entryId?: string } | void,
  { rejectValue: string; state: RootState }
>("logMeal/deleteMealData", async (arg, { getState, rejectWithValue }) => {
  const state = getState() as RootState;
  const entryId = arg?.entryId ?? state.logMeal.editingEntryId;
  if (!entryId) {
    return rejectWithValue("No meal to delete");
  }

  try {
    const res = await authFetch(`${API}/api/food/delete`, {
      body: JSON.stringify({ entryId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    type Response = ApiResponse<any>;
    const body: unknown = await res.json().catch(() => null);
    const ok = !!(body as Response)?.ok;
    const data = (body as Response)?.data;
    if (!res.ok || !ok) {
      throw new Error(formatApiError(res.status, (body as any) ?? null));
    }
    return data as Response;
  } catch (err: any) {
    return rejectWithValue(err?.message ?? "Failed to delete your meal data");
  }
});

export const checkMealExists = createAsyncThunk<
  { eatenAt: string | null; entryId: string; mealType: TMealType } | null,
  { eatenAt: string; mealType: TMealType },
  { rejectValue: string }
>(
  "logMeal/checkMealExists",
  async ({ mealType, eatenAt }, { rejectWithValue }) => {
    try {
      const res = await authFetch(`${API}/api/food/exists`, {
        body: JSON.stringify({ eatenAt, mealType }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body: unknown = await res.json().catch(() => null);
      const ok = !!(body as any)?.ok;
      const data = (body as any)?.data;
      if (!res.ok || !ok) {
        throw new Error(formatApiError(res.status, (body as any) ?? null));
      }
      return (data?.exists ? data : null) as {
        eatenAt: string | null;
        entryId: string;
        mealType: TMealType;
      } | null;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? "Failed to check existing meals");
    }
  },
);

export const fetchMealByDate = createAsyncThunk<
  {
    eatenAt: string | null;
    entryId: string;
    items: TFoodItemEntry[];
    mealType: TMealType;
  } | null,
  { eatenAt: string; mealType: TMealType },
  { rejectValue: string }
>(
  "logMeal/fetchMealByDate",
  async ({ mealType, eatenAt }, { rejectWithValue }) => {
    try {
      const res = await authFetch(`${API}/api/food/by-date`, {
        body: JSON.stringify({ eatenAt, mealType }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const body: unknown = await res.json().catch(() => null);
      const ok = !!(body as any)?.ok;
      const data = (body as any)?.data;
      if (!res.ok || !ok) {
        throw new Error(formatApiError(res.status, (body as any) ?? null));
      }
      return (data?.entry ?? null) as {
        eatenAt: string | null;
        entryId: string;
        items: TFoodItemEntry[];
        mealType: TMealType;
      } | null;
    } catch (err: any) {
      return rejectWithValue(err?.message ?? "Failed to load your meal");
    }
  },
);

const logMealSlice = createSlice({
  extraReducers: (builder) => {
    builder
      .addCase(fetchMealData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMealData.fulfilled, (state, action) => {
        if (!action.payload) return;
        state.status = "succeeded";
        const incomingGroups = mapFoodItems(action.payload);
        state.foodItems = mergeUniqueFoodGroups(
          state.foodItems,
          incomingGroups,
        );
        if (state.activeMealType) {
          state.meal[state.activeMealType] = mergeUniqueMealItems(
            state.meal[state.activeMealType],
            setMealItems(incomingGroups),
          );
        }
        state.isDirty = true;

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
              caloriesKcal: i.nutrients?.caloriesKcal,
              foodId: i.foodId,
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
      })
      .addCase(saveMealData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(saveMealData.fulfilled, (state, action) => {
        resetLogMeal(state);
        state.status = "succeeded";
      })
      .addCase(saveMealData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't save your meal data.";
      });
    builder
      .addCase(updateMealData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(updateMealData.fulfilled, (state) => {
        resetLogMeal(state);
        state.status = "succeeded";
      })
      .addCase(updateMealData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't update your meal data.";
      });
    builder
      .addCase(deleteMealData.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(deleteMealData.fulfilled, (state) => {
        resetLogMeal(state);
        state.status = "succeeded";
      })
      .addCase(deleteMealData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't delete your meal data.";
      });
    builder
      .addCase(checkMealExists.pending, (state) => {
        state.mealCandidate = null;
      })
      .addCase(checkMealExists.fulfilled, (state, action) => {
        state.mealCandidate = action.payload ?? null;
      })
      .addCase(checkMealExists.rejected, (state) => {
        state.mealCandidate = null;
      });
    builder
      .addCase(fetchMealByDate.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchMealByDate.fulfilled, (state, action) => {
        state.status = "succeeded";
        if (action.payload) {
          mergeEntryIntoState(state, action.payload);
          state.mealCandidate = null;
        }
      })
      .addCase(fetchMealByDate.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ?? action.error.message ?? "Failed to load your meal.";
      });
  },
  initialState,
  name: "logMeal",
  reducers: (create) => ({
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

        if (state.foodItems?.length) {
          state.foodItems = state.foodItems.filter(
            (group) => group.groupId !== groupId,
          );
        }

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
        }
      },
    ),
    setQuantity: create.reducer(
      (
        state,
        action: PayloadAction<{
          foodId: string;
          groupId: string;
          quantity: number;
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
          state.isDirty = true;
        }
      },
    ),
  }),
});

export default logMealSlice.reducer;
export const {
  setQuantity,
  setActiveItem,
  setMealType,
  setMeal,
  removeMealItem,
  clearMealState,
  setEatenAt,
  hydrateMealFromEntry,
  clearMealCandidate,
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
        if (!uid || !foodId || !groupId) return null;
        return {
          foodId,
          groupId,
          name,
          quantity,
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
        const { uid, name, foodId, groupId, quantity } = food;
        if (!foodId || !groupId) return null;
        return {
          foodId,
          groupId,
          name,
          quantity,
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
      foodId: foodItem.foodId,
      measureURI,
      qualifiers,
      quantity: foodItem.quantity,
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
              unit: item.item.unit ?? "",
            };
          }) ?? [],
        groupId: item.tempId,
        groupInfo: item.item,
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
  if (a.uid && b.uid && a.uid === b.uid) return true;
  return (
    a.foodId === b.foodId &&
    (a.name ?? "").trim().toLowerCase() ===
      (b.name ?? "").trim().toLowerCase() &&
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
  state.isDirty = true;
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
