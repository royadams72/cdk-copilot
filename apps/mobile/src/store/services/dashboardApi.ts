import { TWeeklyNutritionInsight } from "@ckd/core";
import type {
  DashboardData,
  NutritionDailyPoint,
  NutritionTrendChunk,
} from "@/screens/dashboard/types";
import {
  DashboardQueryData,
  DashboardScope,
  MonthlyNutritionFilter,
  MonthlyNutritionSummaryResponse,
  NutritionTrendChunkArgs,
  NutritionTrendData,
  RunWeeklyNutritionInsightArgs,
  TargetDomain,
  TargetItem,
  TargetsResponse,
  UpdateTargetArgs,
  WeeklyNutritionInsightResponse,
} from "./types";

import { appApi } from "./appApi";

export { toQueryErrorMessage } from "./appApi";
export type {
  MeasurementKind,
  TargetDefinitionValue,
  TargetDomain,
  TargetItem,
} from "./types";

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
    getLatestWeeklyNutritionInsight: builder.query<
      WeeklyNutritionInsightResponse,
      void
    >({
      providesTags: [{ id: "weekly-summary", type: "Dashboard" as const }],
      query: () => "/api/nutrition/weekly-summary/latest",
      transformResponse: (response: {
        insight: TWeeklyNutritionInsight | null;
      }) => response?.insight ?? null,
    }),
    getMonthlyNutritionSummary: builder.query<
      MonthlyNutritionSummaryResponse,
      { filter?: MonthlyNutritionFilter; month?: string } | void
    >({
      providesTags: [{ id: "monthly-summary", type: "Dashboard" as const }],
      query: (args) => {
        const params = new URLSearchParams();
        if (args?.filter) params.set("filter", args.filter);
        if (args?.month) params.set("month", args.month);
        const query = params.toString();
        return query
          ? `/api/nutrition/monthly-summary?${query}`
          : "/api/nutrition/monthly-summary";
      },
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
    getTargets: builder.query<TargetsResponse, TargetDomain | void>({
      providesTags: (_result, _error, domain) => [
        { id: domain ?? "all", type: "Targets" as const },
      ],
      query: (domain) =>
        domain ? `/api/targets?domain=${domain}` : "/api/targets",
    }),
    runWeeklyNutritionInsight: builder.mutation<
      TWeeklyNutritionInsight,
      RunWeeklyNutritionInsightArgs | void
    >({
      invalidatesTags: [
        { id: "today", type: "Dashboard" as const },
        { id: "all", type: "Dashboard" as const },
        { id: "weekly-summary", type: "Dashboard" as const },
      ],
      query: (body) => ({
        body: body ?? {},
        method: "POST",
        url: "/api/nutrition/weekly-summary/run",
      }),
    }),
    updateTarget: builder.mutation<
      { metric: string; target: TargetItem; updated: boolean },
      UpdateTargetArgs
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: "today", type: "Dashboard" as const },
        { id: "all", type: "Dashboard" as const },
        { id: "latest", type: "Fitness" as const },
        { id: "trend", type: "Dashboard" as const },
        { id: "monthly-summary", type: "Dashboard" as const },
        { id: "all", type: "Targets" as const },
        { id: arg.metric, type: "Targets" as const },
        { id: "renal", type: "Targets" as const },
        { id: "lifestyle", type: "Targets" as const },
      ],
      query: (body) => ({
        body,
        method: "PATCH",
        url: "/api/targets/update",
      }),
    }),
  }),
  // Expo/Metro can re-evaluate injected endpoint modules during Fast Refresh
  // or after switching branches with a stale bundle graph.
  overrideExisting: __DEV__,
});

export const {
  useGetDashboardQuery,
  useGetLatestWeeklyNutritionInsightQuery,
  useGetMonthlyNutritionSummaryQuery,
  useGetNutritionTrendChunkQuery,
  useGetTargetsQuery,
  useLazyGetNutritionTrendChunkQuery,
  useRunWeeklyNutritionInsightMutation,
  useUpdateTargetMutation,
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
      Object.keys(current.targets).length > 0
        ? current.targets
        : incoming.targets,
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
