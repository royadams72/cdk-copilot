import type { ObjectId } from "mongodb";

import type {
  PortalNutritionFilter,
  PortalPatientNutritionData,
  PortalPatientNutritionFoodRow,
} from "@/apps/api/lib/portal/patient-shared";

export const NUTRITION_MONTHLY_PATIENT_SUMMARY_COLLECTION =
  "nutrition_monthly_patient_summary";

export type NutritionMonthlyTopFood = {
  averageAmount?: number | null;
  food: string;
  levelLabel?: string | null;
  previousMonthAmount?: number | null;
  timesLogged: number;
  totalAmount?: number | null;
  trend?: PortalPatientNutritionFoodRow["trend"] | null;
};

export type NutritionMonthlyPatientSummaryDoc = {
  _id?: ObjectId;
  daysLogged?: number;
  generatedAt?: Date;
  month: string;
  patientId: ObjectId | string;
  sourceVersion?: number;
  targetSnapshot?: Partial<Record<PortalNutritionFilter, number>>;
  topFoods?: Partial<Record<PortalNutritionFilter, NutritionMonthlyTopFood[]>>;
  totals?: Partial<Record<PortalNutritionFilter, number>>;
  dailyAverages?: Partial<Record<PortalNutritionFilter, number>>;
  updatedAt?: Date;
};

export function resolveNutritionMetricLabel(filter: PortalNutritionFilter) {
  const labels: Record<PortalNutritionFilter, string> = {
    caloriesKcal: "Calories",
    phosphorusMg: "Phosphorus",
    potassiumMg: "Potassium",
    proteinG: "Protein",
    sodiumMg: "Sodium",
  };
  return labels[filter];
}

export function getNutritionLevelLabel(
  filter: PortalNutritionFilter,
  averageAmount: number,
) {
  const bands: Record<PortalNutritionFilter, [number, number, number]> = {
    caloriesKcal: [700, 500, 250],
    phosphorusMg: [250, 160, 80],
    potassiumMg: [700, 450, 200],
    proteinG: [30, 18, 8],
    sodiumMg: [450, 250, 100],
  };
  const [high, mediumHigh, medium] = bands[filter];
  if (averageAmount >= high) return "High";
  if (averageAmount >= mediumHigh) return "Medium-high";
  if (averageAmount >= medium) return "Medium";
  return "Low";
}

export function getNutritionTrend(
  currentMonthAmount: number,
  previousMonthAmount: number,
): PortalPatientNutritionFoodRow["trend"] {
  if (previousMonthAmount === 0) {
    return currentMonthAmount > 0 ? "increased" : "same";
  }
  if (currentMonthAmount >= previousMonthAmount * 1.1) {
    return "increased";
  }
  if (currentMonthAmount <= previousMonthAmount * 0.9) {
    return "reduced";
  }
  return "same";
}

export function mapSummaryTopFoodsToPortalRows(
  foods: NutritionMonthlyTopFood[] | undefined,
  filter: PortalNutritionFilter,
): PortalPatientNutritionData["foodRows"] {
  return (foods ?? []).map((food) => {
    const currentMonthAmount = food.totalAmount ?? 0;
    const averageAmount =
      typeof food.averageAmount === "number"
        ? food.averageAmount
        : food.timesLogged > 0
          ? currentMonthAmount / food.timesLogged
          : 0;
    const previousMonthAmount = food.previousMonthAmount ?? 0;

    return {
      averageAmount,
      currentMonthAmount,
      food: food.food,
      levelLabel:
        food.levelLabel?.trim() ||
        getNutritionLevelLabel(filter, averageAmount),
      timesLogged: food.timesLogged,
      trend:
        food.trend ?? getNutritionTrend(currentMonthAmount, previousMonthAmount),
    };
  });
}
