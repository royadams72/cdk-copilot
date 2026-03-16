import type {
  DashboardData,
  FoodHighlight,
  NutrientKey,
  NutritionDailyPoint,
  NutritionMetricKey,
  NutritionTrendChunk,
} from "@/screens/dashboard/types";

import { appApi } from "./appApi";
export { toQueryErrorMessage } from "./appApi";

export type DashboardScope = "today" | "all";
export type DashboardQueryData = Omit<DashboardData, "patientId">;
export type NutritionTrendChunkArgs = {
  before?: string;
  days?: number;
  reset?: boolean;
};

export type NutritionTrendData = {
  dailySeries: NutritionDailyPoint[];
  foodHighlightsByDate: Record<
    string,
    Record<NutritionMetricKey, FoodHighlight[]>
  >;
  hasMore: boolean;
  mealsByDate: NutritionTrendChunk["nutrition"]["mealsByDate"];
  nextBefore: string | null;
  targets: Partial<Record<NutrientKey, number>>;
};

export type MeasurementKind = "steps" | "exercise" | "sleep" | "blood_pressure";

export type MeasurementLatest = {
  count?: number;
  diastolicMmHg?: number;
  durationMin?: number;
  exercise?: {
    caloriesKcal?: number;
    durationMin?: number;
    name?: string;
  };
  kind: MeasurementKind;
  measuredAt?: string;
  systolicMmHg?: number;
};

export const dashboardApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getDashboard: builder.query<DashboardQueryData, DashboardScope | void>({
      providesTags: (_result, _error, scope) => [
        { id: scope ?? "today", type: "Dashboard" as const },
      ],
      query: (scope) => `/api/dashboard?scope=${scope ?? "today"}`,
      transformResponse: (response: DashboardData) => {
        const { patientId: _patientId, ...safeResponse } = response;
        return safeResponse;
      },
    }),
    getLatestMeasurements: builder.query<MeasurementLatest[], void>({
      providesTags: [{ id: "latest", type: "Fitness" as const }],
      query: () => "/api/measurements/latest",
    }),
    getNutritionTrendChunk: builder.query<
      NutritionTrendData,
      NutritionTrendChunkArgs | void
    >({
      forceRefetch: ({ currentArg, previousArg }) => {
        if (currentArg?.reset) {
          return true;
        }
        if (currentArg?.before) {
          return (
            currentArg.before !== previousArg?.before ||
            currentArg.days !== previousArg?.days
          );
        }
        if (previousArg?.before) {
          return false;
        }
        return currentArg?.days !== previousArg?.days;
      },
      keepUnusedDataFor: 60 * 15,
      merge: (currentCache, incoming, { arg }) => {
        const nextValue =
          arg?.reset || !arg?.before
            ? incoming
            : mergeNutritionTrendData(currentCache, incoming);
        Object.assign(currentCache, nextValue);
      },
      providesTags: [{ id: "trend", type: "Dashboard" as const }],
      query: (args) => {
        const params = new URLSearchParams();
        params.set("days", String(args?.days ?? 7));
        if (args?.before) {
          params.set("before", args.before);
        }
        return `/api/nutrition/trend?${params.toString()}`;
      },
      serializeQueryArgs: ({ endpointName }) => endpointName,
      transformResponse: (response: NutritionTrendChunk) =>
        toNutritionTrendData(response),
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetDashboardQuery,
  useGetLatestMeasurementsQuery,
  useGetNutritionTrendChunkQuery,
  useLazyGetNutritionTrendChunkQuery,
} = dashboardApi;

function toNutritionTrendData(chunk: NutritionTrendChunk): NutritionTrendData {
  return {
    dailySeries: sortDailySeries(chunk.nutrition.dailySeries),
    foodHighlightsByDate: chunk.nutrition.foodHighlights.itemsByDate,
    hasMore: chunk.hasMore,
    mealsByDate: chunk.nutrition.mealsByDate,
    nextBefore: chunk.nextBefore,
    targets: chunk.targets,
  };
}

function mergeNutritionTrendData(
  current: NutritionTrendData,
  incoming: NutritionTrendData,
): NutritionTrendData {
  return {
    dailySeries: sortDailySeries([
      ...current.dailySeries,
      ...incoming.dailySeries,
    ]),
    foodHighlightsByDate: {
      ...incoming.foodHighlightsByDate,
      ...current.foodHighlightsByDate,
    },
    hasMore: incoming.hasMore,
    mealsByDate: {
      ...incoming.mealsByDate,
      ...current.mealsByDate,
    },
    nextBefore: incoming.nextBefore,
    targets:
      Object.keys(current.targets).length > 0 ? current.targets : incoming.targets,
  };
}

function sortDailySeries(series: NutritionDailyPoint[]) {
  const deduped = new Map<string, NutritionDailyPoint>();
  for (const point of series) {
    deduped.set(point.date, point);
  }
  return Array.from(deduped.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
