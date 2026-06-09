const mockOpenSettings = jest.fn();
const mockGetNativeHealthKitStatus = jest.fn();
const mockReadStepSummaryForDate = jest.fn();
const mockEnableIosHealthKitBackgroundDelivery = jest.fn();
const mockRequestIosHealthKitAccess = jest.fn();

jest.mock("react-native", () => ({
  AppState: {
    addEventListener: jest.fn(() => ({
      remove: jest.fn(),
    })),
    currentState: "active",
  },
  Linking: {
    openSettings: mockOpenSettings,
  },
  Platform: {
    OS: "ios",
    select: (options: Record<string, unknown>) =>
      options.ios ?? options.default ?? options.android,
  },
}));

jest.mock("@/lib/healthKitNativeBridge", () => ({
  getNativeHealthKitStatus: mockGetNativeHealthKitStatus,
}));

jest.mock("@/lib/androidHealthConnectProvider", () => ({
  androidHealthConnectProvider: {
    providerName: "health_connect",
  },
}));

jest.mock("@/lib/iosHealthKitProvider", () => ({
  enableIosHealthKitBackgroundDelivery: mockEnableIosHealthKitBackgroundDelivery,
  iosHealthKitProvider: {
    providerName: "healthkit",
    readStepSummaryForDate: mockReadStepSummaryForDate,
  },
  requestIosHealthKitAccess: mockRequestIosHealthKitAccess,
}));

import { getCurrentHealthSyncProviderName } from "@/lib/currentHealthSyncProvider";
import {
  loadCurrentStepAccessState,
  openCurrentHealthAccessSettings,
  requestCurrentBackgroundStepAccess,
} from "@/lib/currentStepAccess";

describe("iOS step access", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("resolves the current health sync provider to healthkit on ios", () => {
    expect(getCurrentHealthSyncProviderName()).toBe("healthkit");
  });

  it("maps denied healthkit access to a permission-denied state", async () => {
    mockGetNativeHealthKitStatus.mockResolvedValue({
      available: true,
      backgroundDeliveryEnabled: false,
      readAuthorization: {
        blood_pressure_diastolic: "notDetermined",
        blood_pressure_systolic: "notDetermined",
        exercise: "notDetermined",
        heart_rate: "authorized",
        sleep: "notDetermined",
        steps: "denied",
      },
    });

    await expect(loadCurrentStepAccessState()).resolves.toEqual(
      expect.objectContaining({
        backgroundReadGranted: false,
        canRequestPermission: true,
        hasAnyMeasurementAccess: true,
        missingHealthPermissions: expect.arrayContaining([
          "blood_pressure_diastolic",
          "blood_pressure_systolic",
          "exercise",
          "sleep",
          "steps",
        ]),
        selectedDataOrigin: null,
        status: "permission-denied",
      }),
    );
    expect(mockReadStepSummaryForDate).not.toHaveBeenCalled();
  });

  it("loads authorized healthkit steps into a ready state", async () => {
    mockGetNativeHealthKitStatus.mockResolvedValue({
      available: true,
      backgroundDeliveryEnabled: true,
      readAuthorization: {
        blood_pressure_diastolic: "authorized",
        blood_pressure_systolic: "authorized",
        exercise: "authorized",
        heart_rate: "authorized",
        sleep: "authorized",
        steps: "authorized",
      },
    });
    mockReadStepSummaryForDate.mockResolvedValue({
      averageSpeedKph: 4.8,
      caloriesKcal: 230,
      distanceMeters: 3800,
      steps: 5421,
    });

    await expect(loadCurrentStepAccessState()).resolves.toEqual(
      expect.objectContaining({
        backgroundReadGranted: true,
        dataOrigins: ["apple.healthkit"],
        hasAnyMeasurementAccess: true,
        missingHealthPermissions: [],
        selectedDataOrigin: "apple.healthkit",
        status: "ready",
        stepsToday: 5421,
        summary: expect.objectContaining({
          averageSpeedKph: 4.8,
          caloriesKcal: 230,
          distanceMeters: 3800,
          steps: 5421,
        }),
      }),
    );
  });

  it("enables ios background delivery before reloading access state", async () => {
    mockEnableIosHealthKitBackgroundDelivery.mockResolvedValue(undefined);
    mockGetNativeHealthKitStatus.mockResolvedValue({
      available: true,
      backgroundDeliveryEnabled: true,
      readAuthorization: {
        blood_pressure_diastolic: "authorized",
        blood_pressure_systolic: "authorized",
        exercise: "authorized",
        heart_rate: "authorized",
        sleep: "authorized",
        steps: "authorized",
      },
    });
    mockReadStepSummaryForDate.mockResolvedValue({
      averageSpeedKph: null,
      caloriesKcal: null,
      distanceMeters: null,
      steps: 2000,
    });

    const state = await requestCurrentBackgroundStepAccess();

    expect(mockEnableIosHealthKitBackgroundDelivery).toHaveBeenCalledTimes(1);
    expect(state).toEqual(
      expect.objectContaining({
        backgroundReadGranted: true,
        status: "ready",
        stepsToday: 2000,
      }),
    );
  });

  it("opens the app settings for manual health access recovery", async () => {
    mockOpenSettings.mockResolvedValue(undefined);

    await openCurrentHealthAccessSettings();

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
