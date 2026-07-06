/**
 * Central registry of MongoDB collection names.
 * Keep values in snake_case (actual Mongo names) and keys in PascalCase.
 */
import type { Collection, Db, Document as MongoDocument } from "mongodb";

export const COLLECTIONS = {
  AppErrorLogs: "app_error_logs",

  AuthCodes: "auth_codes",
  AuthCredentials: "auth_credentials",
  AuthLinks: "auth_links",
  AuthTokens: "auth_tokens",

  CarePlans: "care_plans",
  CareTeams: "care_teams",

  DrugsRef: "drugs_ref",

  EmailVerifications: "email_verifications",

  Facilities: "facilities",

  FitPlans: "fit_plans",

  ClinicalReferenceRules: "clinical_reference_rules",
  HealthConnectEventLogs: "health_connect_event_logs",
  ExerciseReference: "exercise_reference",
  HealthConnectSyncState: "health_connect_sync_state",
  FoodSwapRules: "food_swap_rules",
  FoodTaxonomy: "food_taxonomy",
  HealthProfilesCurrent: "health_profiles_current",
  HealthProfilesLedger: "health_profiles_ledger",
  LabsLedger: "labs_ledger",
  LabsCurrent: "labs_current",
  // Deprecated alias kept for compatibility while callers migrate.
  LabsReferenceRanges: "labs_reference_ranges",
  MeasurementsLedger: "measurements_ledger",
  MedicationsCurrent: "medications_current",
  MedicationsLedger: "medications_ledger",
  NutritionFavourites: "nutrition_favourites",
  NutritionLedger: "nutrition_ledger",
  WeeklyNutritionInsights: "weekly_nutrition_insights",
  WorseningTrendCheckIns: "worsening_trend_check_ins",
  WorseningTrendSnapshots: "worsening_trend_snapshots",
  WorseningTrendStates: "worsening_trend_states",
  TargetsCurrent: "targets_current",
  TargetsLedger: "targets_ledger",
  SymptomsCurrent: "symptoms_current",
  SymptomsLedger: "symptoms_ledger",

  Orgs: "orgs",
  PatientGoalsCurrent: "patient_goals_current",
  PatientGoalsLedger: "patient_goals_ledger",
  PatientEngagementLedger: "patient_engagement_ledger",
  PatientMembershipEvents: "patient_membership_events",
  PatientConsents: "patient_consents",
  PatientInvites: "patient_invites",
  Patients: "patients",

  UsersAccounts: "users_accounts",
  UsersClinical: "users_clinical",
  UsersPII: "users_pii",
  UsersStaff: "users_staff",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Type guard for unknown → CollectionName */
export function isCollectionName(x: string): x is CollectionName {
  return (Object.values(COLLECTIONS) as string[]).includes(x);
}

/** Helper: typed access to a collection */
type Projection<T extends MongoDocument, K extends keyof T = keyof T> = {
  [P in K]: 1;
} & { _id?: 0 | 1 };

// Overload 1: plain collection
export function getCollection<T extends MongoDocument>(
  db: Db,
  name: CollectionName,
): Collection<T>;

// Overload 2: collection + projection helper
export function getCollection<T extends MongoDocument, K extends keyof T>(
  db: Db,
  name: CollectionName,
  fields: readonly K[],
): { collection: Collection<T>; projection: Projection<T, K> };

export function getCollection<T extends MongoDocument, K extends keyof T>(
  db: Db,
  name: CollectionName,
  fields?: readonly K[],
) {
  const collection = db.collection<T>(name);

  if (!fields) {
    return collection;
  }

  const projection = fields.reduce(
    (proj, field) => {
      (proj as any)[field as string] = 1;
      return proj;
    },
    {} as Record<string, 1>,
  ) as Projection<T, K>;

  return { collection, projection };
}
