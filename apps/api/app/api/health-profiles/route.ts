export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { treeifyError, z } from "zod";

import {
  HealthProfilesCurrent,
  HealthProfilesUpsertRequest,
  ROLES,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

import { getDb } from "@/apps/api/lib/db/mongodb";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { actorTypeFromRole } from "@/apps/api/lib/audit/actors";
import {
  type HealthProfileLedgerEventDoc,
  type HealthProfilesCurrentDoc,
} from "@/apps/api/lib/health-profiles/shared";

import {
  buildCurrentEntries,
  buildLedgerEvents,
  currentDocToFormValues,
} from "./utils";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const current = await db
      .collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent)
      .findOne({ patientId: new ObjectId(caller.patientId) });

    return ok({
      formValues: currentDocToFormValues(current),
      updatedAt: current?.updatedAt ?? null,
    });
  } catch (err: any) {
    return badFromError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = HealthProfilesUpsertRequest.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", treeifyError(parsed.error), 400);
    }

    const db = await getDb();
    const now = new Date();
    const patientId = new ObjectId(caller.patientId);
    const actor = {
      actorType: actorTypeFromRole(caller.role),
      principalId: caller.principalId,
    } as const;

    const previous = await db
      .collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent)
      .findOne({ patientId });

    const currentEntries = buildCurrentEntries(parsed.data);
    const currentDoc = {
      allergies: currentEntries.allergies,
      conditions: currentEntries.conditions,
      createdAt: previous?.createdAt ?? now,
      createdBy: previous?.createdBy ?? actor,
      dietaryPreferences: currentEntries.dietaryPreferences,
      ...(caller.orgId ? { orgId: caller.orgId } : {}),
      patientId,
      updatedAt: now,
      updatedBy: actor,
    } satisfies HealthProfilesCurrentDoc;

    const currentValidation = HealthProfilesCurrent.safeParse({
      ...currentDoc,
      patientId: caller.patientId,
    });
    if (!currentValidation.success) {
      return bad(
        "Validation failed",
        treeifyError(currentValidation.error),
        400,
      );
    }

    const events = buildLedgerEvents({
      actor,
      currentEntries,
      now,
      orgId: caller.orgId,
      patientId,
      previous,
    });

    if (events.length > 0) {
      await db
        .collection<HealthProfileLedgerEventDoc>(
          COLLECTIONS.HealthProfilesLedger,
        )
        .insertMany(events, { ordered: true });
    }

    await db
      .collection<HealthProfilesCurrentDoc>(COLLECTIONS.HealthProfilesCurrent)
      .updateOne(
        { patientId },
        {
          $set: {
            allergies: currentDoc.allergies,
            conditions: currentDoc.conditions,
            dietaryPreferences: currentDoc.dietaryPreferences,
            ...(caller.orgId ? { orgId: caller.orgId } : {}),
            updatedAt: now,
            updatedBy: actor,
          },
          $setOnInsert: {
            createdAt: currentDoc.createdAt,
            createdBy: currentDoc.createdBy,
            patientId,
          },
        },
        { upsert: true },
      );

    return ok(
      {
        eventsWritten: events.length,
        formValues: parsed.data,
        updatedAt: now,
      },
      201,
    );
  } catch (err: any) {
    return badFromError(err);
  }
}
