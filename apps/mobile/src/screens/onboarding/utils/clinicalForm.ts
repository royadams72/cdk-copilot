import {
  ALLERGY_GROUP_KEYS,
  ConditionStatus,
  type TAllergyFormItem,
  type TConditionFormItem,
  type THealthProfileFormValues,
  type TUserClinicalUpdate,
} from "@ckd/core";

import { API } from "@/constants/api";
import { authFetch } from "@/lib/authFetch";
import { formatApiError } from "@/lib/formatApiError";
import type {
  AutocompleteOption,
  CareTeamMemberInput,
  ConditionSearchItem,
  MedicationSearchItem,
  TClinicalOnboardingFormValues,
} from "@/screens/onboarding/types";

export const allergySeverityOptions = [
  { label: "Unknown", value: "unknown" },
  { label: "Mild", value: "mild" },
  { label: "Moderate", value: "moderate" },
  { label: "Severe", value: "severe" },
] as const;

export const conditionStatusOptions = ConditionStatus.options.map((status) => ({
  label: status.replace("-", " "),
  value: status,
}));

export function makeEmptyAllergy(
  group: (typeof ALLERGY_GROUP_KEYS)[number] = "food",
): TAllergyFormItem {
  switch (group) {
    case "food":
      return { group: "food", key: "", label: "", severity: "unknown" };
    case "environmental":
      return {
        group: "environmental",
        key: "",
        label: "",
        severity: "unknown",
      };
    case "latex":
      return { group: "latex", key: "", label: "", severity: "unknown" };
    case "medication":
      return { group: "medication", label: "", severity: "unknown" };
    case "other":
      return {
        group: "other",
        key: "other",
        label: "",
        severity: "unknown",
      };
  }
}

export function makeEmptyCondition(): TConditionFormItem {
  return {
    code: "",
    codeSystem: "SNOMED_CT",
    label: "",
    status: "active",
  };
}

export function findOptionByKey<T extends { key: string; label: string }>(
  options: readonly (T & {
    children?: readonly { key: string; label: string }[];
  })[],
  key: string,
) {
  return options.find((option) => option.key === key) ?? null;
}

export async function searchMedications(
  query: string,
): Promise<AutocompleteOption[]> {
  const res = await authFetch(
    `${API}/api/medications/search?query=${encodeURIComponent(query)}&limit=8`,
    { method: "GET" },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(formatApiError(res.status, errBody));
  }
  const body = (await res.json()) as {
    data?: { items?: MedicationSearchItem[] };
  };
  return (body.data?.items ?? []).map((item) => ({
    key: item.id,
    label: item.displayName || item.name,
    supportingText: [item.dmplusdCode, item.snomedCode]
      .filter(Boolean)
      .join(" • "),
    value: item,
  }));
}

export async function searchConditions(
  query: string,
): Promise<AutocompleteOption[]> {
  const res = await authFetch(
    `${API}/api/terminology/conditions/search?query=${encodeURIComponent(
      query,
    )}&limit=8`,
    { method: "GET" },
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error(formatApiError(res.status, errBody));
  }
  const body = (await res.json()) as {
    data?: { items?: ConditionSearchItem[] };
  };
  return (body.data?.items ?? []).map((item) => ({
    key: item.code,
    label: item.label,
    supportingText: item.code,
    value: item,
  }));
}

export function buildClinicalPayload(
  values: TClinicalOnboardingFormValues,
): Partial<TUserClinicalUpdate> {
  return {
    acrCategory: values.acrCategory
      ? (values.acrCategory as TUserClinicalUpdate["acrCategory"])
      : null,
    careTeam: values.careTeam
      .filter((member: CareTeamMemberInput) => member.role.trim().length)
      .map((member: CareTeamMemberInput) => ({
        role: member.role.trim(),
        ...(member.name?.trim() ? { name: member.name.trim() } : {}),
        ...(member.org?.trim() ? { org: member.org.trim() } : {}),
        ...(member.contact?.trim() ? { contact: member.contact.trim() } : {}),
      })),
    ckdStage: values.ckdStage as TUserClinicalUpdate["ckdStage"],
    dialysisStatus: values.dialysisStatus,
    egfrCurrent: Number(values.egfrCurrent),
    heightCm: Number(values.heightCm),
    weightKg: Number(values.weightKg),
  };
}

export function buildHealthProfilesPayload(
  values: TClinicalOnboardingFormValues,
): THealthProfileFormValues {
  return {
    allergies: values.allergies,
    conditions: values.conditions,
    dietaryPreferences: values.dietaryPreferences,
  };
}
