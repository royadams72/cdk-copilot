import { appApi } from "./appApi";
import {
  TEdamamNutritionResponse,
  TFoodItem,
  TLogMealEdamamResponse,
} from "@ckd/core";

import { setNutrientsBody } from "@/store/services/utils";
import { ApiResponse } from "@/screens/dashboard/types";
import { MealData } from "@/screens/log-meal/utils";

const logMealApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    fetchMealData: builder.query<
      TLogMealEdamamResponse,
      { searchTerm: string }
    >({
      query: ({ searchTerm }) => ({
        method: "GET",
        url: `/api/food/search?query=${encodeURIComponent(searchTerm)}`,
      }),
    }),
    fetchNutritionData: builder.mutation<
      TEdamamNutritionResponse[],
      { foodItems: TFoodItem[] | TFoodItem }
    >({
      query: ({ foodItems }) => ({
        body: setNutrientsBody({ foodItems }) ?? [],
        method: "POST",
        url: "/api/food/nutrients",
      }),
    }),
    saveMealData: builder.mutation<
      ApiResponse<any> | null | string | undefined,
      {
        mealData: MealData;
      }
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: "today", type: "Dashboard" },
        { id: "all", type: "Dashboard" },
      ],
      query: ({ mealData }) => ({
        body: mealData,
        method: "POST",
        url: `/api/food/save`,
      }),
    }),
    updateMealData: builder.mutation<
      ApiResponse<any> | null | string | undefined,
      {
        mealData: MealData;
      }
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: "today", type: "Dashboard" },
        { id: "all", type: "Dashboard" },
      ],
      query: ({ mealData }) => ({
        body: mealData,
        method: "POST",
        url: `/api/food/update`,
      }),
    }),
  }),
});

export const {
  useFetchNutritionDataMutation,
  useLazyFetchMealDataQuery,
  useSaveMealDataMutation,
  useUpdateMealDataMutation,
} = logMealApi;
