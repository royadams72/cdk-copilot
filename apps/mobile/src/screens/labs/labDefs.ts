export type LabDefinition = {
  code: string;
  name: string;
  precision: number;
  unit: string;
};

export const LAB_DEFINITIONS: LabDefinition[] = [
  { code: "2160-0", name: "Creatinine", precision: 0, unit: "umol/L" },
  { code: "33914-3", name: "eGFR", precision: 0, unit: "mL/min/1.73m²" },
  { code: "2951-2", name: "Sodium", precision: 0, unit: "mmol/L" },
  { code: "2777-1", name: "Serum phosphorus", precision: 1, unit: "mg/dL" },
  { code: "2823-3", name: "Serum potassium", precision: 1, unit: "mmol/L" },
  { code: "17861-6", name: "Adjusted calcium", precision: 2, unit: "mmol/L" },
  { code: "1751-7", name: "Albumin", precision: 0, unit: "g/L" },
  { code: "1963-8", name: "Bicarbonate", precision: 0, unit: "mmol/L" },
  { code: "3094-0", name: "Urea", precision: 1, unit: "mmol/L" },
  { code: "718-7", name: "Haemoglobin", precision: 0, unit: "g/L" },
  { code: "14959-1", name: "uACR", precision: 1, unit: "mg/mmol" },
  { code: "4548-4", name: "HbA1c", precision: 0, unit: "mmol/mol" },
];
