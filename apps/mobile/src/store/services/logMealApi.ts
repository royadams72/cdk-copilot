import { appApi } from "./appApi";
import {
  TEdamamNutritionResponse,
  TFoodItem,
  TLogMealEdamamResponse,
} from "@ckd/core";

import { setNutrientsBody } from "@/screens/log-meal/utils";

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
  }),
});

export const { useFetchNutritionDataMutation, useLazyFetchMealDataQuery } =
  logMealApi;
