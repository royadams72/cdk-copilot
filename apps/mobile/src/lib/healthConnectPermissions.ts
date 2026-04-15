export const ANDROID_STEP_PERMISSION = {
  accessType: "read",
  recordType: "Steps",
} as const;

export const ANDROID_HEALTH_RECORD_PERMISSIONS = [
  { accessType: "read", recordType: "BloodPressure" },
  { accessType: "read", recordType: "ExerciseSession" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "SleepSession" },
] as const;

export const ANDROID_HEALTH_PERMISSIONS = [
  ...ANDROID_HEALTH_RECORD_PERMISSIONS,
  ANDROID_STEP_PERMISSION,
] as const;
