import {
  createAsyncThunk,
  createSelector,
  createSlice,
  PayloadAction,
  current,
} from "@reduxjs/toolkit";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import {
  TEdamamFoodMeasure,
  TLogMealEdamamResponse,
  TLogMealResponseItem,
  TFoodItem,
  TLogMealItem,
} from "@ckd/core";
import { RootState } from "..";

export type ItemSummary = {
  groupId: string;
  foodId: string;
  name: string;
  quantity: number;
  unit: string;
};

export type FoodItemsObj = {
  groupId: string;
  original: TLogMealItem;
  foodItems: TFoodItem[];
};
export type logMealState = {
  activeItems: TFoodItem[] | null;
  activeItem: TFoodItem | null;
  foodItems: FoodItemsObj[] | null;
  status: "idle" | "loading" | "succeeded" | "failed";
  error: string | null;
  lastLoadedAt: string | null;
};

const initialState: logMealState = {
  activeItems: null,
  activeItem: null,
  foodItems: null,
  status: "idle",
  error: null,
  lastLoadedAt: null,
};

export const fetchMealData = createAsyncThunk<
  TLogMealEdamamResponse,
  { searchTerm: string },
  { rejectValue: string }
>("logMeal/fetchMealData", async ({ searchTerm }, { rejectWithValue }) => {
  try {
    const res = await authFetch(
      `${API}/api/edamam/food-search?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
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
  TLogMealEdamamResponse,
  { searchTerm: string },
  { rejectValue: string }
>("logMeal/fetchNutritionData", async ({ searchTerm }, { rejectWithValue }) => {
  try {
    const res = await authFetch(
      `${API}/api/edamam?query=${encodeURIComponent(searchTerm)}`,
      { method: "GET" }
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

const logMealSlice = createSlice({
  name: "logMeal",
  initialState,
  reducers: (create) => ({
    setActiveItem: create.reducer(
      (state, action: PayloadAction<{ foodId: string; groupId: string }>) => {
        const { foodId, groupId } = action.payload;
        const item = state?.foodItems
          ?.find((item) => item?.groupId === groupId)
          ?.foodItems?.find((item) => item.foodId === foodId);
        item ? (state.activeItem = item) : null;
      }
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
        // set activeItems on initialising payload
        state.activeItems = setInitialActiveItems(state.foodItems);
        console.log("active", state.activeItems);
        state.error = null;
        state.lastLoadedAt = new Date().toISOString();
      })
      .addCase(fetchMealData.rejected, (state, action) => {
        state.status = "failed";
        state.error =
          action.payload ??
          action.error.message ??
          "We couldn't refresh your dashboard.";
      });
  },
});

export default logMealSlice.reducer;
export const { setActiveItem } = logMealSlice.actions;

const state = (state: RootState) => state.logMeal;

export const selectActiveItems = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.activeItems
);

export const selectActiveItem = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.activeItem
);
export const selectFoodItems = createSelector(
  (state: RootState) => state.logMeal,
  (logMeal) => logMeal.foodItems
);

// export const selectActiveItemDetails = createSelector(
//   [state, selectActiveItem],
//   (state) => {
//     if (!state.activeItem) return;
//     const { foodId, groupId } = state.activeItem;
//     const entry = state.data?.items?.find((obj) => obj?.tempId === groupId);
//     const matches = entry?.matches ?? [];
//     const foodItem = matches.find((obj) => obj.food.foodId === foodId);
//     if (!entry || !foodItem) return;

//     return {
//       groupId,
//       foodId,
//       label: foodItem.food.label,
//       quantity: entry.item.quantity,
//       unit: entry.item.unit ?? "",
//     } satisfies ItemSummary;
//   }
// );

export const selectItemsSummary = createSelector(
  selectFoodItems,
  (foodItemsArr: FoodItemsObj[] | null) => {
    console.log("state");

    return Array.isArray(foodItemsArr)
      ? foodItemsArr
          .map((entry: FoodItemsObj) => {
            // const label = entry.matches?.[0]?.food?.label;
            if (!entry) return null;
            const item = entry.foodItems[0];
            const { name, foodId, groupId, quantity } = item;
            if (!foodId || !groupId) return null;
            return {
              groupId,
              foodId,
              name,
              quantity,
              unit: entry.original.unit ?? "",
            } satisfies ItemSummary;
          })
          .filter((item): item is ItemSummary => item !== null)
      : [];
  }
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
        const { name, foodId, groupId, quantity } = food;
        if (!foodId || !groupId) return null;
        return {
          groupId,
          foodId,
          name,
          quantity,
          unit: entry.original.unit ?? "",
        } satisfies ItemSummary;
      })
      .filter((item): item is ItemSummary => item !== null);
  }
);
// Utils
function mapFoodItems(data: TLogMealEdamamResponse): FoodItemsObj[] | null {
  if (!data) return null;
  return (
    data?.items?.map((item) => ({
      groupId: item.tempId,
      original: item.item,
      foodItems:
        item.matches?.map<TFoodItem>((m) => ({
          foodId: m.food.foodId,
          name: m.food.label,
          quantity: item.item.quantity,
          groupId: item.tempId,
          source: "user",
          nutrients: {
            caloriesKcal: m.food.nutrients.ENERC_KCAL,
            fatG: m.food.nutrients.FAT,
          },
        })) ?? [],
    })) ?? null
  );
}

function setInitialActiveItems(items: FoodItemsObj[] | null) {
  if (!items?.length) return [];
  return items
    .map((item) => item.foodItems[0])
    .filter((foodItem): foodItem is TFoodItem => !!foodItem);
}
