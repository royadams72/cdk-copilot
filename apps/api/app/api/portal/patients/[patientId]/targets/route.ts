export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  buildPortalPatientAccessMatch,
  buildPortalPatientDetailPipeline,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import {
  ensurePatientTargetsSeeded,
  findTargetsCurrentDoc,
  isStructuredTargetState,
} from "@/apps/api/lib/utils/targets";
import { TargetActor, TargetDefinition } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type TargetDefinitionValue = {
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
  type: "range" | "max" | "min" | "exact";
  value?: number | null;
};

type TargetMetricState = {
  derivedFrom?: {
    matchedAt?: Date;
    ruleId: string;
    version: number;
  } | null;
  domain: "renal" | "lifestyle";
  effective: TargetDefinitionValue;
  metric: string;
  override?: TargetDefinitionValue | null;
  overrideMeta?: {
    reason?: string | null;
    setAt: Date;
    setBy: {
      actorType: "user" | "clinician" | "system";
      displayName?: string | null;
      principalId: string;
    };
  } | null;
  recommended: TargetDefinitionValue;
  unit: string;
};

type TargetsCurrentDoc = {
  _id: ObjectId;
  orgId?: string | null;
  patientId: ObjectId | string;
  targets: Record<string, TargetMetricState>;
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function humanizeMetric(metric: string) {
  const labels: Record<string, string> = {
    caloriesKcal: "Calories",
    phosphorusMg: "Phosphorus",
    potassiumMg: "Potassium",
    proteinG: "Protein",
    sleep_duration_min_day: "Sleep duration",
    sodiumMg: "Sodium",
    steps_per_day: "Steps",
    weight_kg: "Weight",
  };
  return labels[metric] ?? metric.replace(/_/g, " ");
}

function definitionsEqual(
  left: TargetDefinitionValue | null | undefined,
  right: TargetDefinitionValue | null | undefined,
) {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

async function loadAccessiblePatient(
  req: NextRequest,
  patientId: string,
) {
  const caller = await requireUser(req);
  if (caller.role === "patient") {
    return {
      caller,
      error: bad("Portal staff session required", { code: "portal_staff_required" }, 403),
      patient: null,
      patientObjectId: null,
    };
  }

  if (!ObjectId.isValid(patientId)) {
    return {
      caller,
      error: bad("Invalid patient id", { code: "invalid_patient_id" }, 400),
      patient: null,
      patientObjectId: null,
    };
  }

  const db = await getDb();
  const patientObjectId = new ObjectId(patientId);
  const patient = await db
    .collection(COLLECTIONS.Patients)
    .aggregate<RawPortalPatientDetailDoc>(
      buildPortalPatientDetailPipeline({
        ...buildPortalPatientAccessMatch(caller),
        _id: patientObjectId,
      }),
    )
    .next();

  if (!patient) {
    return {
      caller,
      error: bad("Patient not found", { code: "patient_not_found" }, 404),
      patient: null,
      patientObjectId: null,
    };
  }

  return { caller, db, error: null, patient, patientObjectId };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const { patientId } = await context.params;
    const loaded = await loadAccessiblePatient(req, patientId);
    if (loaded.error || !loaded.db || !loaded.patient || !loaded.patientObjectId) {
      return loaded.error;
    }

    await ensurePatientTargetsSeeded(loaded.db, {
      orgId: loaded.caller.orgId,
      patientId: loaded.patientObjectId,
      seedPrincipalId: loaded.caller.principalId,
    });
    const currentDoc = (await findTargetsCurrentDoc(
      loaded.db,
      loaded.patientObjectId,
    )) as TargetsCurrentDoc | null;

    const items = Object.entries(currentDoc?.targets ?? {})
      .filter(([, state]) => isStructuredTargetState(state))
      .sort(([left], [right]) => humanizeMetric(left).localeCompare(humanizeMetric(right)))
      .map(([metric, state]) => ({
        domain: state.domain,
        label: humanizeMetric(metric),
        metric,
        state: {
          effective: state.effective,
          override: state.override ?? null,
          overrideMeta: state.overrideMeta
            ? {
                reason: state.overrideMeta.reason ?? null,
                setAt: state.overrideMeta.setAt.toISOString(),
                setBy: state.overrideMeta.setBy,
              }
            : null,
          recommended: state.recommended,
          unit: state.unit,
        },
      }));

    return ok({
      items,
      patient: mapPortalPatientDetail(loaded.patient),
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load patient targets",
      undefined,
      error?.status || 500,
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const { patientId } = await context.params;
    const loaded = await loadAccessiblePatient(req, patientId);
    if (loaded.error || !loaded.db || !loaded.patientObjectId) {
      return loaded.error;
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const metric = cleanText(body.metric);
    const reason = cleanText(body.reason) || null;
    const clearOverride = body.clearOverride === true;

    if (!metric) {
      return bad("Metric is required", undefined, 400);
    }
    if (!clearOverride && typeof body.override !== "object") {
      return bad("Override is required unless clearOverride is true", undefined, 400);
    }

    await ensurePatientTargetsSeeded(loaded.db, {
      orgId: loaded.caller.orgId,
      patientId: loaded.patientObjectId,
      seedPrincipalId: loaded.caller.principalId,
    });

    const currentCollection = loaded.db.collection<TargetsCurrentDoc>(
      COLLECTIONS.TargetsCurrent,
    );
    const ledgerCollection = loaded.db.collection(COLLECTIONS.TargetsLedger);
    const currentDoc = (await findTargetsCurrentDoc(
      loaded.db,
      loaded.patientObjectId,
    )) as TargetsCurrentDoc | null;

    if (!currentDoc) {
      return bad("Targets not found", undefined, 404);
    }

    const existingState = currentDoc.targets?.[metric];
    if (!isStructuredTargetState(existingState)) {
      return bad("Target metric not found", { metric }, 404);
    }

    const overrideResult = clearOverride
      ? { data: null as TargetDefinitionValue | null, success: true as const }
      : TargetDefinition.safeParse(body.override);
    if (!overrideResult.success) {
      return bad(
        "Invalid target override",
        { issues: overrideResult.error.flatten() },
        400,
      );
    }

    const actorResult = TargetActor.safeParse({
      actorType: "clinician",
      displayName: null,
      principalId: loaded.caller.principalId,
    });
    if (!actorResult.success) {
      return bad("Invalid actor context", undefined, 400);
    }

    const now = new Date();
    const actor = actorResult.data;
    const nextOverride = clearOverride ? null : overrideResult.data;
    const nextEffective = nextOverride ?? existingState.recommended;
    const eventType = clearOverride
      ? "manual_target_removed"
      : "clinician_changed_target";

    if (
      definitionsEqual(existingState.override, nextOverride) &&
      definitionsEqual(existingState.effective, nextEffective)
    ) {
      return ok({ metric, updated: false });
    }

    const nextState: TargetMetricState = {
      ...existingState,
      effective: nextEffective,
      override: nextOverride,
      overrideMeta: clearOverride
        ? null
        : {
            reason,
            setAt: now,
            setBy: actor,
          },
    };

    await ledgerCollection.insertOne({
      after: nextEffective,
      before: existingState.effective ?? null,
      createdAt: now,
      createdBy: actor,
      derivedFrom: existingState.derivedFrom ?? null,
      domain: existingState.domain,
      eventType,
      metric,
      orgId: currentDoc.orgId ?? loaded.caller.orgId ?? "org_demo",
      patientId: loaded.patientObjectId,
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

    return ok({ metric, updated: true });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to update patient targets",
      undefined,
      error?.status || 500,
    );
  }
}
