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
