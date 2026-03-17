export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  resolvePatientWeightKg,
  resolveTargetStateForWeight,
} from "@/apps/api/lib/utils/targets";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type TargetDefinitionValue = {
  type: "range" | "max" | "min" | "exact";
  basis?: "perDay" | "perKgPerDay" | null;
  high?: number | null;
  low?: number | null;
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
  targets?: Record<string, TargetMetricState>;
  updatedAt?: Date | null;
};

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
    const currentDoc = await db
      .collection<TargetsCurrentDoc>(COLLECTIONS.TargetsCurrent)
      .findOne(
        {
          patientId,
          targets: { $exists: true, $type: "object" },
        },
        {
          projection: { targets: 1, updatedAt: 1 },
          sort: { updatedAt: -1, _id: -1 },
        },
      );

    if (!currentDoc?.targets) {
      return ok({
        items: [],
        updatedAt: null,
      });
    }

    const weightKg = await resolvePatientWeightKg(db, patientId);

    const items = Object.entries(currentDoc.targets)
      .filter(([, target]) => (domain ? target.domain === domain : true))
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
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
