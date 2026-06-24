import { appApi } from "./appApi";
import type {
  CarePlanDetailResponse,
  CarePlanListResponse,
} from "./types";
import {
  scheduleCarePlanTaskCompletedNotification,
  syncCarePlanReminderNotifications,
} from "@/lib/pushNotifications";

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
      {
        action: "complete_task" | "reopen_task";
        carePlanId: string;
        planTitle?: string;
        taskId: string;
        taskLabel?: string;
      }
    >({
      invalidatesTags: (_result, _error, arg) => [
        { id: arg.carePlanId, type: "CarePlan" as const },
        { id: "LIST", type: "CarePlan" as const },
      ],
      async onQueryStarted(arg, { queryFulfilled }) {
        try {
          const result = await queryFulfilled;
          if (result.data?.updated) {
            await syncCarePlanReminderNotifications();
            if (arg.action === "complete_task") {
              await scheduleCarePlanTaskCompletedNotification({
                planId: arg.carePlanId,
                planTitle: arg.planTitle ?? null,
                taskId: arg.taskId,
                taskLabel: arg.taskLabel ?? null,
              });
            }
          }
        } catch {
          // The care plan update itself is primary; reminder re-sync is best-effort.
        }
      },
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
