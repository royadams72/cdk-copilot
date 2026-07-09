export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import {
  actorTypeFromRole,
  makeConditionEntryId,
  toConditionCurrentEntry,
  type HealthProfileLedgerEventDoc,
  type HealthProfilesCurrentDoc,
} from "@/apps/api/lib/health-profiles/shared";
import {
  buildPortalPatientAccessMatch,
  buildPortalPatientDetailPipeline,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import {
  ConditionFormItem,
  HealthProfilesCurrent,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { treeifyError } from "zod";

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
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

    const current = await loaded.db
      .collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent)
      .findOne({ patientId: loaded.patientObjectId });

    return ok({
      items: (current?.conditions ?? [])
        .map((entry) => ({
          code: entry.value.condition.code,
          codeSystem: entry.value.condition.codeSystem,
          entryId: entry.entryId,
          label: entry.value.condition.label,
          notes: entry.value.condition.notes ?? null,
          status: entry.value.condition.status,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
      patient: mapPortalPatientDetail(loaded.patient),
    });
  } catch (error: any) {
    return badFromError(error, "Unable to load patient diagnoses");
  }
}

export async function POST(
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
    const rawLabel = cleanText(body.label);
    const rawCode = cleanText(body.code);
    const rawCodeSystem = cleanText(body.codeSystem);
    const rawNotes = cleanText(body.notes) || null;
    const conditionResult = ConditionFormItem.safeParse({
      code: rawCode || `custom:${makeConditionEntryId({
        code: rawLabel || "custom",
        codeSystem: "CUSTOM",
        label: rawLabel || "Custom diagnosis",
        notes: rawNotes ?? undefined,
        status: "active",
      })}`,
      codeSystem: rawCodeSystem || (rawCode ? "SNOMED_CT" : "CUSTOM"),
      label: rawLabel,
      notes: rawNotes ?? undefined,
      status: "active",
    });
    if (!conditionResult.success) {
      return bad("Validation failed", treeifyError(conditionResult.error), 400);
    }

    const currentCollection = loaded.db.collection<HealthProfilesCurrentDoc>(
      COLLECTIONS.HealthProfilesCurrent,
    );
    const ledgerCollection = loaded.db.collection<HealthProfileLedgerEventDoc>(
      COLLECTIONS.HealthProfilesLedger,
    );
    const current = await currentCollection.findOne({
      patientId: loaded.patientObjectId,
    });
    const actor = {
      actorType: actorTypeFromRole(loaded.caller.role),
      principalId: loaded.caller.principalId,
    } as const;
    const now = new Date();
    const nextEntry = toConditionCurrentEntry(conditionResult.data);
    const existingConditions = current?.conditions ?? [];

    if (
      existingConditions.some(
        (entry) =>
          entry.entryId === nextEntry.entryId ||
          entry.value.condition.label.trim().toLowerCase() ===
            conditionResult.data.label.trim().toLowerCase(),
      )
    ) {
      return ok({ added: false, item: nextEntry.value.condition });
    }

    const nextConditions = [...existingConditions, nextEntry].sort((a, b) =>
      a.entryId.localeCompare(b.entryId),
    );
    const currentValidation = HealthProfilesCurrent.safeParse({
      allergies: current?.allergies ?? [],
      conditions: nextConditions,
      createdAt: current?.createdAt ?? now,
      createdBy: current?.createdBy ?? actor,
      dietaryPreferences: current?.dietaryPreferences ?? [],
      orgId: loaded.caller.orgId ?? current?.orgId,
      patientId,
      updatedAt: now,
      updatedBy: actor,
    });
    if (!currentValidation.success) {
      return bad("Validation failed", treeifyError(currentValidation.error), 400);
    }

    await ledgerCollection.insertOne({
      _id: new ObjectId(),
      after: nextEntry.value,
      before: null,
      createdAt: now,
      createdBy: actor,
      entryId: nextEntry.entryId,
      eventType: "created",
      ...(loaded.caller.orgId ? { orgId: loaded.caller.orgId } : {}),
      patientId: loaded.patientObjectId,
      superseded: false,
    });

    await currentCollection.updateOne(
      { patientId: loaded.patientObjectId },
      {
        $set: {
          conditions: nextConditions,
          ...(loaded.caller.orgId ? { orgId: loaded.caller.orgId } : {}),
          updatedAt: now,
          updatedBy: actor,
        },
        $setOnInsert: {
          allergies: current?.allergies ?? [],
          createdAt: current?.createdAt ?? now,
          createdBy: current?.createdBy ?? actor,
          dietaryPreferences: current?.dietaryPreferences ?? [],
          patientId: loaded.patientObjectId,
        },
      },
      { upsert: true },
    );

    return ok({ added: true, item: nextEntry.value.condition }, 201);
  } catch (error: any) {
    return badFromError(error, "Unable to add diagnosis");
  }
}

export async function DELETE(
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
    const entryId = cleanText(body.entryId);
    if (!entryId) {
      return bad("entryId is required", undefined, 400);
    }

    const currentCollection = loaded.db.collection<HealthProfilesCurrentDoc>(
      COLLECTIONS.HealthProfilesCurrent,
    );
    const ledgerCollection = loaded.db.collection<HealthProfileLedgerEventDoc>(
      COLLECTIONS.HealthProfilesLedger,
    );
    const current = await currentCollection.findOne({
      patientId: loaded.patientObjectId,
    });
    const existing = (current?.conditions ?? []).find((entry) => entry.entryId === entryId);
    if (!existing) {
      return bad("Diagnosis not found", undefined, 404);
    }

    const actor = {
      actorType: actorTypeFromRole(loaded.caller.role),
      principalId: loaded.caller.principalId,
    } as const;
    const now = new Date();
    const nextConditions = (current?.conditions ?? []).filter(
      (entry) => entry.entryId !== entryId,
    );

    await ledgerCollection.insertOne({
      _id: new ObjectId(),
      after: null,
      before: existing.value,
      createdAt: now,
      createdBy: actor,
      entryId,
      eventType: "removed",
      ...(loaded.caller.orgId ? { orgId: loaded.caller.orgId } : {}),
      patientId: loaded.patientObjectId,
      superseded: false,
    });

    await currentCollection.updateOne(
      { patientId: loaded.patientObjectId },
      {
        $set: {
          conditions: nextConditions,
          updatedAt: now,
          updatedBy: actor,
        },
      },
    );

    return ok({ removed: true });
  } catch (error: any) {
    return badFromError(error, "Unable to remove diagnosis");
  }
}
