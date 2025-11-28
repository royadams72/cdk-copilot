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
