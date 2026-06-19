import { appApi } from "./appApi";
import type {
  CarePlanDetailResponse,
  CarePlanListResponse,
} from "./types";

export const carePlanApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCarePlanById: builder.query<
      CarePlanDetailResponse["plan"] & { activity: CarePlanDetailResponse["activity"] },
      string
    >({
      providesTags: (_result, _error, id) => [{ id, type: "CarePlan" as const }],
      query: (id) => `/api/care-plans/${id}`,
      transformResponse: (response: CarePlanDetailResponse) => ({
        ...response.plan,
        activity: response.activity,
      }),
    }),
    getCarePlans: builder.query<CarePlanListResponse, void>({
      providesTags: (result) => [
        { id: "LIST", type: "CarePlan" as const },
        ...(result?.items?.map((item) => ({
          id: item.id,
          type: "CarePlan" as const,
        })) ?? []),
      ],
      query: () => "/api/care-plans",
    }),
    updateCarePlanTaskStatus: builder.mutation<
      { updated: boolean },
      { action: "complete_task" | "reopen_task"; carePlanId: string; taskId: string }
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: arg.carePlanId, type: "CarePlan" as const },
        { id: "LIST", type: "CarePlan" as const },
      ],
      query: ({ action, carePlanId, taskId }) => ({
        body: { action, taskId },
        method: "PATCH",
        url: `/api/care-plans/${carePlanId}`,
      }),
    }),
  }),
  overrideExisting: __DEV__,
});

export const {
  useGetCarePlanByIdQuery,
  useGetCarePlansQuery,
  useUpdateCarePlanTaskStatusMutation,
} = carePlanApi;
