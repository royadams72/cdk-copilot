import {
  DashboardData,
  FoodHighlight,
  NutrientKey,
  NutritionDailyPoint,
  NutritionMetricKey,
  NutritionTrendChunk,
} from "@/screens/dashboard/types";
import {
  TCarePlanActivityType,
  TCarePlanStatus,
  TCarePlanTaskFreq,
  TCarePlanTaskStatus,
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
  canDelete: boolean;
  canEdit: boolean;
  caloriesKcal?: number | null;
  distanceMeters?: number | null;
  entryId: string;
  exerciseId?: string;
  exerciseName?: string;
  exerciseTitle?: string;
  measuredAt: string;
  sleepFromAt?: string;
  sleepToAt?: string;
  source?: MeasurementSource;
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

export type UpdateMeasurementArgs =
  | {
      bpm: number;
      kind: "heart_rate";
      measuredAt: string;
      measurementId: string;
    }
  | {
      diastolicMmHg: number;
      kind: "blood_pressure";
      measuredAt: string;
      measurementId: string;
      systolicMmHg: number;
    }
  | {
      durationMin: number;
      exerciseId: string;
      kind: "exercise";
      measuredAt: string;
      measurementId: string;
    }
  | {
      kind: "sleep";
      measurementId: string;
      sleepFromAt: string;
      sleepToAt: string;
    }
  | {
      kind: "weight";
      measuredAt: string;
      measurementId: string;
      valueKg: number;
    };

export type TargetDomain = "renal" | "lifestyle";
export type TargetDefinitionValue = {
  type: "range" | "max" | "min" | "exact";
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  value?: number | null;
};

export type TargetItem = {
  careTeamTarget?: TargetDefinitionValue | null;
  careTeamTargetMeta?: {
    reason?: string | null;
    setAt: string;
    setBy: {
      actorType: "user" | "clinician" | "system";
      displayName?: string | null;
      principalId: string;
    };
  } | null;
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
  personalGoal?: TargetDefinitionValue | null;
  personalGoalMeta?: {
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
export type MonthlyNutritionFilter =
  | "caloriesKcal"
  | "phosphorusMg"
  | "potassiumMg"
  | "proteinG"
  | "sodiumMg";
export type MonthlyNutritionFoodRow = {
  averageAmount: number;
  currentMonthAmount: number;
  food: string;
  levelLabel: string;
  timesLogged: number;
  trend: "increased" | "same" | "reduced";
};
export type MonthlyNutritionStat = {
  isSelected: boolean;
  label: string;
  month: string;
  target: number | null;
  value: number;
};
export type MonthlyNutritionSummaryResponse = {
  foodRows: MonthlyNutritionFoodRow[];
  monthlyStats: MonthlyNutritionStat[];
  selectedFilter: MonthlyNutritionFilter;
  selectedMonth: string;
  selectedMonthLabel: string;
  summaryTitle: string;
  tableTitle: string;
  window: {
    from: string;
    months: number;
    to: string;
  };
};
export type CarePlanStatus = TCarePlanStatus;
export type CarePlanTaskFrequency = TCarePlanTaskFreq;
export type CarePlanTaskStatus = TCarePlanTaskStatus;
export type CarePlanActivityTypeValue = TCarePlanActivityType | "patient_reviewed";
export type CarePlanListItem = {
  activatedAt: string | null;
  id: string;
  reviewDue: boolean;
  reviewLabel: string | null;
  reviewLabelDisplay: string | null;
  status: CarePlanStatus;
  taskCount: number;
  title: string;
  updatedAt: string;
};
export type CarePlanListResponse = {
  items: CarePlanListItem[];
  latestActivePlan: CarePlanListItem | null;
  latestUpdatedPlan: CarePlanListItem | null;
  latestUpdatedAt: string | null;
};
export type CarePlanDetailGoal = {
  id: string;
  label: string;
  targetSummary: string | null;
};
export type CarePlanDetailTask = {
  freq: CarePlanTaskFrequency;
  id: string;
  instructions: string | null;
  label: string;
  status: CarePlanTaskStatus;
};
export type CarePlanActivityEvent = {
  at: string;
  by: string;
  id: string;
  note: string | null;
  type: CarePlanActivityTypeValue;
};
export type CarePlanDetailResponse = {
  plan: {
    activatedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    createdBy: string;
    diagnoses: Array<{
      code: string | null;
      codeSystem?: "SNOMED_CT" | "CUSTOM" | null;
      id: string;
      label: string;
    }>;
    goals: CarePlanDetailGoal[];
    id: string;
    nextReviewAt: string | null;
    notes: string | null;
    ownerLabels: string[];
    reviewDue: boolean;
    reviewLabel: string | null;
    reviewLabelDisplay: string | null;
    reviewedAt: string | null;
    status: CarePlanStatus;
    tasks: CarePlanDetailTask[];
    title: string;
    updatedAt: string;
    updatedBy: string;
  };
  activity: CarePlanActivityEvent[];
};
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
  dateOfBirth?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  nhsNumber?: string | null;
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
