import type { TMedicationFormValues } from "@ckd/core";

export const EMPTY_MEDICATION: TMedicationFormValues["medications"][number] = {
  dmplusdCode: "",
  dose: "",
  endAt: null,
  form: "",
  frequency: "",
  instructions: "",
  name: "",
  route: "",
  snomedCode: "",
  startAt: null,
  status: "active",
  strength: "",
};

export const MEDICATION_STATUS_OPTIONS = [
  { label: "Yes", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Stopped", value: "stopped" },
  { label: "Completed", value: "completed" },
] as const;
