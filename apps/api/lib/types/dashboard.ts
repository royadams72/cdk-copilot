import { TFoodItemEntry, TMealType, TNutritionEntry } from "@/packages/core/dist/isomorphic";
import { ObjectId } from "mongodb";
import { RADIAL_METRICS } from "../../app/api/dashboard/route";

export type LabDoc = {
  _id: ObjectId;
  code?: string;
  name?: string;
  value?: number | string;
  unit?: string;
  takenAt?: Date;
  createdAt?: Date;
  abnormalFlag?: string;
};

export type MedicationLedgerDoc = {
  _id: ObjectId;
  patientId: ObjectId;
  name?: string;
  dose?: string;
  frequency?: string;
  route?: string;
  form?: string;
  startAt?: Date;
  status?: "active" | "paused" | "stopped" | "completed";
  createdAt?: Date;
  updatedAt?: Date;
};

export type NutritionEntryDoc = Omit<TNutritionEntry, "patientId"> & {
  _id: ObjectId;
  patientId: ObjectId;
};

export type ChartMetric = (typeof RADIAL_METRICS)[number];
export type ChartMetricKey = ChartMetric["key"];
export type FoodHighlightMetricKey = ChartMetricKey | "phosphorus_protein_ratio";
export type NutritionDailyPoint = {
  date: string;
  label: string;
  totals: Record<NutrientKey, number>;
};

export type FoodHighlight = {
  name: string;
  amount: number;
  unit: string;
  mealType: string | null;
  eatenAt: string | null;
};

export type FoodHighlightResult = {
  latestDate: string | null;
  itemsByDate: Record<string, Record<FoodHighlightMetricKey, FoodHighlight[]>>;
};

export type NutritionMealEntry = {
  id: string;
  mealType: TMealType;
  eatenAt: string | null;
  items: TFoodItemEntry[];
};

export type NutrientKey =
  | "caloriesKcal"
  | "proteinG"
  | "phosphorusMg"
  | "potassiumMg"
  | "sodiumMg";
