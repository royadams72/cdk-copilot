/**
 * Central registry of MongoDB collection names.
 * Keep values in snake_case (actual Mongo names) and keys in PascalCase.
 */
import type { Db, Collection, Document as MongoDocument } from "mongodb";

export const COLLECTIONS = {
  UsersPII: "users_pii", // personally identifiable information
  UsersAuth: "users_auth", // auth profiles / credentials (no secrets in code)
  Patients: "patients",
  Orgs: "orgs", // organisations
  Encounters: "encounters", // clinical visits/interactions
  Appointments: "appointments",
  LabResults: "lab_results",
  Notes: "notes",
  Messages: "messages",
  Consents: "consents",
  AuditLogs: "audit_logs",
  Sessions: "sessions",
  ApiKeys: "api_keys",
  FeatureFlags: "feature_flags",
  Files: "files", // uploads/attachments
  Migrations: "migrations", // applied migration records
  AuthTokens: "auth_tokens",
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Type guard for unknown → CollectionName */
export function isCollectionName(x: string): x is CollectionName {
  return (Object.values(COLLECTIONS) as string[]).includes(x);
}

/** Helper: typed access to a collection */

export function getCollection<T extends MongoDocument>(
  db: Db,
  name: CollectionName
): Collection<T> {
  return db.collection<T>(name);
}
