export type MedicationStatus = "active" | "paused" | "stopped" | "completed";

export type DrugSuggestion = {
  id: string;
  name: string;
  displayName: string;
  dmplusdCode: string | null;
  snomedCode: string | null;
  form: string | null;
  route: string | null;
};

export type MedicationHistoryItem = {
  id: string;
  name: string;
  dose: string | null;
  frequency: string | null;
  startAt: string | null;
  status: MedicationStatus;
  updatedAt: string | null;
  latestReason: string | null;
};

export type MedicationHistoryResponse = {
  items: MedicationHistoryItem[];
};

export type MedicationEditEvent = {
  at: string | null;
  by: string;
  reason: string;
  type: "edited" | "status_change";
  changes: string[];
  toStatus: MedicationStatus | null;
};

export type MedicationDetail = {
  id: string;
  name: string;
  dose: string;
  frequency: string;
  route: string;
  form: string;
  startAt: string | null;
  endAt: string | null;
  status: MedicationStatus;
  updatedAt: string | null;
  editHistory: MedicationEditEvent[];
  drugRefId?: string | null;
  dmplusdCode?: string | null;
  snomedCode?: string | null;
  instructions?: string;
};

export type SaveMedicationPayload = {
  dose: string;
  editReason?: string;
  form: string;
  frequency: string;
  name: string;
  route: string;
  startAt: string;
  status?: MedicationStatus;
  drugRefId?: string;
  dmplusdCode?: string;
  snomedCode?: string;
};
