import { NutrientKey } from "@/apps/api/lib/types/dashboard";

export const DEFAULT_RATIO_THRESHOLD = 12;

export const TRACKED_LABS = [
  {
    id: "egfr",
    codes: ["33914-3"],
    label: "eGFR",
    nameMatch: /egfr/i,
    unitFallback: "mL/min/1.73m²",
  },
  {
    id: "phosphorus",
    codes: ["2777-1", "2778-9"],
    label: "Serum phosphorus",
    nameMatch: /phosph/,
    unitFallback: "mg/dL",
  },
  {
    id: "potassium",
    codes: ["2823-3"],
    label: "Serum potassium",
    nameMatch: /potass/,
    unitFallback: "mmol/L",
  },
] as const;

export const RADIAL_METRICS = [
  { id: "protein", key: "proteinG", label: "Protein", precision: 0, unit: "g" },
  {
    id: "phosphorus",
    key: "phosphorusMg",
    label: "Phosphorus",
    precision: 0,
    unit: "mg",
  },
  {
    id: "potassium",
    key: "potassiumMg",
    label: "Potassium",
    precision: 0,
    unit: "mg",
  },
  {
    id: "sodium",
    key: "sodiumMg",
    label: "Sodium",
    precision: 0,
    unit: "mg",
  },
] as const;

export const ZERO_TOTALS: Record<NutrientKey, number> = {
  caloriesKcal: 0,
  phosphorusMg: 0,
  potassiumMg: 0,
  proteinG: 0,
  sleep_duration_min_day: 0,
  sodiumMg: 0,
  steps_per_day: 0,
  weight_kg: 0,
};

export const DAY_MS = 24 * 60 * 60 * 1000;
export const FOOD_HIGHLIGHT_LIMIT = 5;
