import { NativeModules, Platform } from "react-native";

export type KnownFitnessApp = {
  displayName: string;
  packageName: string;
};

const KNOWN_FITNESS_APPS: KnownFitnessApp[] = [
  { displayName: "Samsung Health", packageName: "com.sec.android.app.shealth" },
  { displayName: "Google Fit", packageName: "com.google.android.apps.fitness" },
  { displayName: "Fitbit", packageName: "com.fitbit.FitbitMobile" },
  {
    displayName: "Garmin Connect",
    packageName: "com.garmin.android.apps.connectmobile",
  },
  { displayName: "Withings", packageName: "com.withings.wiscale2" },
  { displayName: "Polar Flow", packageName: "fi.polar.polarflow" },
  { displayName: "Huawei Health", packageName: "com.huawei.health" },
  { displayName: "OnePlus Health", packageName: "com.oneplus.health" },
  { displayName: "Suunto", packageName: "com.stt.android.suunto" },
] as const;

type FitnessAppDetectorModule = {
  getInstalledFitnessApps(packageNames: string[]): Promise<string[]>;
};

const fitnessAppDetector = NativeModules.FitnessAppDetector as
  | FitnessAppDetectorModule
  | undefined;

export function getKnownFitnessApp(packageName: string) {
  return KNOWN_FITNESS_APPS.find((app) => app.packageName === packageName);
}

export function formatFitnessAppName(packageName: string) {
  return (
    getKnownFitnessApp(packageName)?.displayName ??
    packageName.split(".").filter(Boolean).at(-1) ??
    packageName
  );
}

export async function detectInstalledFitnessApps() {
  if (Platform.OS !== "android" || !fitnessAppDetector) {
    return [] as KnownFitnessApp[];
  }

  try {
    const installedPackages = await fitnessAppDetector.getInstalledFitnessApps(
      KNOWN_FITNESS_APPS.map((app) => app.packageName),
    );
    const installedPackageSet = new Set(installedPackages);
    return KNOWN_FITNESS_APPS.filter((app) =>
      installedPackageSet.has(app.packageName),
    );
  } catch (error) {
    console.log("Fitness app detection failed", { error });
    return [] as KnownFitnessApp[];
  }
}
