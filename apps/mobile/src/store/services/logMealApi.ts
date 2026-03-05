import { appApi } from "./appApi";
import { TEdamamNutritionResponse, TFoodItem } from "@ckd/core";

import { setNutrientsBody } from "@/screens/log-meal/utils";

const logMealApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    fetchNutritionData: builder.mutation<
      TEdamamNutritionResponse[],
      { foodItems: TFoodItem[] | TFoodItem }
    >({
      invalidatesTags: [{ id: "FOODLIST", type: "Food" as const }],
      query: ({ foodItems }) => ({
        body: setNutrientsBody({ foodItems }) ?? [],
        method: "POST",
        url: "/api/food/nutrients",
      }),
    }),
  }),
});

export const { useFetchNutritionDataMutation } = logMealApi;
