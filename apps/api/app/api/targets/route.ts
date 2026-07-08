export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import {
  ensurePatientTargetsSeeded,
  isStructuredTargetState,
  resolvePatientWeightKg,
  resolveTargetStateForWeight,
  type StructuredTargetStateLike,
} from "@/apps/api/lib/utils/targets";
import { ROLES } from "@ckd/core";

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

    const requestedDomain = req.nextUrl.searchParams.get("domain");
    const domain =
      requestedDomain === "renal" || requestedDomain === "lifestyle"
        ? requestedDomain
        : null;

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const currentDoc = await ensurePatientTargetsSeeded(db, {
      orgId: caller.orgId,
      patientId,
      seedPrincipalId: caller.principalId,
    });

    if (!currentDoc?.targets) {
      return ok({
        items: [],
        updatedAt: null,
      });
    }

    const weightKg = await resolvePatientWeightKg(db, patientId);

    const items = Object.entries(currentDoc.targets)
      .filter(
        (entry): entry is [string, StructuredTargetStateLike] =>
          isStructuredTargetState(entry[1]) &&
          (domain ? entry[1].domain === domain : true),
      )
      .map(([key, target]) => ({
        key,
        ...resolveTargetStateForWeight(target, weightKg),
      }))
      .sort((left, right) =>
        (left.metric || "").localeCompare(right.metric || ""),
      );

    return ok({
      items,
      updatedAt: currentDoc.updatedAt?.toISOString() ?? null,
      weightKg,
    });
  } catch (err: any) {
    return badFromError(err);
  }
}
