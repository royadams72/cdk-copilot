import {
  ConditionFormItem,
  HealthProfileCurrentEntry,
  HealthProfileLedgerEvent,
  HealthProfilesCurrent,
  ROLES,
} from "@ckd/core";
import { ObjectId } from "mongodb";
import { z } from "zod";

import {
  normalizeCarePlanLabel,
  stableCarePlanKey,
} from "@/apps/api/lib/care-plans/shared";

type TConditionFormItem = z.infer<typeof ConditionFormItem>;
type THealthProfileCurrentEntry = z.infer<typeof HealthProfileCurrentEntry>;
type THealthProfilesCurrent = z.infer<typeof HealthProfilesCurrent>;
type THealthProfileLedgerEvent = z.infer<typeof HealthProfileLedgerEvent>;

export type HealthProfilesCurrentDoc = Omit<THealthProfilesCurrent, "patientId"> & {
  patientId: ObjectId;
};

export type HealthProfileLedgerEventDoc = Omit<
  THealthProfileLedgerEvent,
  "_id" | "correctionOf" | "patientId"
> & {
  _id: ObjectId;
  correctionOf?: ObjectId | null;
  patientId: ObjectId;
};

export type ConditionCurrentEntry = THealthProfileCurrentEntry & {
  value: { condition: TConditionFormItem; kind: "condition" };
};

export const makeStableProfileKey = stableCarePlanKey;
export const normalizeProfileLabel = normalizeCarePlanLabel;

export function actorTypeFromRole(role: string) {
  if (role === ROLES.Patient) return "patient";
  if (role === ROLES.Clinician) return "clinician";
  if (role === ROLES.Dietitian) return "dietitian";
  if (role === "admin") return "admin";
  return "system";
}

export function makeConditionEntryId(item: TConditionFormItem) {
  return `hp_condition_${stableCarePlanKey([
    item.codeSystem,
    item.code,
    normalizeCarePlanLabel(item.label),
  ])}`;
}

export function toConditionCurrentEntry(
  condition: TConditionFormItem,
): ConditionCurrentEntry {
  return {
    entryId: makeConditionEntryId(condition),
    value: { condition, kind: "condition" },
  };
}
