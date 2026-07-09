import { z } from "zod";

import { objectIdHex, PrincipalId } from "./common";

export const ALLERGY_GROUP_KEYS = [
  "food",
  "medication",
  "environmental",
  "latex",
  "other",
] as const;

export const AllergyGroup = z.enum(ALLERGY_GROUP_KEYS);

export const AllergySeverity = z.enum([
  "mild",
  "moderate",
  "severe",
  "unknown",
]);

export const ConditionStatus = z.enum([
  "active",
  "inactive",
  "resolved",
  "unknown",
]);

export const MedicationCodeSystem = z.enum(["DM_D", "SNOMED_CT", "CUSTOM"]);
export const ConditionCodeSystem = z.enum(["SNOMED_CT", "CUSTOM"]);
export const HealthProfileKind = z.enum([
  "allergy",
  "dietary_preference",
  "condition",
]);

const OptionChild = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
});

const nestedOption = <T extends string>(group: T) =>
  z.object({
    children: z.array(OptionChild).optional(),
    group: z.literal(group),
    key: z.string().min(1),
    label: z.string().min(1),
  });

export const ALLERGY_GROUP_OPTIONS = [
  { key: "food", label: "Food" },
  { key: "medication", label: "Medication" },
  { key: "environmental", label: "Environmental" },
  { key: "latex", label: "Latex" },
  { key: "other", label: "Other" },
] as const;

export const FOOD_ALLERGENS = [
  { group: "food", key: "celery", label: "Celery" },
  {
    children: [
      { key: "wheat", label: "Wheat" },
      { key: "rye", label: "Rye" },
      { key: "barley", label: "Barley" },
      { key: "oats", label: "Oats" },
      { key: "spelt", label: "Spelt" },
      { key: "khorasan_wheat", label: "Khorasan wheat" },
    ],
    group: "food",
    key: "cereals_containing_gluten",
    label: "Cereals containing gluten",
  },
  {
    children: [
      { key: "prawns", label: "Prawns" },
      { key: "shrimp", label: "Shrimp" },
      { key: "crab", label: "Crab" },
      { key: "lobster", label: "Lobster" },
      { key: "crayfish", label: "Crayfish" },
    ],
    group: "food",
    key: "crustaceans",
    label: "Crustaceans",
  },
  { group: "food", key: "eggs", label: "Eggs" },
  { group: "food", key: "fish", label: "Fish" },
  { group: "food", key: "lupin", label: "Lupin" },
  { group: "food", key: "milk", label: "Milk" },
  {
    children: [
      { key: "mussels", label: "Mussels" },
      { key: "oysters", label: "Oysters" },
      { key: "squid", label: "Squid" },
      { key: "octopus", label: "Octopus" },
      { key: "scallops", label: "Scallops" },
      { key: "clams", label: "Clams" },
      { key: "snails", label: "Snails" },
    ],
    group: "food",
    key: "molluscs",
    label: "Molluscs",
  },
  { group: "food", key: "mustard", label: "Mustard" },
  { group: "food", key: "peanuts", label: "Peanuts" },
  { group: "food", key: "sesame", label: "Sesame" },
  { group: "food", key: "soybeans", label: "Soybeans" },
  {
    group: "food",
    key: "sulphur_dioxide_and_sulphites",
    label: "Sulphur dioxide and sulphites",
  },
  {
    children: [
      { key: "almonds", label: "Almonds" },
      { key: "hazelnuts", label: "Hazelnuts" },
      { key: "walnuts", label: "Walnuts" },
      { key: "brazil_nuts", label: "Brazil nuts" },
      { key: "cashews", label: "Cashews" },
      { key: "pecans", label: "Pecans" },
      { key: "pistachios", label: "Pistachios" },
      { key: "macadamia_nuts", label: "Macadamia nuts" },
    ],
    group: "food",
    key: "tree_nuts",
    label: "Tree nuts",
  },
] as const;

export const ENVIRONMENTAL_ALLERGENS = [
  {
    children: [
      { key: "grass_pollen", label: "Grass pollen" },
      { key: "tree_pollen", label: "Tree pollen" },
      { key: "weed_pollen", label: "Weed pollen" },
    ],
    group: "environmental",
    key: "pollen",
    label: "Pollen",
  },
  {
    group: "environmental",
    key: "house_dust_mite",
    label: "House dust mite",
  },
  { group: "environmental", key: "mould", label: "Mould" },
  {
    children: [
      { key: "cat_dander", label: "Cat dander" },
      { key: "dog_dander", label: "Dog dander" },
      { key: "horse_dander", label: "Horse dander" },
    ],
    group: "environmental",
    key: "animal_dander",
    label: "Animal dander",
  },
  {
    children: [
      { key: "bee_stings", label: "Bee stings" },
      { key: "wasp_stings", label: "Wasp stings" },
      { key: "hornet_stings", label: "Hornet stings" },
    ],
    group: "environmental",
    key: "insect_stings",
    label: "Insect stings",
  },
  { group: "environmental", key: "cockroach", label: "Cockroach" },
] as const;

export const LATEX_ALLERGENS = [
  { group: "latex", key: "latex", label: "Latex" },
  {
    group: "latex",
    key: "natural_rubber_latex",
    label: "Natural rubber latex",
  },
] as const;

export const OTHER_ALLERGY_OPTIONS = [
  { group: "other", key: "other", label: "Other" },
  { group: "other", key: "unknown", label: "Unknown" },
] as const;

export const FOOD_ALLERGEN_SCHEMA = z.array(nestedOption("food"));
export const ENVIRONMENTAL_ALLERGEN_SCHEMA = z.array(
  nestedOption("environmental"),
);
export const LATEX_ALLERGEN_SCHEMA = z.array(nestedOption("latex"));
export const OTHER_ALLERGY_SCHEMA = z.array(nestedOption("other"));

export const DIETARY_PREFERENCE_KEYS = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "halal",
  "kosher",
  "gluten_free",
  "dairy_free",
  "egg_free",
  "nut_free",
  "soy_free",
  "low_salt",
  "low_sugar",
  "low_fat",
  "low_potassium",
  "low_phosphorus",
  "renal_friendly",
  "diabetic_friendly",
] as const;

export const DietaryPreferenceKey = z.enum(DIETARY_PREFERENCE_KEYS);

export const DIETARY_PREFERENCE_OPTIONS = [
  { key: "vegetarian", label: "Vegetarian" },
  { key: "vegan", label: "Vegan" },
  { key: "pescatarian", label: "Pescatarian" },
  { key: "halal", label: "Halal" },
  { key: "kosher", label: "Kosher" },
  { key: "gluten_free", label: "Gluten free" },
  { key: "dairy_free", label: "Dairy free" },
  { key: "egg_free", label: "Egg free" },
  { key: "nut_free", label: "Nut free" },
  { key: "soy_free", label: "Soy free" },
  { key: "low_salt", label: "Low salt" },
  { key: "low_sugar", label: "Low sugar" },
  { key: "low_fat", label: "Low fat" },
  { key: "diabetic_friendly", label: "Diabetic friendly" },
] as const;

const optionalTrimmedText = z.string().trim().min(1).optional();

const AllergyCommon = {
  notes: optionalTrimmedText,
  severity: AllergySeverity.default("unknown"),
};

export const FoodAllergyFormItem = z
  .object({
    childKey: z.string().min(1).optional(),
    childLabel: z.string().min(1).optional(),
    group: z.literal("food"),
    key: z.string().min(1),
    label: z.string().min(1),
    ...AllergyCommon,
  })
  .refine(
    (value) =>
      (!value.childKey && !value.childLabel) ||
      (!!value.childKey && !!value.childLabel),
    {
      message: "childKey and childLabel must be provided together",
      path: ["childKey"],
    },
  );

export const MedicationAllergyFormItem = z.object({
  dmplusdCode: z.string().min(1).optional(),
  group: z.literal("medication"),
  label: z.string().min(1),
  medicationCode: z.string().min(1).optional(),
  medicationCodeSystem: MedicationCodeSystem.optional(),
  medicationRefId: objectIdHex.optional(),
  snomedCode: z.string().min(1).optional(),
  ...AllergyCommon,
});

export const EnvironmentalAllergyFormItem = z
  .object({
    childKey: z.string().min(1).optional(),
    childLabel: z.string().min(1).optional(),
    group: z.literal("environmental"),
    key: z.string().min(1),
    label: z.string().min(1),
    ...AllergyCommon,
  })
  .refine(
    (value) =>
      (!value.childKey && !value.childLabel) ||
      (!!value.childKey && !!value.childLabel),
    {
      message: "childKey and childLabel must be provided together",
      path: ["childKey"],
    },
  );

export const LatexAllergyFormItem = z.object({
  group: z.literal("latex"),
  key: z.string().min(1),
  label: z.string().min(1),
  ...AllergyCommon,
});

export const OtherAllergyFormItem = z.object({
  group: z.literal("other"),
  key: z.string().min(1).default("other"),
  label: z.string().min(1),
  ...AllergyCommon,
});

export const AllergyFormItem = z.discriminatedUnion("group", [
  FoodAllergyFormItem,
  MedicationAllergyFormItem,
  EnvironmentalAllergyFormItem,
  LatexAllergyFormItem,
  OtherAllergyFormItem,
]);

export const DietaryPreferenceFormItem = z.object({
  key: DietaryPreferenceKey,
  label: z.string().min(1),
});

export const ConditionFormItem = z.object({
  code: z.string().min(1),
  codeSystem: ConditionCodeSystem.default("SNOMED_CT"),
  label: z.string().min(1),
  notes: optionalTrimmedText,
  status: ConditionStatus.default("active"),
});

export const HealthProfileFormSchema = z.object({
  allergies: z.array(AllergyFormItem).default([]),
  conditions: z.array(ConditionFormItem).default([]),
  dietaryPreferences: z.array(DietaryPreferenceFormItem).default([]),
});

export const HealthProfileValue = z.discriminatedUnion("kind", [
  z.object({
    allergy: AllergyFormItem,
    kind: z.literal("allergy"),
  }),
  z.object({
    dietaryPreference: DietaryPreferenceFormItem,
    kind: z.literal("dietary_preference"),
  }),
  z.object({
    condition: ConditionFormItem,
    kind: z.literal("condition"),
  }),
]);

export const HealthProfileActor = z.object({
  actorType: z.enum(["patient", "clinician", "dietitian", "admin", "system"]),
  displayName: z.string().min(1).nullable().optional(),
  principalId: PrincipalId,
});

export const HealthProfileCurrentEntry = z.object({
  entryId: z.string().min(1),
  value: HealthProfileValue,
});

export const HealthProfilesCurrent = z.object({
  allergies: z
    .array(
      HealthProfileCurrentEntry.extend({
        value: z.object({
          allergy: AllergyFormItem,
          kind: z.literal("allergy"),
        }),
      }),
    )
    .default([]),
  conditions: z
    .array(
      HealthProfileCurrentEntry.extend({
        value: z.object({
          condition: ConditionFormItem,
          kind: z.literal("condition"),
        }),
      }),
    )
    .default([]),
  createdAt: z.date(),
  createdBy: HealthProfileActor,
  dietaryPreferences: z
    .array(
      HealthProfileCurrentEntry.extend({
        value: z.object({
          dietaryPreference: DietaryPreferenceFormItem,
          kind: z.literal("dietary_preference"),
        }),
      }),
    )
    .default([]),
  orgId: z.string().min(1).optional(),
  patientId: objectIdHex,
  updatedAt: z.date(),
  updatedBy: HealthProfileActor,
});

export const HealthProfilesUpsertRequest = HealthProfileFormSchema;

export const HealthProfileLedgerEvent = z
  .object({
    _id: objectIdHex,
    after: HealthProfileValue.nullable(),
    before: HealthProfileValue.nullable(),
    correctionOf: objectIdHex.nullable().optional(),
    createdAt: z.date(),
    createdBy: HealthProfileActor,
    entryId: z.string().min(1),
    eventType: z.enum([
      "created",
      "updated",
      "removed",
      "restored",
      "ledger_correction",
    ]),
    orgId: z.string().min(1).optional(),
    patientId: objectIdHex,
    superseded: z.boolean().default(false),
  })
  .refine((value) => value.before !== null || value.after !== null, {
    message: "Either before or after must be present",
    path: ["after"],
  });

export type TAllergyFormItem = z.infer<typeof AllergyFormItem>;
export type TConditionFormItem = z.infer<typeof ConditionFormItem>;
export type TDietaryPreferenceFormItem = z.infer<
  typeof DietaryPreferenceFormItem
>;
export type THealthProfileActor = z.infer<typeof HealthProfileActor>;
export type THealthProfileCurrent = z.infer<typeof HealthProfilesCurrent>;
export type THealthProfileFormValues = z.infer<typeof HealthProfileFormSchema>;
export type THealthProfileLedgerEvent = z.infer<
  typeof HealthProfileLedgerEvent
>;
export type THealthProfilesUpsertRequest = z.infer<
  typeof HealthProfilesUpsertRequest
>;
export type THealthProfileValue = z.infer<typeof HealthProfileValue>;
