import { createHash } from "crypto";

import { ObjectId } from "mongodb";
import {
  CarePlanActivity,
  CarePlanDiagnosis,
  CarePlanDoc as CarePlanDocSchema,
  CarePlanGoal,
  CarePlanTask,
} from "@ckd/core";
import { z } from "zod";

export type CarePlanActivityDoc = z.infer<typeof CarePlanActivity>;
export type CarePlanDiagnosisDoc = z.infer<typeof CarePlanDiagnosis>;
export type CarePlanGoalDoc = z.infer<typeof CarePlanGoal>;
export type CarePlanTaskDoc = z.infer<typeof CarePlanTask>;
export type CarePlanMongoDoc = Omit<z.infer<typeof CarePlanDocSchema>, "patientId"> & {
  _id: ObjectId;
  patientId: ObjectId;
};

const DAY_MS = 24 * 60 * 60 * 1000;

type CarePlanReviewFields = {
  activatedAt?: Date | null;
  reviewLabel?: string | null;
  status: z.infer<typeof CarePlanDocSchema>["status"];
  updatedAt: Date;
};

export function stableCarePlanKey(parts: string[]) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

export function getCarePlanReviewIntervalDays(
  reviewLabel: string | null | undefined,
) {
  switch ((reviewLabel ?? "").trim().toLowerCase()) {
    case "1_week":
      return 7;
    case "2_weeks":
      return 14;
    case "1_month":
      return 30;
    case "3_months":
      return 90;
    default:
      return null;
  }
}

export function getCarePlanNextReviewAt(plan: CarePlanReviewFields) {
  const days = getCarePlanReviewIntervalDays(plan.reviewLabel);
  if (!days) return null;
  const base = plan.activatedAt ?? plan.updatedAt;
  return new Date(base.getTime() + days * DAY_MS);
}

export function isCarePlanReviewDue(plan: CarePlanReviewFields) {
  if (plan.status !== "active") return false;
  const nextReviewAt = getCarePlanNextReviewAt(plan);
  if (!nextReviewAt) return false;
  return nextReviewAt.getTime() <= Date.now();
}

export function makeCarePlanActivityKey(
  type: CarePlanActivityDoc["type"],
  at: Date,
  by: string,
) {
  return `care_plan_activity_${stableCarePlanKey([type, at.toISOString(), by])}`;
}

export function normalizeCarePlanLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function slugifyCarePlanLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

export function buildCarePlanDiagnosisActivityNote(
  diagnoses: Array<{ label: string }>,
) {
  if (!diagnoses.length) return undefined;
  return `Diagnoses linked: ${diagnoses.map((diagnosis) => diagnosis.label).join(", ")}.`;
}
