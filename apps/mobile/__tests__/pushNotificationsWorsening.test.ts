const mockCancelScheduledNotificationAsync = jest.fn<
  Promise<void>,
  [string]
>(async () => undefined);
const mockGetAllScheduledNotificationsAsync = jest.fn<Promise<any[]>, []>(
  async () => [],
);
const mockGetPermissionsAsync = jest.fn<
  Promise<{ status: "granted" }>,
  []
>(async () => ({ status: "granted" }));
const mockRequestPermissionsAsync = jest.fn<
  Promise<{ status: "granted" }>,
  []
>(async () => ({ status: "granted" }));
const mockScheduleNotificationAsync = jest.fn<
  Promise<string>,
  [any]
>(async () => "notification-id");
const mockPresentNotificationAsync = jest.fn<
  Promise<string>,
  [any]
>(async () => "presented-notification-id");
const mockSetNotificationChannelAsync = jest.fn<
  Promise<void>,
  [string, any]
>(async () => undefined);
const mockSetNotificationHandler = jest.fn();

const mockDeleteItemAsync = jest.fn(async () => undefined);
const mockGetItemAsync = jest.fn<Promise<string | null>, [string]>(
  async (_key: string) => null,
);
const mockSetItemAsync = jest.fn(async () => undefined);

const mockAuthFetch = jest.fn();
const mockAlert = jest.fn();

jest.mock("expo-notifications", () => ({
  AndroidImportance: {
    DEFAULT: "default",
    HIGH: "high",
  },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    TIME_INTERVAL: "timeInterval",
    WEEKLY: "weekly",
  },
  cancelScheduledNotificationAsync: mockCancelScheduledNotificationAsync,
  getAllScheduledNotificationsAsync: mockGetAllScheduledNotificationsAsync,
  getPermissionsAsync: mockGetPermissionsAsync,
  presentNotificationAsync: mockPresentNotificationAsync,
  requestPermissionsAsync: mockRequestPermissionsAsync,
  scheduleNotificationAsync: mockScheduleNotificationAsync,
  setNotificationChannelAsync: mockSetNotificationChannelAsync,
  setNotificationHandler: mockSetNotificationHandler,
}));

jest.mock("expo-secure-store", () => ({
  deleteItemAsync: mockDeleteItemAsync,
  getItemAsync: mockGetItemAsync,
  setItemAsync: mockSetItemAsync,
}));

jest.mock("expo-constants", () => ({
  default: {
    easConfig: { projectId: "test-project" },
    expoConfig: { extra: { eas: { projectId: "test-project" } } },
  },
}));

jest.mock("react-native", () => ({
  Alert: {
    alert: (...args: unknown[]) => mockAlert(...args),
  },
  NativeModules: {
    HealthConnectBackgroundSync: {},
  },
  Platform: {
    OS: "android",
    select: <T,>(options: { android?: T; default?: T; ios?: T }) =>
      options.android ?? options.default ?? options.ios ?? null,
  },
}));

jest.mock("@/lib/authFetch", () => ({
  authFetch: (...args: unknown[]) => mockAuthFetch(...args),
}));

import { syncWorseningTrendNotifications } from "@/lib/pushNotifications";

describe("syncWorseningTrendNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([]);
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockPresentNotificationAsync.mockResolvedValue("presented-notification-id");
    mockGetItemAsync.mockImplementation(async (key: string) => {
      if (key === "ckd_jwt") {
        return "jwt-token";
      }
      if (key === "ckd_worsening_trend_alert_state") {
        return "[]";
      }
      return null;
    });
    mockAuthFetch.mockResolvedValue({
      json: async () => ({
        items: [
          {
            body: "Your recent activity is below your normal baseline.",
            detail: "7-day average 6,500 steps vs previous 28-day average 10,000 steps.",
            detectedAt: "2026-06-22T09:00:00.000Z",
            id: "steps_decline:2026-06-16:2026-06-22",
            key: "steps_decline",
            level: "level_1_nudge",
            portalEscalationEligible: false,
            repeatAtLocalTime: "09:00",
            repeatUntil: "trend_normalised",
            screen: "/(fitness)/fitness-details",
            title: "Activity down",
          },
        ],
      }),
      ok: true,
      status: 200,
    });
  });

  it("sends a new local alert and schedules a daily 09:00 reminder", async () => {
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      {
        content: {
          data: {
            type: "worsening-trend-reminder",
          },
        },
        identifier: "old-reminder-id",
      },
    ]);

    const result = await syncWorseningTrendNotifications();

    expect(result).toBe(true);
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      "worsening-trend-alerts",
      expect.objectContaining({ importance: "high", name: "Worsening trend alerts" }),
    );
    expect(mockSetNotificationChannelAsync).toHaveBeenCalledWith(
      "worsening-trend-reminders",
      expect.objectContaining({ importance: "default", name: "Worsening trend reminders" }),
    );
    expect(mockPresentNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        channelId: "worsening-trend-alerts",
        data: expect.objectContaining({
          type: "worsening-trend-alert",
          trendKey: "steps_decline",
        }),
        title: "Activity down",
      }),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      "Activity down",
      "Your recent activity is below your normal baseline.",
      expect.arrayContaining([
        expect.objectContaining({ text: "Later" }),
        expect.objectContaining({ text: "Review now" }),
      ]),
    );
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "old-reminder-id",
    );
    expect(mockScheduleNotificationAsync).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        content: expect.objectContaining({
          channelId: "worsening-trend-reminders",
        }),
        trigger: {
          hour: 9,
          minute: 0,
          type: "daily",
        },
      }),
    );
    expect(mockSetItemAsync).toHaveBeenCalledWith(
      "ckd_worsening_trend_alert_state",
      expect.any(String),
    );
    const lastSetItemCall = mockSetItemAsync.mock.calls[
      mockSetItemAsync.mock.calls.length - 1
    ] as unknown as [string, string];
    const savedState = JSON.parse(
      lastSetItemCall[1],
    ) as Record<string, { detectedAt?: string; lastDeliveredAt?: string | null }>;
    expect(savedState["steps_decline:2026-06-16:2026-06-22"]?.detectedAt).toBe(
      "2026-06-22T09:00:00.000Z",
    );
    expect(
      savedState["steps_decline:2026-06-16:2026-06-22"]?.lastDeliveredAt,
    ).toEqual(expect.any(String));
  });

  it("does not consume one-off alerts during measurement-entry sync", async () => {
    mockAuthFetch.mockResolvedValue({
      json: async () => ({
        items: [
          {
            body: "Your weight is up this week.",
            detail: "Weight increased by 2.5 kg over the last 7 days.",
            detectedAt: "2026-06-23T12:30:00.000Z",
            id: "weight_increase:2026-06-17:2026-06-23:102.5",
            key: "weight_increase",
            level: "level_2_check_in",
            portalEscalationEligible: false,
            repeatAtLocalTime: null,
            repeatUntil: null,
            screen: "/(fitness)/fitness-details",
            title: "Weight up this week",
          },
        ],
      }),
      ok: true,
      status: 200,
    });

    const result = await syncWorseningTrendNotifications({
      suppressImmediateAlerts: true,
    });

    expect(result).toBe(true);
    expect(mockAlert).not.toHaveBeenCalled();
    expect(mockPresentNotificationAsync).not.toHaveBeenCalled();
    expect(mockScheduleNotificationAsync).not.toHaveBeenCalled();
    expect(mockSetItemAsync).toHaveBeenCalledWith(
      "ckd_worsening_trend_alert_state",
      JSON.stringify({}),
    );
  });

  it("surfaces a one-off alert on the next foreground sync after a suppressed measurement-entry sync", async () => {
    mockAuthFetch.mockResolvedValue({
      json: async () => ({
        items: [
          {
            body: "Your weight is up this week.",
            detail: "Weight increased by 2.5 kg over the last 7 days.",
            detectedAt: "2026-06-23T12:30:00.000Z",
            id: "weight_increase:2026-06-17:2026-06-23:102.5",
            key: "weight_increase",
            level: "level_2_check_in",
            portalEscalationEligible: false,
            repeatAtLocalTime: null,
            repeatUntil: null,
            screen: "/(fitness)/fitness-details",
            title: "Weight up this week",
          },
        ],
      }),
      ok: true,
      status: 200,
    });

    await syncWorseningTrendNotifications({
      suppressImmediateAlerts: true,
    });
    jest.clearAllMocks();
    mockGetPermissionsAsync.mockResolvedValue({ status: "granted" });
    mockGetItemAsync.mockImplementation(async (key: string) => {
      if (key === "ckd_jwt") {
        return "jwt-token";
      }
      if (key === "ckd_worsening_trend_alert_state") {
        return JSON.stringify({});
      }
      return null;
    });
    mockAuthFetch.mockResolvedValue({
      json: async () => ({
        items: [
          {
            body: "Your weight is up this week.",
            detail: "Weight increased by 2.5 kg over the last 7 days.",
            detectedAt: "2026-06-23T12:30:00.000Z",
            id: "weight_increase:2026-06-17:2026-06-23:102.5",
            key: "weight_increase",
            level: "level_2_check_in",
            portalEscalationEligible: false,
            repeatAtLocalTime: null,
            repeatUntil: null,
            screen: "/(fitness)/fitness-details",
            title: "Weight up this week",
          },
        ],
      }),
      ok: true,
      status: 200,
    });

    const result = await syncWorseningTrendNotifications();

    expect(result).toBe(true);
    expect(mockPresentNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        channelId: "worsening-trend-alerts",
        data: expect.objectContaining({
          type: "worsening-trend-alert",
        }),
        title: "Weight up this week",
      }),
    );
    expect(mockAlert).toHaveBeenCalledWith(
      "Weight up this week",
      "Your weight is up this week.",
      expect.arrayContaining([
        expect.objectContaining({ text: "Later" }),
        expect.objectContaining({ text: "Review now" }),
      ]),
    );
    expect(mockSetItemAsync).toHaveBeenCalledWith(
      "ckd_worsening_trend_alert_state",
      expect.any(String),
    );
    const lastSetItemCall = mockSetItemAsync.mock.calls[
      mockSetItemAsync.mock.calls.length - 1
    ] as unknown as [string, string];
    const savedState = JSON.parse(
      lastSetItemCall[1],
    ) as Record<string, { detectedAt?: string; lastDeliveredAt?: string | null }>;
    expect(
      savedState["weight_increase:2026-06-17:2026-06-23:102.5"]?.detectedAt,
    ).toBe("2026-06-23T12:30:00.000Z");
    expect(
      savedState["weight_increase:2026-06-17:2026-06-23:102.5"]?.lastDeliveredAt,
    ).toEqual(expect.any(String));
  });

  it("clears reminders when no patient JWT is available", async () => {
    mockGetItemAsync.mockImplementation(async (_key: string) => null);
    mockGetAllScheduledNotificationsAsync.mockResolvedValue([
      {
        content: { data: { type: "worsening-trend-reminder" } },
        identifier: "reminder-id",
      },
    ]);

    const result = await syncWorseningTrendNotifications();

    expect(result).toBe(false);
    expect(mockCancelScheduledNotificationAsync).toHaveBeenCalledWith(
      "reminder-id",
    );
    expect(mockDeleteItemAsync).toHaveBeenCalledWith(
      "ckd_worsening_trend_alert_state",
    );
    expect(mockAuthFetch).not.toHaveBeenCalled();
  });
});
