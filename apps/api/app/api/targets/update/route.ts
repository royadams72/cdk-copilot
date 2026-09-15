export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { targetActorTypeFromRole } from "@/apps/api/lib/audit/actors";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { ROLES, TargetActor, TargetDefinition } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { isUsableTargetDefinition } from "@/apps/api/lib/utils/targets";

type TargetDefinitionValue = {
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  type: "range" | "max" | "min" | "exact";
  value?: number | null;
};

type TargetMeta = {
  reason?: string | null;
  setAt: Date;
  setBy: {
    actorType: "user" | "clinician" | "system";
    displayName?: string | null;
    principalId: string;
  };
} | null;

type TargetMetricState = {
  careTeamTarget?: TargetDefinitionValue | null;
  careTeamTargetMeta?: TargetMeta;
  derivedFrom?: {
    matchedAt?: Date;
    ruleId: string;
    version: number;
  } | null;
  domain: "renal" | "lifestyle";
  effective: TargetDefinitionValue | null;
  generalReferenceSelected?: boolean;
  metric: string;
  override?: TargetDefinitionValue | null;
  overrideMeta?: TargetMeta;
  personalGoal?: TargetDefinitionValue | null;
  personalGoalMeta?: TargetMeta;
  recommended: TargetDefinitionValue;
  unit: string;
};

type TargetsCurrentDoc = {
  _id: ObjectId;
  orgId: string;
  patientId: ObjectId;
  targets: Record<string, TargetMetricState>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function formatMongoValidationMessage(err: any) {
  if (!err || err?.code !== 121) return err?.message || "Server error";
  const details = err?.errInfo?.details;
  if (!details) return err?.message || "Document failed validation";
  try {
    return `Document failed validation: ${JSON.stringify(details)}`;
  } catch {
    return err?.message || "Document failed validation";
  }
}

function definitionsEqual(
  left: TargetDefinitionValue | null | undefined,
  right: TargetDefinitionValue | null | undefined,
) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export async function PATCH(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const metric = cleanText(body.metric);
    const reason = cleanText(body.reason) || null;
    const clearOverride = body.clearOverride === true;
    const selectGeneralReference = body.selectGeneralReference === true;
    const clearTarget = body.clearTarget === true;

    if (!metric) {
      return bad("Metric is required", { requestId }, 400);
    }
    if (!clearOverride && !selectGeneralReference && !clearTarget && !isRecord(body.override)) {
      return bad(
        "Override is required unless clearOverride is true",
        { requestId },
        400,
      );
    }

    const overrideResult = clearOverride || selectGeneralReference || clearTarget
      ? { data: null as TargetDefinitionValue | null, success: true as const }
      : TargetDefinition.safeParse(body.override);
    if (!overrideResult.success) {
      return bad(
        "Invalid target override",
        { issues: overrideResult.error.flatten(), requestId },
        400,
      );
    }
    if (overrideResult.data && !isUsableTargetDefinition(overrideResult.data)) {
      return bad("Target values must be above zero (and ranges must be increasing)", { requestId }, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const currentCollection = db.collection<TargetsCurrentDoc>(
      COLLECTIONS.TargetsCurrent,
    );
    const ledgerCollection = db.collection(COLLECTIONS.TargetsLedger);
    const currentDoc = await currentCollection.findOne({
      orgId: caller.orgId ?? "org_demo",
      patientId,
    });

    if (!currentDoc) {
      return bad("Targets not found", { requestId }, 404);
    }

    const existingState = currentDoc.targets?.[metric];
    if (!existingState) {
      return bad("Target metric not found", { metric, requestId }, 404);
    }

    const actorResult = TargetActor.safeParse({
      actorType: targetActorTypeFromRole(caller.role),
      displayName: null,
      principalId: caller.principalId,
    });
    if (!actorResult.success) {
      return bad("Invalid actor context", { requestId }, 400);
    }
    const actor = actorResult.data;

    const now = new Date();
    const legacyCareTeamTarget =
      existingState.overrideMeta?.setBy.actorType === "clinician"
        ? (existingState.override ?? null)
        : null;
    const legacyPersonalGoal =
      existingState.overrideMeta?.setBy.actorType === "user"
        ? (existingState.override ?? null)
        : null;
    const careTeamTarget =
      existingState.careTeamTarget ?? legacyCareTeamTarget;
    const careTeamTargetMeta =
      existingState.careTeamTargetMeta ??
      (legacyCareTeamTarget ? existingState.overrideMeta : null);
    const existingPersonalGoal =
      existingState.personalGoal ?? legacyPersonalGoal;
    const nextPersonalGoal = clearOverride || selectGeneralReference || clearTarget ? null : overrideResult.data;
    const generalReferenceSelected = selectGeneralReference
      ? true
      : clearTarget
        ? false
        : existingState.generalReferenceSelected !== false;
    const personalGoalMeta = clearOverride || selectGeneralReference || clearTarget
      ? null
      : { reason, setAt: now, setBy: actor };
    const nextEffective =
      careTeamTarget ?? nextPersonalGoal ??
      (generalReferenceSelected ? existingState.recommended : null);
    const nextOverride = careTeamTarget ?? nextPersonalGoal;
    const nextOverrideMeta = careTeamTarget
      ? careTeamTargetMeta
      : personalGoalMeta;
    const eventType = clearOverride || clearTarget
      ? "manual_target_removed"
      : "user_changed_target";

    if (
      definitionsEqual(existingPersonalGoal, nextPersonalGoal) &&
      (existingState.generalReferenceSelected !== false) === generalReferenceSelected
    ) {
      return ok({
        metric,
        target: { key: metric, ...existingState },
        updated: false,
      });
    }

    const nextState: TargetMetricState = {
      ...existingState,
      careTeamTarget,
      careTeamTargetMeta,
      effective: nextEffective,
      generalReferenceSelected,
      override: nextOverride,
      overrideMeta: nextOverrideMeta,
      personalGoal: nextPersonalGoal,
      personalGoalMeta,
    };

    await ledgerCollection.insertOne({
      after: selectGeneralReference ? existingState.recommended : nextPersonalGoal,
      before: existingPersonalGoal ??
        (existingState.generalReferenceSelected !== false ? existingState.recommended : null),
      createdAt: now,
      createdBy: actor,
      derivedFrom: existingState.derivedFrom ?? null,
      domain: existingState.domain,
      eventType,
      metric,
      orgId: currentDoc.orgId,
      patientId,
      reason,
      superseded: false,
    });

    await currentCollection.updateOne(
      { _id: currentDoc._id },
      {
        $set: {
          [`targets.${metric}`]: nextState,
          updatedAt: now,
          updatedBy: actor,
        },
      },
    );

    return ok({
      metric,
      target: { key: metric, ...nextState },
      updated: true,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(formatMongoValidationMessage(err), { requestId }, status);
  }
}
