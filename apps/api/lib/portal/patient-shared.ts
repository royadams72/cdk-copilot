export const PORTAL_PATIENT_FILTERS = [
  "all",
  "worsening",
  "review",
  "disengaged",
  "endingSoon",
] as const;

export type PortalPatientFilter = (typeof PORTAL_PATIENT_FILTERS)[number];

export type PortalPatientListItem = {
  accessEndsAt: string | null;
  careTeamId: string | null;
  dateOfBirth: string | null;
  email: string | null;
  facilityId: string | null;
  flags: string[];
  id: string;
  lastContactAt: string | null;
  name: string;
  risk: "green" | "amber" | "red" | "unknown";
  stage: string | null;
};

export type PortalPatientDetail = PortalPatientListItem & {
  assignments: Array<{
    careTeamId: string | null;
    consentStatus: string | null;
    endsAt: string | null;
    facilityId: string | null;
    orgId: string | null;
    startsAt: string | null;
    status: string | null;
  }>;
};

export const PORTAL_NUTRITION_FILTERS = [
  "phosphorusMg",
  "potassiumMg",
  "sodiumMg",
  "proteinG",
  "caloriesKcal",
] as const;

export type PortalNutritionFilter = (typeof PORTAL_NUTRITION_FILTERS)[number];

export type PortalPatientNutritionFoodRow = {
  averageAmount: number;
  currentMonthAmount: number;
  food: string;
  levelLabel: string;
  timesLogged: number;
  trend: "increased" | "same" | "reduced";
};

export type PortalPatientNutritionMonth = {
  isSelected: boolean;
  label: string;
  month: string;
  target: number | null;
  value: number;
};

export type PortalPatientNutritionData = {
  foodRows: PortalPatientNutritionFoodRow[];
  headline: string;
  patient: PortalPatientDetail;
  selectedFilter: PortalNutritionFilter;
  selectedMonth: string;
  selectedMonthLabel: string;
  summaryTitle: string;
  tableTitle: string;
  monthlyStats: PortalPatientNutritionMonth[];
  window: {
    days: number;
    from: string;
    to: string;
  };
};

export const PORTAL_HEALTH_METRICS = [
  "blood_pressure",
  "weight",
  "symptoms",
] as const;

export type PortalHealthMetric = (typeof PORTAL_HEALTH_METRICS)[number];

export type PortalPatientHealthMonth = {
  isSelected: boolean;
  label: string;
  month: string;
  primaryValue: number;
  secondaryValue: number | null;
};

export type PortalPatientHealthRow = {
  detail: string | null;
  id: string;
  label: string;
  primaryValue: number;
  secondaryValue: number | null;
};

export type PortalPatientHealthData = {
  headline: string;
  monthlyStats: PortalPatientHealthMonth[];
  patient: PortalPatientDetail;
  rows: PortalPatientHealthRow[];
  selectedMetric: PortalHealthMetric;
  selectedMonth: string;
  selectedMonthLabel: string;
  series: {
    primaryLabel: string;
    primaryUnit: string;
    rowLabel: string;
    secondaryLabel?: string;
    secondaryUnit?: string;
  };
  summaryTitle: string;
  tableTitle: string;
  window: {
    days: number;
    from: string;
    to: string;
  };
};

export type PortalPatientMedicationRow = {
  dose: string | null;
  endAt: string | null;
  form: string | null;
  frequency: string | null;
  id: string;
  instructions: string | null;
  latestReason: string | null;
  name: string;
  route: string | null;
  source: "clinical_profile" | "current_projection";
  startAt: string | null;
  status: "active" | "paused" | "stopped" | "completed";
  updatedAt: string | null;
};

export type PortalPatientMedicationEvent = {
  at: string;
  by: string;
  id: string;
  label: string;
  reason: string | null;
};

export type PortalPatientMedicationData = {
  headline: string;
  patient: PortalPatientDetail;
  recentEvents: PortalPatientMedicationEvent[];
  rows: PortalPatientMedicationRow[];
  summary: {
    activeCount: number;
    lastUpdatedAt: string | null;
    projectedCount: number;
    totalCount: number;
  };
};

export type PortalPatientCarePlanRow = {
  activatedAt: string | null;
  completedAt: string | null;
  goalsCount: number;
  id: string;
  notes: string | null;
  openTasksCount: number;
  sources: Array<"manual" | "ai" | "template">;
  status: "draft" | "active" | "completed" | "archived";
  tasksCount: number;
  title: string;
  updatedAt: string;
};

export type PortalPatientCarePlanData = {
  headline: string;
  patient: PortalPatientDetail;
  rows: PortalPatientCarePlanRow[];
  summary: {
    activeCount: number;
    completedCount: number;
    draftCount: number;
    reviewDueCount: number;
    totalCount: number;
  };
};

export type PortalPatientCarePlanGoal = {
  id: string;
  label: string;
  targetSummary: string | null;
};

export type PortalPatientCarePlanTask = {
  freq: "daily" | "weekly" | "once";
  id: string;
  instructions: string | null;
  label: string;
  status: "open" | "paused" | "done";
};

export type PortalPatientCarePlanDetailData = {
  headline: string;
  patient: PortalPatientDetail;
  plan: {
    activatedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    createdBy: string;
    goals: PortalPatientCarePlanGoal[];
    id: string;
    notes: string | null;
    sources: Array<"manual" | "ai" | "template">;
    status: "draft" | "active" | "completed" | "archived";
    tasks: PortalPatientCarePlanTask[];
    title: string;
    updatedAt: string;
    updatedBy: string;
  };
};

export type PortalPatientStat = {
  count: number;
  detail: string;
  icon: string;
  label: string;
  tone: "accent" | "warning";
};

export function normalizePortalPatientFilter(
  value: string | null | undefined,
): PortalPatientFilter {
  return PORTAL_PATIENT_FILTERS.includes(value as PortalPatientFilter)
    ? (value as PortalPatientFilter)
    : "all";
}

export function normalizePortalNutritionFilter(
  value: string | null | undefined,
): PortalNutritionFilter {
  return PORTAL_NUTRITION_FILTERS.includes(value as PortalNutritionFilter)
    ? (value as PortalNutritionFilter)
    : "phosphorusMg";
}

export function normalizePortalHealthMetric(
  value: string | null | undefined,
): PortalHealthMetric {
  return PORTAL_HEALTH_METRICS.includes(value as PortalHealthMetric)
    ? (value as PortalHealthMetric)
    : "blood_pressure";
}
