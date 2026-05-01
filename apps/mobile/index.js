import { AppRegistry } from "react-native";

import {
  HEALTH_CONNECT_BACKGROUND_SYNC_TASK_KEY,
  runNativeHealthConnectBackgroundSyncTask,
} from "./src/lib/healthConnectNativeSync";

AppRegistry.registerHeadlessTask(
  HEALTH_CONNECT_BACKGROUND_SYNC_TASK_KEY,
  () => runNativeHealthConnectBackgroundSyncTask,
);

import "expo-router/entry";
