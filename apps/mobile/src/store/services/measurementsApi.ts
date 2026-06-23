import { appApi } from "./appApi";
import type {
  CreateMeasurementArgs,
  ExerciseReferenceResponse,
  MeasurementHistoryResponse,
  MeasurementKind,
  MeasurementLatest,
  WeeklySleepSummaryResponse,
} from "./types";
import { syncWorseningTrendNotifications } from "@/lib/pushNotifications";

export const measurementsApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getExerciseReference: builder.query<ExerciseReferenceResponse, void>({
      keepUnusedDataFor: 60 * 60,
      providesTags: [{ id: "exercise-reference", type: "Fitness" as const }],
      query: () => "/api/measurements/exercise-reference",
    }),
    getLatestMeasurements: builder.query<MeasurementLatest[], void>({
      providesTags: [{ id: "latest", type: "Fitness" as const }],
      query: () => "/api/measurements/latest",
    }),
    getWeeklySleepSummary: builder.query<WeeklySleepSummaryResponse, void>({
      keepUnusedDataFor: 15 * 60,
      providesTags: [{ id: "weekly-sleep-summary", type: "Fitness" as const }],
      query: () => "/api/sleep/weekly-summary/latest",
      transformResponse: (response: { summary?: WeeklySleepSummaryResponse }) =>
        response?.summary ?? null,
    }),
    getMeasurementHistory: builder.query<
      MeasurementHistoryResponse,
      MeasurementKind
    >({
      keepUnusedDataFor: 15 * 60,
      providesTags: (_result, _error, kind) => [
        { id: "history", type: "Fitness" as const },
        { id: `history:${kind}`, type: "Fitness" as const },
      ],
      query: (kind) =>
        `/api/measurements/history?kind=${encodeURIComponent(kind)}`,
    }),
    createMeasurement: builder.mutation<unknown, CreateMeasurementArgs>({
      invalidatesTags: (_result, _error, arg) => [
        { id: "latest", type: "Fitness" as const },
        { id: "weekly-sleep-summary", type: "Fitness" as const },
        { id: "today", type: "Dashboard" as const },
        ...(arg.source === "provider"
          ? []
          : ([
              { id: "history", type: "Fitness" as const },
              { id: `history:${arg.kind}`, type: "Fitness" as const },
            ] as const)),
      ],
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/measurements/create",
      }),
      async onQueryStarted(arg, { queryFulfilled }) {
        try {
          await queryFulfilled;
          if (arg.kind === "steps" || arg.kind === "weight") {
            await syncWorseningTrendNotifications({
              suppressImmediateAlerts: true,
            });
          }
        } catch {
          // Ignore sync follow-up errors; the measurement write itself is primary.
        }
      },
    }),
  }),
  // Expo/Metro can re-evaluate injected endpoint modules during Fast Refresh
  // or after switching branches with a stale bundle graph.
  overrideExisting: __DEV__,
});

export const {
  useCreateMeasurementMutation,
  useGetExerciseReferenceQuery,
  useGetLatestMeasurementsQuery,
  useGetMeasurementHistoryQuery,
  useGetWeeklySleepSummaryQuery,
  useLazyGetWeeklySleepSummaryQuery,
} = measurementsApi;
