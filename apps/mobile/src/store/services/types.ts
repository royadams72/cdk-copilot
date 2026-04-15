import {
  DashboardData,
  FoodHighlight,
  NutrientKey,
  NutritionDailyPoint,
  NutritionMetricKey,
  NutritionTrendChunk,
} from "@/screens/dashboard/types";
import { TWeeklyNutritionInsight } from "@ckd/core";

export type DashboardScope = "today" | "all";
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

export type MeasurementKind = "steps" | "exercise" | "sleep" | "blood_pressure";

export type MeasurementLatest = {
  count?: number;
  diastolicMmHg?: number;
  durationMin?: number;
  exercise?: {
    caloriesKcal?: number;
    durationMin?: number;
    name?: string;
  };
  kind: MeasurementKind;
  measuredAt?: string;
  systolicMmHg?: number;
};

export type CreateMeasurementArgs =
  | {
      count: number;
      kind: "steps";
      measuredAt?: string;
    }
  | {
      durationMin: number;
      exerciseId: string;
      kind: "exercise";
      measuredAt?: string;
    }
  | {
      durationMin: number;
      kind: "sleep";
      measuredAt?: string;
      sleepFromAt: string;
      sleepToAt: string;
    }
  | {
      diastolicMmHg: number;
      kind: "blood_pressure";
      measuredAt?: string;
      systolicMmHg: number;
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
export type RunWeeklyNutritionInsightArgs = {
  referenceDate?: string;
};

export type UpdateTargetArgs = {
  clearOverride?: boolean;
  metric: string;
  override?: TargetDefinitionValue;
  reason?: string;
};
