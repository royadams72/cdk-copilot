import {
  TFoodItemEntry,
  TMealType,
  TNutritionEntry,
} from "@/packages/core/dist/isomorphic";
import { ObjectId } from "mongodb";
import { RADIAL_METRICS } from "../../app/api/dashboard/route";

export type LabDoc = {
  _id: ObjectId;
  abnormalFlag?: string;
  code?: string;
  createdAt?: Date;
  derivedAbnormalFlag?: string | null;
  effectiveAbnormalFlag?: string | null;
  ledgerId?: ObjectId;
  name?: string;
  refRange?: {
    high?: number | null;
    low?: number | null;
    text?: string | null;
  } | null;
  reportedAt?: Date;
  sourceAbnormalFlag?: string | null;
  takenAt?: Date;
  unit?: string;
  updatedAt?: Date;
  value?: number | string;
};

export type MedicationCurrentDoc = {
  _id: ObjectId;
  createdAt?: Date;
  dose?: string;
  editHistory?: Array<{
    type: "edited" | "status_change";
    at: Date;
    by: string;
    changes?: string[];
    reason?: string;
    toStatus?: "active" | "paused" | "stopped" | "completed";
  }>;
  form?: string;
  frequency?: string;
  medicationId?: ObjectId;
  name?: string;
  patientId: ObjectId;
  route?: string;
  startAt?: Date;
  status?: "active" | "paused" | "stopped" | "completed";
  updatedAt?: Date;
};

export type NutritionEntryDoc = Omit<
  TNutritionEntry,
  "patientId" | "eatenAt"
> & {
  _id: ObjectId;
  eatenAt?: Date | null;
  patientId: ObjectId;
};

export type ChartMetric = (typeof RADIAL_METRICS)[number];
export type ChartMetricKey = ChartMetric["key"];
export type FoodHighlightMetricKey =
  | ChartMetricKey
  | "phosphorus_protein_ratio";
export type NutritionDailyPoint = {
  date: string;
  label: string;
  totals: Record<NutrientKey, number>;
};

export type FoodHighlight = {
  amount: number;
  eatenAt: string | null;
  mealType: string | null;
  name: string;
  unit: string;
};

export type FoodHighlightResult = {
  itemsByDate: Record<string, Record<FoodHighlightMetricKey, FoodHighlight[]>>;
  latestDate: string | null;
};

export type NutritionMealEntry = {
  id: string;
  eatenAt: string | null;
  items: TFoodItemEntry[];
  mealType: TMealType;
};

export type NutrientKey =
  | "caloriesKcal"
  | "proteinG"
  | "phosphorusMg"
  | "potassiumMg"
  | "sodiumMg"
  | "steps_per_day"
  | "sleep_duration_min_day"
  | "weight_kg";
