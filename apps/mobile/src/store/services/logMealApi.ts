import { appApi } from "./appApi";
import {
  TEdamamNutritionLookupResult,
  TFoodItem,
  TFoodItemEntry,
  TMealType,
  TNutritionFavouriteFood,
  TNutritionFavouriteMeal,
} from "@ckd/core";
import type { TLogMealEdamamResponse } from "../../../../../packages/core/src/isomorphic/schemas/log_meal";

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
      TEdamamNutritionLookupResult[],
      { foodItems: TFoodItem[] | TFoodItem }
    >({
      query: ({ foodItems }) => ({
        body: setNutrientsBody({ foodItems }) ?? [],
        method: "POST",
        url: "/api/food/nutrients",
      }),
    }),
    fetchFavouriteItems: builder.query<
      {
        foods: Array<
          Omit<TNutritionFavouriteFood, "patientId" | "createdAt" | "updatedAt" | "lastUsedAt"> & {
            id: string;
            lastUsedAt: string;
            updatedAt: string;
          }
        >;
        meals: Array<
          Omit<TNutritionFavouriteMeal, "patientId" | "createdAt" | "updatedAt" | "lastUsedAt"> & {
            id: string;
            lastUsedAt: string;
            updatedAt: string;
          }
        >;
      },
      void
    >({
      providesTags: [{ id: "favourites", type: "Food" }],
      query: () => ({
        method: "GET",
        url: "/api/food/favourites",
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
        { id: "trend", type: "Dashboard" },
        { id: "favourites", type: "Food" },
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
        { id: "trend", type: "Dashboard" },
        { id: "favourites", type: "Food" },
      ],
      query: ({ mealData }) => ({
        body: mealData,
        method: "POST",
        url: `/api/food/update`,
      }),
    }),
    deleteMealData: builder.mutation<
      ApiResponse<any> | null | string | undefined,
      {
        entryId: string;
      }
    >({
      invalidatesTags: (_result, _error, _arg) => [
        { id: "today", type: "Dashboard" },
        { id: "all", type: "Dashboard" },
        { id: "trend", type: "Dashboard" },
        { id: "favourites", type: "Food" },
      ],
      query: ({ entryId }) => ({
        body: { entryId },
        method: "POST",
        url: `/api/food/delete`,
      }),
    }),
    checkMealExists: builder.mutation<
      { eatenAt: string | null; entryId: string; mealType: TMealType } | null,
      { eatenAt: string; mealType: TMealType }
    >({
      query: ({ eatenAt, mealType }) => ({
        body: { eatenAt, mealType },
        method: "POST",
        url: "/api/food/exists",
      }),
      transformResponse: (response: {
        exists?: boolean;
        eatenAt?: string | null;
        entryId?: string;
        mealType?: TMealType;
      }) => {
        if (!response?.exists || !response.entryId || !response.mealType) {
          return null;
        }
        return {
          eatenAt: response.eatenAt ?? null,
          entryId: response.entryId,
          mealType: response.mealType,
        };
      },
    }),
    fetchMealByDate: builder.mutation<
      {
        eatenAt: string | null;
        entryId: string;
        items: TFoodItemEntry[];
        mealType: TMealType;
      } | null,
      { eatenAt: string; mealType: TMealType }
    >({
      query: ({ eatenAt, mealType }) => ({
        body: { eatenAt, mealType },
        method: "POST",
        url: "/api/food/by-date",
      }),
      transformResponse: (response: {
        entry?: {
          eatenAt: string | null;
          entryId: string;
          items: TFoodItemEntry[];
          mealType: TMealType;
        } | null;
      }) => response?.entry ?? null,
    }),
  }),
  overrideExisting: true,
});

export const {
  useFetchFavouriteItemsQuery,
  useFetchNutritionDataMutation,
  useFetchMealByDateMutation,
  useCheckMealExistsMutation,
  useDeleteMealDataMutation,
  useLazyFetchMealDataQuery,
  useSaveMealDataMutation,
  useUpdateMealDataMutation,
} = logMealApi;
