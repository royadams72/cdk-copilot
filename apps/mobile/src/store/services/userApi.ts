import { appApi } from "./appApi";
import type { CurrentUserSettingsResponse } from "./types";

export const userApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentUserSettings: builder.query<CurrentUserSettingsResponse, void>({
      query: () => "/api/users/pii/current",
    }),
    updateCurrentUserSettings: builder.mutation<
      { updatedAt: string },
      Pick<CurrentUserSettingsResponse, "ckdStage" | "dialysisStatus" | "heightCm" | "nhsNumber" | "phoneE164" | "units">
    >({
      query: (body) => ({ body, method: "PATCH", url: "/api/users/pii/current" }),
    }),
    requestEmailChange: builder.mutation<{ devLink?: string; pendingEmail: string }, { email: string }>({
      query: (body) => ({ body, method: "POST", url: "/api/users/pii/current/email" }),
    }),
  }),
  overrideExisting: __DEV__,
});

export const { useGetCurrentUserSettingsQuery, useRequestEmailChangeMutation, useUpdateCurrentUserSettingsMutation } = userApi;
