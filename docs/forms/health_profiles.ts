type Group =
  | "food"
  | "medication"
  | "environmental"
  | "latex"
  | "other"
  | "condition";

type AllergyOption = {
  children?: Array<{
    key: string;
    label: string;
  }>;
  group: Group;
  key: string;
  label: string;
};
// For collection storage
type HealthProfile = {
  id: "ObjectId";
  // Optional child value, mainly for grouped food allergens
  childKey?: string;
  childLabel?: string;

  // Conditions
  code?: string;
  codeSystem?: string;
  createdAt: Date;

  group: string;
  key: string;
  label: string;
  medicationCode?: string;
  // Medication autocomplete result
  medicationCodeSystem?: "DM_D" | "SNOMED_CT" | "CUSTOM";
  notes?: string;

  patienId: "ObjectId";
  // Allergies
  severity?: "mild" | "moderate" | "severe" | "unknown";
  // Conditions
  status?: "active" | "inactive" | "resolved" | "unknown";

  system?: string;
  updatedAt: Date;
};

export const ALLERGY_GROUP_OPTIONS = [
  { key: "food", label: "Food" },
  { key: "medication", label: "Medication" },
  { key: "environmental", label: "Environmental" },
  { key: "latex", label: "Latex" },
  { key: "other", label: "Other" },
] as const;

export const ALLERGY_OPTIONS: AllergyOption[] = [
  // Food allergens
  {
    group: "food",
    key: "celery",
    label: "Celery",
  },
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
  {
    group: "food",
    key: "eggs",
    label: "Eggs",
  },
  {
    group: "food",
    key: "fish",
    label: "Fish",
  },
  {
    group: "food",
    key: "lupin",
    label: "Lupin",
  },
  {
    group: "food",
    key: "milk",
    label: "Milk",
  },
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
  {
    group: "food",
    key: "mustard",
    label: "Mustard",
  },
  {
    group: "food",
    key: "peanuts",
    label: "Peanuts",
  },
  {
    group: "food",
    key: "sesame",
    label: "Sesame",
  },
  {
    group: "food",
    key: "soybeans",
    label: "Soybeans",
  },
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

  // Medication allergies
  // Use your medication autocomplete here instead of a fixed list.
  {
    group: "medication",
    key: "medication_autocomplete",
    label: "Search medication",
  },

  // Environmental allergies
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
  {
    group: "environmental",
    key: "mould",
    label: "Mould",
  },
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
  {
    group: "environmental",
    key: "cockroach",
    label: "Cockroach",
  },

  // Latex
  {
    group: "latex",
    key: "latex",
    label: "Latex",
  },
  {
    group: "latex",
    key: "natural_rubber_latex",
    label: "Natural rubber latex",
  },

  // Other
  {
    group: "other",
    key: "other",
    label: "Other",
  },
  {
    group: "other",
    key: "unknown",
    label: "Unknown",
  },
];

// Storage
const allergy1 = [
  {
    id: "allergy_2",
    createdAt: new Date(),
    group: "food",
    key: "peanuts",
    label: "Peanuts",
    severity: "moderate",
    updatedAt: new Date(),
    userId: "user_123",
  },
];

const medication1 = [
  {
    id: "allergy_3",
    createdAt: new Date(),
    group: "medication",
    key: "amoxicillin",
    label: "Amoxicillin",
    medicationCode: "123456",
    medicationCodeSystem: "DM_D",
    severity: "unknown",
    updatedAt: new Date(),
    userId: "user_123",
  },
];

export const DIETARY_PREFERENCE_OPTIONS = [
  {
    key: "vegetarian",
    label: "Vegetarian",
  },
  {
    key: "vegan",
    label: "Vegan",
  },
  {
    key: "pescatarian",
    label: "Pescatarian",
  },
  {
    key: "halal",
    label: "Halal",
  },
  {
    key: "kosher",
    label: "Kosher",
  },
  {
    key: "gluten_free",
    label: "Gluten free",
  },
  {
    key: "dairy_free",
    label: "Dairy free",
  },
  {
    key: "egg_free",
    label: "Egg free",
  },
  {
    key: "nut_free",
    label: "Nut free",
  },
  {
    key: "soy_free",
    label: "Soy free",
  },
  {
    key: "low_salt",
    label: "Low salt",
  },
  {
    key: "low_sugar",
    label: "Low sugar",
  },
  {
    key: "low_fat",
    label: "Low fat",
  },
  {
    key: "low_potassium",
    label: "Low potassium",
  },
  {
    key: "low_phosphorus",
    label: "Low phosphorus",
  },
  {
    key: "renal_friendly",
    label: "Renal friendly",
  },
  {
    key: "diabetic_friendly",
    label: "Diabetic friendly",
  },
] as const;

// Storage
const diet_pref1 = [
  {
    id: "diet_pref1",
    createdAt: new Date(),
    group: "dietary_preferences",
    key: "vegetarian",
    label: "Vegetarian",
    updatedAt: new Date(),
    userId: "user_123",
  },
];
// Conditions

const condition1 = {
  code: "709044004",
  codeSystem: "SNOMED_CT",
  createdAt: new Date(),
  group: "condition",
  key: "snomed:709044004",
  label: "Diabetes",
  status: "active",
  updatedAt: new Date(),
};
