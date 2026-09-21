import type { TLabsFormValues } from "@ckd/core";

export const EMPTY_LAB: TLabsFormValues["labs"][number] = {
  code: "",
  name: "",
  value: "",
  unit: "",
  refRangeLow: "",
  refRangeHigh: "",
  refRangeText: "",
  takenAt: null,
  reportedAt: null,
  source: "manual",
  status: "final",
  sourceAbnormalFlag: null,
  note: "",
};

export const LAB_SOURCE_OPTIONS = [
  { label: "Manual", value: "manual" },
  { label: "Import", value: "import" },
  { label: "Integration", value: "integration" },
] as const;

export const LAB_STATUS_OPTIONS = [
  { label: "Final", value: "final" },
  { label: "Corrected", value: "corrected" },
  { label: "Preliminary", value: "preliminary" },
  { label: "Cancelled", value: "cancelled" },
] as const;

export const LAB_ABNORMAL_FLAG_OPTIONS = [
  { label: "None", value: "" },
  { label: "Low (L)", value: "L" },
  { label: "Critical low (LL)", value: "LL" },
  { label: "High (H)", value: "H" },
  { label: "Critical high (HH)", value: "HH" },
  { label: "Abnormal (A)", value: "A" },
  { label: "Normal (N)", value: "N" },
] as const;
