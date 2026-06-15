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
