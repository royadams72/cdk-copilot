import type { ExpoConfig } from "expo/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "../..");

dotenv.config({ path: path.join(repoRoot, ".env.local") });
dotenv.config({ path: path.join(repoRoot, ".env") });

const googleServicesPath = path.join(
  projectRoot,
  "android",
  "app",
  "google-services.json",
);
const hasGoogleServices = fs.existsSync(googleServicesPath);

const rawEasProjectId = process.env.EXPO_EAS_PROJECT_ID ?? null;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const easProjectId =
  rawEasProjectId && uuidPattern.test(rawEasProjectId)
    ? rawEasProjectId
    : null;

const config: ExpoConfig = {
  android: {
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./src/assets/images/android-icon-foreground.png",
      backgroundImage: "./src/assets/images/android-icon-background.png",
      monochromeImage: "./src/assets/images/android-icon-monochrome.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    package: "com.ckdcopilot.ckdapp",
    permissions: [
      "ACTIVITY_RECOGNITION",
      "POST_NOTIFICATIONS",
      "android.permission.health.READ_BLOOD_PRESSURE",
      "android.permission.health.READ_EXERCISE",
      "android.permission.health.READ_HEART_RATE",
      "android.permission.health.READ_RESTING_HEART_RATE",
      "android.permission.health.READ_SLEEP",
      "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND",
      "android.permission.health.READ_DISTANCE",
      "android.permission.health.READ_SPEED",
      "android.permission.health.READ_STEPS",
      "android.permission.health.READ_TOTAL_CALORIES_BURNED",
    ],
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        category: ["BROWSABLE", "DEFAULT"],
        data: [{ host: "ckd.app", pathPrefix: "/ul", scheme: "https" }],
      },
    ],
    googleServicesFile: hasGoogleServices
      ? "./android/app/google-services.json"
      : undefined,
  },
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    eas: easProjectId ? { projectId: easProjectId } : undefined,
    router: { appDir: "app" },
  },
  icon: "./src/assets/images/icon.png",
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.ckdcopilot.ckdapp",
    associatedDomains: ["applinks:ckd.app"],
    infoPlist: {
      NSHealthShareUsageDescription:
        "CKD Copilot reads your health data to sync steps, heart rate, sleep, exercise, and blood pressure.",
      NSHealthUpdateUsageDescription:
        "CKD Copilot may write health data only if you choose to enable future Apple Health integrations.",
      NSMotionUsageDescription:
        "CKD Copilot uses motion data to count your daily steps.",
      UIBackgroundModes: ["processing"],
    },
  },
  name: "ckdapp",
  newArchEnabled: true,
  orientation: "portrait",
  plugins: [
    "expo-router",
    "expo-notifications",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
        },
        image: "./src/assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
      },
    ],
  ],
  scheme: ["ckdapp", "mobile"],
  slug: "mobile",
  userInterfaceStyle: "light",
  version: "1.0.0",
  web: {
    output: "static",
    favicon: "./src/assets/images/favicon.png",
  },
};

export default config;
