import {
  ClinicalFormSchema,
  HealthProfileFormSchema,
  type TClinicalFormValues,
  type THealthProfileFormValues,
} from "@ckd/core";

export const ClinicalOnboardingSchema = ClinicalFormSchema.merge(
  HealthProfileFormSchema,
);

export type TClinicalOnboardingFormValues = TClinicalFormValues &
  THealthProfileFormValues;

export type MedicationSearchItem = {
  id: string;
  displayName: string;
  dmplusdCode: string | null;
  name: string;
  snomedCode: string | null;
};

export type ConditionSearchItem = {
  code: string;
  codeSystem: "SNOMED_CT";
  label: string;
};

export type CareTeamMemberInput =
  TClinicalOnboardingFormValues["careTeam"][number];

export type DietaryPreferenceInput =
  TClinicalOnboardingFormValues["dietaryPreferences"][number];

export type AutocompleteOption = {
  key: string;
  label: string;
  supportingText?: string;
  value: unknown;
};

export type NestedOption = Readonly<{
  children?: readonly { key: string; label: string }[];
  key: string;
  label: string;
}>;
