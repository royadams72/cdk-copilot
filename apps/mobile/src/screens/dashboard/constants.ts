import { NutritionMetricKey } from "./types";

export const STACKED_COLORS = [
  "#a855f7",
  "#f97316",
  "#38bdf8",
  "#22d3ee",
  "#facc15",
];

export const LAB_CONFIG = [
  {
    id: "egfr",
    codes: ["33914-3"],
    label: "eGFR",
    unit: "mL/min/1.73m²",
    precision: 0,
    normalLow: 60,
    normalHigh: 120,
  },
  {
    id: "phosphorus",
    codes: ["2777-1", "2778-9"],
    label: "Serum phosphorus",
    unit: "mg/dL",
    precision: 1,
    normalLow: 2.5,
    normalHigh: 4.5,
  },
  {
    id: "potassium",
    codes: ["2823-3"],
    label: "Serum potassium",
    unit: "mmol/L",
    precision: 1,
    normalLow: 3.5,
    normalHigh: 5.1,
  },
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
  {
    id: "phosphorus-protein-ratio",
    key: "phosphorus_protein_ratio",
    label: "Phosphorus/Protein ratio",
    unit: "mg/g",
    color: STACKED_COLORS[4],
  },
];
