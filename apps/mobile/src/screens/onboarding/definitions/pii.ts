import type { TPiiFormInput } from "@ckd/core";

export type SexAtBirth = TPiiFormInput["sexAtBirth"];
export type Units = TPiiFormInput["units"];
export type GenderIdentitySameAsBirth =
  | "yes"
  | "no"
  | "prefer_not_to_say"
  | "unknown";

export const UNIT_OPTIONS: Array<{ label: string; value: Units }> = [
  { label: "Metric", value: "metric" },
  { label: "Imperial", value: "imperial" },
];

export const SEX_AT_BIRTH_OPTIONS: Array<{ label: string; value: SexAtBirth }> =
  [
    { label: "Select", value: "" },
    { label: "Female", value: "female" },
    { label: "Male", value: "male" },
    { label: "Intersex", value: "intersex" },
    { label: "Unknown / not recorded", value: "unknown" },
  ];

export const GENDER_IDENTITY_SAME_AS_BIRTH_OPTIONS: Array<{
  label: string;
  value: GenderIdentitySameAsBirth;
}> = [
  { label: "Yes", value: "yes" },
  { label: "No", value: "no" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
  { label: "Unknown / not recorded", value: "unknown" },
];

export const GENDER_IDENTITY_OPTIONS = [
  { label: "Woman", value: "woman" },
  { label: "Man", value: "man" },
  { label: "Non-binary", value: "non_binary" },
  { label: "Another identity", value: "another_identity" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
  { label: "Unknown / not recorded", value: "unknown" },
] as const;

export const ETHNICITY_GROUPS = [
  {
    label: "Asian or Asian British",
    options: [
      { label: "Indian", value: "indian" },
      { label: "Pakistani", value: "pakistani" },
      { label: "Bangladeshi", value: "bangladeshi" },
      { label: "Chinese", value: "chinese" },
      { label: "Any other Asian background", value: "other_asian_background" },
    ],
  },
  {
    label: "Black, Black British, Caribbean or African",
    options: [
      { label: "African", value: "african" },
      { label: "Caribbean", value: "caribbean" },
      {
        label:
          "Any other Black, Black British, Caribbean or African background",
        value: "other_black_background",
      },
    ],
  },
  {
    label: "Mixed or multiple ethnic groups",
    options: [
      {
        label: "White and Black Caribbean",
        value: "white_and_black_caribbean",
      },
      {
        label: "White and Black African",
        value: "white_and_black_african",
      },
      { label: "White and Asian", value: "white_and_asian" },
      {
        label: "Any other Mixed or multiple ethnic background",
        value: "other_mixed_background",
      },
    ],
  },
  {
    label: "Other ethnic group",
    options: [
      { label: "Arab", value: "arab" },
      { label: "Any other ethnic group", value: "other_ethnic_group" },
    ],
  },
  {
    label: "White",
    options: [
      {
        label: "English, Welsh, Scottish, Northern Irish or British",
        value: "english_welsh_scottish_northern_irish_or_british",
      },
      { label: "Irish", value: "irish" },
      { label: "Gypsy or Irish Traveller", value: "gypsy_or_irish_traveller" },
      { label: "Roma", value: "roma" },
      { label: "Any other White background", value: "other_white_background" },
    ],
  },
  {
    label: "Prefer not to say",
    options: [{ label: "Prefer not to say", value: "prefer_not_to_say" }],
  },
  {
    label: "Unknown / not recorded",
    options: [{ label: "Unknown / not recorded", value: "unknown" }],
  },
] as const;

export const ETHNICITY_LABELS = Object.fromEntries(
  ETHNICITY_GROUPS.flatMap((group) =>
    group.options.map((option) => [option.value, option.label]),
  ),
) as Record<string, string>;
