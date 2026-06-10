import {
  DashboardData,
  FoodHighlight,
  NutrientKey,
  NutritionDailyPoint,
  NutritionMetricKey,
  NutritionTrendChunk,
} from "@/screens/dashboard/types";
import {
  TSymptomCreateRequest,
  TSymptomLedgerEvent,
  TSymptomListResponse,
  TSymptomsCurrent,
  TSymptomUpdateRequest,
  TWeeklyNutritionInsight,
} from "@ckd/core";

export type DashboardScope = "today" | "all";
export type UserUnits = "metric" | "imperial";
export type DashboardQueryData = Omit<DashboardData, "patientId">;
export type NutritionTrendChunkArgs = {
  before?: string;
  days?: number;
  reset?: boolean;
};

export type NutritionTrendData = {
  dailySeries: NutritionDailyPoint[];
  foodHighlightsByDate: Record<
    string,
    Record<NutritionMetricKey, FoodHighlight[]>
  >;
  hasMore: boolean;
  mealsByDate: NutritionTrendChunk["nutrition"]["mealsByDate"];
  nextBefore: string | null;
  targets: Partial<Record<NutrientKey, number>>;
};

export type MeasurementKind =
  | "steps"
  | "exercise"
  | "sleep"
  | "weight"
  | "blood_pressure"
  | "heart_rate";
export type MeasurementSource = "patient" | "device" | "api" | "provider";
export type MeasurementProvider = {
  displayName?: string;
  packageName: string;
};
export type MeasurementSyncStatus = "provisional" | "finalized";
export type MeasurementSyncProvider = "health_connect" | "healthkit";
export type MeasurementSyncMeta = {
  dayKey?: string;
  finalizedAt?: string;
  lastReconciledAt?: string;
  provider: MeasurementSyncProvider;
  status: MeasurementSyncStatus;
};
export type MeasurementDevice = {
  externalId?: string;
  name?: string;
  platform?: string;
};

export type MeasurementProvenanceArgs = {
  device?: MeasurementDevice;
  externalRecordId?: string;
  provider?: MeasurementProvider;
  source?: MeasurementSource;
  sync?: MeasurementSyncMeta;
};

export type MeasurementLatest = {
  averageSpeedKph?: number;
  caloriesKcal?: number;
  count?: number;
  diastolicMmHg?: number;
  device?: MeasurementDevice;
  distanceMeters?: number;
  durationMin?: number;
  exercise?: {
    caloriesKcal?: number;
    durationMin?: number;
    name?: string;
    title?: string;
  };
  externalRecordId?: string;
  bpm?: number;
  kind: MeasurementKind;
  measuredAt?: string;
  provider?: MeasurementProvider;
  source?: MeasurementSource;
  sync?: MeasurementSyncMeta;
  systolicMmHg?: number;
  valueKg?: number;
};

export type MeasurementTrendPoint = {
  date: string;
  measuredAt: string;
  value: number | null;
  value2: number | null;
};

export type MeasurementDayEntry = {
  averageSpeedKph?: number | null;
  caloriesKcal?: number | null;
  distanceMeters?: number | null;
  exerciseId?: string;
  exerciseName?: string;
  exerciseTitle?: string;
  measuredAt: string;
  sleepFromAt?: string;
  sleepToAt?: string;
  sync?: MeasurementSyncMeta;
  value: number | null;
  value2: number | null;
};

export type MeasurementHistoryResponse = {
  entriesByDate: Record<string, MeasurementDayEntry[]>;
  points: MeasurementTrendPoint[];
};

export type ExerciseRefItem = {
  category: string;
  exerciseId: string;
  intensity: "light" | "moderate" | "vigorous";
  met: number;
  name: string;
};

export type ExerciseRefCategory = {
  category: string;
  items: ExerciseRefItem[];
};

export type ExerciseReferenceResponse = {
  categories: ExerciseRefCategory[];
};

export type CreateMeasurementArgs =
  | ({
      averageSpeedKph?: number;
      caloriesKcal?: number;
      count: number;
      distanceMeters?: number;
      kind: "steps";
      measuredAt?: string;
    } & MeasurementProvenanceArgs)
  | ({
      durationMin: number;
      exerciseId: string;
      caloriesKcal?: number;
      category?: string;
      exerciseTitle?: string;
      intensity?: "light" | "moderate" | "vigorous";
      kind: "exercise";
      met?: number;
      measuredAt?: string;
    } & MeasurementProvenanceArgs)
  | ({
      durationMin: number;
      kind: "sleep";
      measuredAt?: string;
      sleepFromAt: string;
      sleepToAt: string;
    } & MeasurementProvenanceArgs)
  | ({
      kind: "weight";
      measuredAt?: string;
      valueKg: number;
    } & MeasurementProvenanceArgs)
  | ({
      diastolicMmHg: number;
      kind: "blood_pressure";
      measuredAt?: string;
      systolicMmHg: number;
    } & MeasurementProvenanceArgs)
  | ({
      bpm: number;
      kind: "heart_rate";
      measuredAt?: string;
    } & MeasurementProvenanceArgs);

export type TargetDomain = "renal" | "lifestyle";
export type TargetDefinitionValue = {
  type: "range" | "max" | "min" | "exact";
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  value?: number | null;
};

export type TargetItem = {
  derivedFrom?: {
    matchedAt?: string;
    ruleId: string;
    version: number;
  } | null;
  domain: TargetDomain;
  effective: TargetDefinitionValue;
  key: string;
  metric: string;
  override?: TargetDefinitionValue | null;
  overrideMeta?: {
    reason?: string | null;
    setAt: string;
    setBy: {
      actorType: "user" | "clinician" | "system";
      displayName?: string | null;
      principalId: string;
    };
  } | null;
  recommended: TargetDefinitionValue;
  unit: string;
};

export type TargetsResponse = {
  items: TargetItem[];
  updatedAt: string | null;
  weightKg?: number | null;
};

export type WeeklyNutritionInsightResponse = TWeeklyNutritionInsight | null;
export type WeeklySleepSummary = {
  advice: string[];
  averageLoggedDurationMin: number | null;
  hasEnoughSleep: boolean;
  humanMessage: string;
  loggedDays: number;
  manualLoggingOnly: boolean;
  nightsBelowTarget: number;
  splitNights: number;
  targetDurationMin: number;
  weekEnd: string;
  weekStart: string;
  weeklyAverageDurationMin: number;
};
export type WeeklySleepSummaryResponse = WeeklySleepSummary | null;
export type SymptomCurrent = TSymptomsCurrent;
export type SymptomHistoryEvent = TSymptomLedgerEvent;
export type SymptomListResponse = TSymptomListResponse;
export type CreateSymptomArgs = TSymptomCreateRequest;
export type UpdateSymptomArgs = TSymptomUpdateRequest;
export type CurrentUserSettingsResponse = {
  units: UserUnits;
};
export type RunWeeklyNutritionInsightArgs = {
  referenceDate?: string;
};

export type UpdateTargetArgs = {
  clearOverride?: boolean;
  metric: string;
  override?: TargetDefinitionValue;
  reason?: string;
};
