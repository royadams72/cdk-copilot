import { appApi } from "./appApi";
import type {
  CreateMeasurementArgs,
  UpdateMeasurementArgs,
  ExerciseReferenceResponse,
  MeasurementHistoryResponse,
  MeasurementKind,
  MeasurementLatest,
  WeeklySleepSummaryResponse,
} from "./types";

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
    }),
    updateMeasurement: builder.mutation<unknown, UpdateMeasurementArgs>({
      invalidatesTags: (_result, _error, arg) => [
        { id: "latest", type: "Fitness" as const },
        { id: "history", type: "Fitness" as const },
        { id: `history:${arg.kind}`, type: "Fitness" as const },
        { id: "today", type: "Dashboard" as const },
      ],
      query: ({ measurementId, ...body }) => ({
        body,
        method: "PATCH",
        url: `/api/measurements/${encodeURIComponent(measurementId)}`,
      }),
    }),
    deleteMeasurement: builder.mutation<
      unknown,
      { kind: MeasurementKind; measurementId: string }
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: "latest", type: "Fitness" as const },
        { id: "history", type: "Fitness" as const },
        { id: `history:${arg.kind}`, type: "Fitness" as const },
        { id: "today", type: "Dashboard" as const },
      ],
      query: ({ measurementId }) => ({
        method: "DELETE",
        url: `/api/measurements/${encodeURIComponent(measurementId)}`,
      }),
    }),
  }),
  // Expo/Metro can re-evaluate injected endpoint modules during Fast Refresh
  // or after switching branches with a stale bundle graph.
  overrideExisting: __DEV__,
});

export const {
  useCreateMeasurementMutation,
  useDeleteMeasurementMutation,
  useGetExerciseReferenceQuery,
  useGetLatestMeasurementsQuery,
  useGetMeasurementHistoryQuery,
  useGetWeeklySleepSummaryQuery,
  useLazyGetWeeklySleepSummaryQuery,
  useUpdateMeasurementMutation,
} = measurementsApi;
