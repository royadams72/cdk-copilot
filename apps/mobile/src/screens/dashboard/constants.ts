import { NutritionMetricKey } from "./types";
import { theme } from "@/constants/theme";

export const STACKED_COLORS = [
  theme.colors.chart.calories,
  theme.colors.chart.protein,
  theme.colors.chart.phosphorus,
  theme.colors.chart.potassium,
  theme.colors.chart.sodium,
  theme.colors.chart.ratio,
];

export const LAB_CONFIG = [
  {
    id: "egfr",
    codes: ["33914-3"],
    label: "eGFR",
    normalHigh: 120,
    normalLow: 60,
    precision: 0,
    unit: "mL/min/1.73m²",
  },
  {
    id: "phosphorus",
    codes: ["2777-1", "2778-9"],
    label: "Serum phosphorus",
    normalHigh: 4.5,
    normalLow: 2.5,
    precision: 1,
    unit: "mg/dL",
  },
  {
    id: "potassium",
    codes: ["2823-3"],
    label: "Serum potassium",
    normalHigh: 5.1,
    normalLow: 3.5,
    precision: 1,
    unit: "mmol/L",
  },
] as const;

export const STACKED_SIZE = theme.charts.radialSize;
export const STACKED_STROKE = 10;
export const STACKED_GAP = 3;

export const NUTRITION_METRICS: {
  id: string;
  color: string;
  key: NutritionMetricKey;
  label: string;
  unit: string;
}[] = [
  {
    id: "calories",
    color: STACKED_COLORS[0],
    key: "caloriesKcal",
    label: "Calories",
    unit: "kcal",
  },
  {
    id: "protein",
    color: STACKED_COLORS[1],
    key: "proteinG",
    label: "Protein",
    unit: "g",
  },
  {
    id: "phosphorus",
    color: STACKED_COLORS[2],
    key: "phosphorusMg",
    label: "Phosphorus",
    unit: "mg",
  },
  {
    id: "potassium",
    color: STACKED_COLORS[3],
    key: "potassiumMg",
    label: "Potassium",
    unit: "mg",
  },
  {
    id: "sodium",
    color: STACKED_COLORS[4],
    key: "sodiumMg",
    label: "Sodium",
    unit: "mg",
  },
  {
    id: "phosphorus-protein-ratio",
    color: STACKED_COLORS[5],
    key: "phosphorus_protein_ratio",
    label: "Phosphorus/Protein ratio",
    unit: "mg/g",
  },
];
