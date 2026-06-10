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

  const stepAuthorization = status.readAuthorization.steps;
  const hasStepAccess = stepAuthorization === "authorized";
  if (!hasStepAccess) {
    return {
      ...unsupportedState(),
      canRequestPermission: true,
      hasAnyMeasurementAccess: Object.values(status.readAuthorization).some(
        (value) => value === "authorized",
      ),
      missingHealthPermissions: Object.entries(status.readAuthorization)
        .filter(([, value]) => value !== "authorized")
        .map(([key]) => key),
      status:
        stepAuthorization === "denied"
          ? "permission-denied"
          : "permission-required",
    };
  }

  const now = new Date();
  const summary = await iosHealthKitProvider.readStepSummaryForDate(now);
  const stepsToday =
    typeof summary?.steps === "number" && Number.isFinite(summary.steps)
      ? Math.max(0, Math.round(summary.steps))
      : 0;
  const missingPermissions = Object.entries(status.readAuthorization)
    .filter(([key, value]) => key !== "steps" && value !== "authorized")
    .map(([key]) => key);

  return {
    backgroundReadGranted: status.backgroundDeliveryEnabled,
    canRequestPermission: true,
    dataOrigins: ["apple.healthkit"],
    debug: null,
    hasAnyMeasurementAccess: true,
    missingHealthPermissions: missingPermissions,
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
