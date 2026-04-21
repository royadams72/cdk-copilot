import { appApi } from "./appApi";
import type {
  CreateMeasurementArgs,
  ExerciseReferenceResponse,
  MeasurementHistoryResponse,
  MeasurementKind,
  MeasurementLatest,
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
    getMeasurementHistory: builder.query<
      MeasurementHistoryResponse,
      MeasurementKind
    >({
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
        { id: "history", type: "Fitness" as const },
        { id: `history:${arg.kind}`, type: "Fitness" as const },
        { id: "today", type: "Dashboard" as const },
      ],
      query: (body) => ({
        body,
        method: "POST",
        url: "/api/measurements/create",
      }),
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
} = measurementsApi;
