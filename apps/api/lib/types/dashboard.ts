import { TNutritionEntry } from "@/packages/core/dist/isomorphic";
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

export type NutritionEntryDoc = Omit<TNutritionEntry, "patientId"> & {
  patientId: ObjectId;
};

export type ChartMetric = (typeof RADIAL_METRICS)[number];
export type ChartMetricKey = ChartMetric["key"];
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
  date: string | null;
  items: Record<ChartMetricKey, FoodHighlight[]>;
};

export type NutrientKey =
  | "caloriesKcal"
  | "proteinG"
  | "phosphorusMg"
  | "potassiumMg"
  | "sodiumMg";
