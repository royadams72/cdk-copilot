import {
  CarePlanActivityType,
  CarePlanSource,
  CarePlanStatus,
  type PatientWorseningTrendAlert,
  TaskFreq,
  TaskStatus,
} from "@ckd/core";
import { z } from "zod";

type CarePlanActivityTypeValue = z.infer<typeof CarePlanActivityType>;
type CarePlanSourceValue = z.infer<typeof CarePlanSource>;
type CarePlanStatusValue = z.infer<typeof CarePlanStatus>;
type CarePlanTaskFreqValue = z.infer<typeof TaskFreq>;
type CarePlanTaskStatusValue = z.infer<typeof TaskStatus>;

export const PORTAL_PATIENT_FILTERS = [
  "all",
  "worsening",
  "review",
  "disengaged",
  "endingSoon",
] as const;

export type PortalPatientFilter = (typeof PORTAL_PATIENT_FILTERS)[number];

export type PortalPatientAdvancedFilters = {
  careTeamId: string;
  dateOfBirth: string;
  facilityId: string;
  filter: PortalPatientFilter;
  membershipStatus: PortalPatientMembershipStatusFilter;
  query: string;
  stage: string;
};

export const PORTAL_PATIENT_MEMBERSHIP_STATUSES = [
  "active",
  "inactive",
  "expired",
  "ended",
  "pending",
  "unassigned",
] as const;

export type PortalPatientMembershipStatus =
  (typeof PORTAL_PATIENT_MEMBERSHIP_STATUSES)[number];

export const PORTAL_PATIENT_MEMBERSHIP_STATUS_FILTERS = [
  "active",
  "inactive",
  "expired",
  "ended",
  "pending",
  "all",
] as const;

export type PortalPatientMembershipStatusFilter =
  (typeof PORTAL_PATIENT_MEMBERSHIP_STATUS_FILTERS)[number];

export type PortalPatientListItem = {
  id: string;
  accessEndsAt: string | null;
  careTeamId: string | null;
  dateOfBirth: string | null;
  dateOfBirthIso: string | null;
  email: string | null;
  facilityId: string | null;
  flags: string[];
  lastContactAt: string | null;
  membershipStatus: PortalPatientMembershipStatus;
  name: string;
  stage: string | null;
  worseningItems: PortalPatientWorseningItem[];
};

export const PORTAL_WORSENING_KINDS = [
  "all",
  "activity",
  "bloodPressure",
  "labs",
  "nutrition",
  "symptoms",
  "weightDecrease",
  "weightIncrease",
] as const;

export type PortalWorseningKind = (typeof PORTAL_WORSENING_KINDS)[number];

export type PortalPatientWorseningItem = {
  daysActive: number;
  detail: string;
  episodeId: string;
  firstDetectedAt: string | null;
  href: string | null;
  kind: Exclude<PortalWorseningKind, "all"> | "general";
  label: string;
  level:
    | "level_1_nudge"
    | "level_2_check_in"
    | "level_3_escalate"
    | "level_3_high_priority";
  patientResponseLabel: string | null;
  portalEscalationEligible: boolean;
  reviewedAt?: string | null;
  reviewedNote?: string | null;
  reviewedByName?: string | null;
  reviewedByPrincipalId?: string | null;
  reviewedByRole?: string | null;
  viewedAt: string | null;
};

export type PortalWorseningSnapshotKey = PatientWorseningTrendAlert["key"];

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
export type PortalPatientDetailResponse = {
  data: {
    dashboard: PortalPatientDashboardData;
    patient: PortalPatientDetail;
  };
};
export type PortalPatientOverviewRow = {
  href?: string | null;
  label: string;
  meta?: string | null;
  value: string;
};

export type PortalPatientAttentionItem = {
  detail: string;
  href?: string | null;
  title: string;
  tone: "neutral" | "success" | "warning";
};

export type PortalPatientRecentActivityItem = {
  id: string;
  at: string;
  detail: string | null;
  label: string;
};

export type PortalPatientCarePlanSnapshot = {
  href: string | null;
  nextReviewAt: string | null;
  openTasksLabel: string;
  reviewLabel: string | null;
  status: string;
  title: string;
  updatedAt: string;
} | null;

export type PortalPatientDashboardData = {
  actionCards: string[];
  attentionItems: PortalPatientAttentionItem[];
  carePlanSnapshot: PortalPatientCarePlanSnapshot;
  clinicalSummary: PortalPatientOverviewRow[];
  currentStatus: PortalPatientOverviewRow[];
  engagementSummary: PortalPatientOverviewRow[];
  headline: string;
  latestReadings: PortalPatientOverviewRow[];
  recentActivity: PortalPatientRecentActivityItem[];
  subheadline: string;
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
  monthlyStats: PortalPatientNutritionMonth[];
  patient: PortalPatientDetail;
  selectedFilter: PortalNutritionFilter;
  selectedMonth: string;
  selectedMonthLabel: string;
  summaryTitle: string;
  tableTitle: string;
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

export function mapTrendKeyToPortalKind(
  key: PortalWorseningSnapshotKey,
): PortalPatientWorseningItem["kind"] {
  switch (key) {
    case "blood_pressure_up":
      return "bloodPressure";
    case "labs_worsening":
      return "labs";
    case "steps_decline":
      return "activity";
    case "symptoms_worsening":
      return "symptoms";
    case "nutrition_worsening":
      return "nutrition";
    case "weight_decrease":
      return "weightDecrease";
    case "weight_increase":
      return "weightIncrease";
  }
}

export function buildPortalWorseningHref(
  patientId: string,
  key: PortalWorseningSnapshotKey,
) {
  switch (key) {
    case "blood_pressure_up":
      return `/portal/patients/${patientId}/health?metric=blood_pressure`;
    case "labs_worsening":
      return `/portal/patients/${patientId}/labs`;
    case "weight_decrease":
    case "weight_increase":
      return `/portal/patients/${patientId}/health?metric=weight`;
    case "symptoms_worsening":
      return `/portal/patients/${patientId}/health?metric=symptoms`;
    case "nutrition_worsening":
      return `/portal/patients/${patientId}/nutrition`;
    case "steps_decline":
      return `/portal/patients/${patientId}`;
  }
}

export type PortalPatientHealthMonth = {
  isSelected: boolean;
  label: string;
  month: string;
  primaryValue: number;
  secondaryValue: number | null;
};

export type PortalPatientHealthRow = {
  id: string;
  detail: string | null;
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

export type PortalPatientLabCurrentRow = {
  abnormalFlag: "L" | "LL" | "H" | "HH" | "A" | "N" | null;
  code: string;
  id: string;
  isTracked: boolean;
  label: string;
  rangeLabel: string | null;
  takenAt: string | null;
  unit: string | null;
  value: string;
};

export type PortalPatientLabHistoryRow = {
  abnormalFlag: "L" | "LL" | "H" | "HH" | "A" | "N" | null;
  code: string;
  id: string;
  label: string;
  reportedAt: string | null;
  status: "final" | "corrected" | "preliminary" | "cancelled";
  takenAt: string | null;
  unit: string | null;
  value: string;
};

export type PortalPatientLabChartPoint = {
  abnormalFlag: "L" | "LL" | "H" | "HH" | "A" | "N" | null;
  at: string;
  id: string;
  rangeHigh: number | null;
  rangeLow: number | null;
  status: "final" | "corrected" | "preliminary" | "cancelled";
  value: number;
};

export type PortalPatientLabChartSeries = {
  id: string;
  isTracked: boolean;
  label: string;
  points: PortalPatientLabChartPoint[];
  rangeLabel: string | null;
  unit: string | null;
};

export type PortalPatientLabData = {
  chartSeries: PortalPatientLabChartSeries[];
  currentLabs: PortalPatientLabCurrentRow[];
  headline: string;
  historyRows: PortalPatientLabHistoryRow[];
  patient: PortalPatientDetail;
  summary: {
    abnormalCount: number;
    criticalCount: number;
    historyShownCount: number;
    lastReportedAt: string | null;
    totalCurrent: number;
    trackedCount: number;
  };
};

export type PortalPatientMedicationRow = {
  id: string;
  dose: string | null;
  endAt: string | null;
  form: string | null;
  frequency: string | null;
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
  id: string;
  at: string;
  by: string;
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
  id: string;
  activatedAt: string | null;
  completedAt: string | null;
  goalsCount: number;
  notes: string | null;
  openTasksCount: number;
  sources: CarePlanSourceValue[];
  status: CarePlanStatusValue;
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

export type PortalPatientCarePlanDiagnosis = {
  id: string;
  code: string | null;
  codeSystem?: "SNOMED_CT" | "CUSTOM" | null;
  label: string;
};

export type PortalPatientCarePlanTask = {
  id: string;
  freq: CarePlanTaskFreqValue;
  instructions: string | null;
  label: string;
  status: CarePlanTaskStatusValue;
};

export type PortalPatientCarePlanActivity = {
  id: string;
  type: CarePlanActivityTypeValue;
  at: string;
  by: string;
  note: string | null;
};

export type PortalPatientCarePlanDetailData = {
  activity: PortalPatientCarePlanActivity[];
  headline: string;
  patient: PortalPatientDetail;
  plan: {
    activatedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    createdBy: string;
    diagnoses: PortalPatientCarePlanDiagnosis[];
    goals: PortalPatientCarePlanGoal[];
    id: string;
    notes: string | null;
    ownerLabels: string[];
    reviewLabel: string | null;
    sources: CarePlanSourceValue[];
    status: CarePlanStatusValue;
    tasks: PortalPatientCarePlanTask[];
    title: string;
    updatedAt: string;
    updatedBy: string;
  };
};

export type PortalPatientCarePlanOption = {
  id: string;
  label: string;
};

export type PortalPatientCarePlanCreateData = {
  actionOptions: PortalPatientCarePlanOption[];
  diagnosisOptions: PortalPatientCarePlanDiagnosis[];
  frequencyOptions: PortalPatientCarePlanOption[];
  headline: string;
  ownerOptions: PortalPatientCarePlanOption[];
  patient: PortalPatientDetail;
  reviewOptions: PortalPatientCarePlanOption[];
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

export function normalizePortalPatientMembershipStatusFilter(
  value: string | null | undefined,
): PortalPatientMembershipStatusFilter {
  return PORTAL_PATIENT_MEMBERSHIP_STATUS_FILTERS.includes(
    value as PortalPatientMembershipStatusFilter,
  )
    ? (value as PortalPatientMembershipStatusFilter)
    : "active";
}

export function normalizePortalWorseningKind(
  value: string | null | undefined,
): PortalWorseningKind {
  return PORTAL_WORSENING_KINDS.includes(value as PortalWorseningKind)
    ? (value as PortalWorseningKind)
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
