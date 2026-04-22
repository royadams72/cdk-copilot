import type { KnownFitnessApp } from "@/lib/fitnessApps";
import { formatFitnessAppName } from "@/lib/fitnessApps";
import type { MeasurementKind, MeasurementLatest } from "@/store/services/types";

type GuidedMetric = "sleep" | "heart_rate" | "exercise";

export type FitnessSetupGuidance = {
  body: string;
  missingKinds: GuidedMetric[];
  title: string;
};

const GUIDED_KINDS: GuidedMetric[] = ["sleep", "heart_rate", "exercise"];

function metricLabel(kind: GuidedMetric) {
  switch (kind) {
    case "heart_rate":
      return "heart rate";
    case "exercise":
      return "exercise";
    default:
      return "sleep";
  }
}

function joinMetricLabels(kinds: GuidedMetric[]) {
  const labels = kinds.map(metricLabel);
  if (labels.length <= 1) return labels[0] ?? "health data";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function measurementOriginPackageNames(items: MeasurementLatest[]) {
  return items
    .map((item) => item.provider?.packageName?.trim())
    .filter((value): value is string => Boolean(value));
}

function originLabel(packageName: string) {
  if (packageName === "android.healthconnect") {
    return "Health Connect";
  }
  return formatFitnessAppName(packageName);
}

function connectedAppName(
  items: MeasurementLatest[],
  stepDataOrigins: string[],
  installedApps: KnownFitnessApp[],
) {
  const installedByPackage = new Map(
    installedApps.map((app) => [app.packageName, app.displayName]),
  );

  for (const packageName of [
    ...measurementOriginPackageNames(items),
    ...stepDataOrigins,
  ]) {
    if (packageName === "android" || packageName === "android.healthconnect") {
      continue;
    }
    return installedByPackage.get(packageName) ?? originLabel(packageName);
  }

  return null;
}

function missingKinds(items: MeasurementLatest[]) {
  const availableKinds = new Set<MeasurementKind>(items.map((item) => item.kind));
  return GUIDED_KINDS.filter((kind) => !availableKinds.has(kind));
}

export function buildFitnessSetupGuidance(args: {
  hasMissingHealthPermissions: boolean;
  installedApps: KnownFitnessApp[];
  items: MeasurementLatest[];
  stepDataOrigins: string[];
  stepStatus: string;
}) {
  const missing = missingKinds(args.items);
  if (!missing.length || args.stepStatus === "health-connect-unavailable") {
    return null;
  }

  const missingSummary = joinMetricLabels(missing);
  const connectedApp = connectedAppName(
    args.items,
    args.stepDataOrigins,
    args.installedApps,
  );

  if (connectedApp) {
    return {
      body: `Steps are already syncing from ${connectedApp}. If ${missingSummary} are still missing, open ${connectedApp}, allow watch and health permissions there, and make sure it is sharing those records to Health Connect.`,
      missingKinds: missing,
      title: `${connectedApp} is connected`,
    } satisfies FitnessSetupGuidance;
  }

  if (args.installedApps.length) {
    const app = args.installedApps[0];
    return {
      body: `We found ${app.displayName} on this phone, but no ${missingSummary} readings have reached Health Connect yet. Open ${app.displayName}, allow device and health permissions, then enable Health Connect sharing.`,
      missingKinds: missing,
      title: `Finish setup in ${app.displayName}`,
    } satisfies FitnessSetupGuidance;
  }

  if (args.hasMissingHealthPermissions) {
    return {
      body: `Allow the remaining Health Connect permissions for ${missingSummary}. If you use a watch, also make sure its companion health app is installed and allowed to sync into Health Connect.`,
      missingKinds: missing,
      title: "Allow more Health Connect access",
    } satisfies FitnessSetupGuidance;
  }

  return {
    body: `No ${missingSummary} readings have been shared yet. If you use a watch, install its companion health app, allow watch permissions there, and turn on sync to Health Connect.`,
    missingKinds: missing,
    title: "Finish watch or fitness app setup",
  } satisfies FitnessSetupGuidance;
}
