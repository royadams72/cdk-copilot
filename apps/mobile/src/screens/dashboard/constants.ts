import { NutritionMetricKey } from "./types";

export const STACKED_COLORS = [
  "#a855f7",
  "#f97316",
  "#38bdf8",
  "#22d3ee",
  "#facc15",
];

export const LAB_CONFIG = [
  { id: "egfr", label: "eGFR", unit: "mL/min/1.73m²", precision: 0 },
  {
    id: "phosphorus",
    label: "Serum phosphorus",
    unit: "mg/dL",
    precision: 1,
  },
  { id: "potassium", label: "Serum potassium", unit: "mmol/L", precision: 1 },
] as const;

export const STACKED_SIZE = 220;
export const STACKED_STROKE = 12;
export const STACKED_GAP = 8;

export const NUTRITION_METRICS: Array<{
  id: string;
  key: NutritionMetricKey;
  label: string;
  unit: string;
  color: string;
}> = [
  {
    id: "protein",
    key: "proteinG",
    label: "Protein",
    unit: "g",
    color: STACKED_COLORS[0],
  },
  {
    id: "phosphorus",
    key: "phosphorusMg",
    label: "Phosphorus",
    unit: "mg",
    color: STACKED_COLORS[1],
  },
  {
    id: "potassium",
    key: "potassiumMg",
    label: "Potassium",
    unit: "mg",
    color: STACKED_COLORS[2],
  },
  {
    id: "sodium",
    key: "sodiumMg",
    label: "Sodium",
    unit: "mg",
    color: STACKED_COLORS[3],
  },
];
