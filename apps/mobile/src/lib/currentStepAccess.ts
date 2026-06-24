import { AppState, type AppStateStatus, Linking, Platform } from "react-native";

import {
  ANDROID_HEALTH_BACKGROUND_READ_PERMISSION,
  ANDROID_HEALTH_PERMISSIONS,
  ANDROID_STEP_PERMISSION,
} from "@/lib/healthConnectPermissions";
import {
  loadAndroidStepState,
  type AndroidStepState,
} from "@/lib/healthConnectStepSummary";
import {
  enableIosHealthKitBackgroundDelivery,
  iosHealthKitProvider,
  requestIosHealthKitAccess,
} from "@/lib/iosHealthKitProvider";
import { getNativeHealthKitStatus } from "@/lib/healthKitNativeBridge";

export type CurrentStepAccessState = AndroidStepState;

type StepAccessWatcher = {
  stop: () => void;
};

function permissionKey(permission: { accessType: string; recordType: string }) {
  return `${permission.accessType}:${permission.recordType}`;
}

function unsupportedState(): CurrentStepAccessState {
  return {
    backgroundReadGranted: false,
    canRequestPermission: false,
    dataOrigins: [],
    debug: null,
    hasAnyMeasurementAccess: false,
    missingHealthPermissions: [],
    selectedDataOrigin: null,
    status: "unsupported",
    stepsToday: null,
    summary: null,
  };
}

async function loadIosPedometerStepState(): Promise<CurrentStepAccessState> {
  const status = await getNativeHealthKitStatus();
  if (!status?.available) {
    return unsupportedState();
  }

  const now = new Date();
  let summary = null;

  try {
    summary = await iosHealthKitProvider.readStepSummaryForDate(now);
  } catch {
    summary = null;
  }

  if (!summary) {
    return {
      ...unsupportedState(),
      backgroundReadGranted: status.backgroundDeliveryEnabled,
      canRequestPermission: true,
      dataOrigins: ["apple.healthkit"],
      hasAnyMeasurementAccess: false,
      missingHealthPermissions: [],
      selectedDataOrigin: "apple.healthkit",
      status: "permission-required",
    };
  }

  const stepsToday =
    typeof summary?.steps === "number" && Number.isFinite(summary.steps)
      ? Math.max(0, Math.round(summary.steps))
      : 0;

  return {
    backgroundReadGranted: status.backgroundDeliveryEnabled,
    canRequestPermission: true,
    dataOrigins: ["apple.healthkit"],
    debug: null,
    hasAnyMeasurementAccess: true,
    missingHealthPermissions: [],
    selectedDataOrigin: "apple.healthkit",
    status: "ready",
    stepsToday,
    summary: summary ?? {
      averageSpeedKph: null,
      caloriesKcal: null,
      distanceMeters: null,
      steps: stepsToday,
    },
  };
}

export async function loadCurrentStepAccessState(
  options: { forceRefresh?: boolean } = {},
): Promise<CurrentStepAccessState> {
  if (Platform.OS === "web") {
    return unsupportedState();
  }

  if (Platform.OS === "android") {
    return loadAndroidStepState(options);
  }

  return loadIosPedometerStepState();
}

export async function requestCurrentStepAccess() {
  if (Platform.OS === "android") {
    const healthConnect = await import("react-native-health-connect");
    console.log("Health Connect permissions requested", {
      requested: ANDROID_HEALTH_PERMISSIONS.map(permissionKey),
    });
    const grantedPermissions = await healthConnect.requestPermission([
      ...ANDROID_HEALTH_PERMISSIONS,
    ]);
    console.log("Health Connect permission request result", {
      granted: grantedPermissions.map(permissionKey),
    });
    const hasStepAccess = grantedPermissions.some(
      (permission) =>
        permission.accessType === ANDROID_STEP_PERMISSION.accessType &&
        permission.recordType === ANDROID_STEP_PERMISSION.recordType,
    );

    if (!hasStepAccess) {
      return {
        ...(await loadAndroidStepState({ forceRefresh: true })),
        status: "permission-denied" as const,
      };
    }

    return loadAndroidStepState({ forceRefresh: true });
  }

  if (Platform.OS === "ios") {
    await requestIosHealthKitAccess();
    return loadIosPedometerStepState();
  }

  return unsupportedState();
}

export async function requestCurrentBackgroundStepAccess() {
  if (Platform.OS === "ios") {
    await enableIosHealthKitBackgroundDelivery();
    return loadIosPedometerStepState();
  }

  if (Platform.OS !== "android") {
    return null;
  }

  const healthConnect = await import("react-native-health-connect");
  await healthConnect.requestPermission([
    ANDROID_HEALTH_BACKGROUND_READ_PERMISSION,
  ]);

  return loadAndroidStepState({ forceRefresh: true });
}

export async function openCurrentHealthAccessSettings() {
  if (Platform.OS === "ios") {
    const healthAppUrl = "x-apple-health://";

    try {
      const canOpenHealthApp = await Linking.canOpenURL(healthAppUrl);
      if (canOpenHealthApp) {
        await Linking.openURL(healthAppUrl);
        return;
      }
    } catch {
      // Fall through to app settings.
    }
  }

  await Linking.openSettings();
}

export async function openCurrentAppSettings() {
  await Linking.openSettings();
}

export async function watchCurrentStepAccess(
  onUpdate: () => void,
): Promise<StepAccessWatcher | null> {
  if (Platform.OS !== "ios") {
    return null;
  }

  let lastState: AppStateStatus = AppState.currentState;
  const subscription = AppState.addEventListener("change", (nextState) => {
    const previousState = lastState;
    lastState = nextState;
    if (nextState === "active" && previousState !== "active") {
      onUpdate();
    }
  });

  return {
    stop: () => subscription.remove(),
  };
}
