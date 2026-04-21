import { appApi } from "./appApi";
import type { CurrentUserSettingsResponse } from "./types";

export const userApi = appApi.injectEndpoints({
  endpoints: (builder) => ({
    getCurrentUserSettings: builder.query<CurrentUserSettingsResponse, void>({
      query: () => "/api/users/pii/current",
    }),
  }),
  overrideExisting: __DEV__,
});

export const { useGetCurrentUserSettingsQuery } = userApi;
