export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type LabCurrentDoc = {
  _id: ObjectId;
  code: string;
  name: string;
  value: number | string;
  unit?: string | null;
  refRange?: { low?: number | null; high?: number | null; text?: string | null } | null;
  takenAt: Date;
  status: "final" | "corrected" | "preliminary" | "cancelled";
  effectiveAbnormalFlag?: string | null;
  latestReason?: string | null;
  updatedAt?: Date;
  ledgerId?: ObjectId;
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

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const docs = await db
      .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
      .find(
        { patientId },
        {
          projection: {
            _id: 1,
            code: 1,
            effectiveAbnormalFlag: 1,
            ledgerId: 1,
            latestReason: 1,
            name: 1,
            refRange: 1,
            status: 1,
            takenAt: 1,
            unit: 1,
            updatedAt: 1,
            value: 1,
          },
        },
      )
      .sort({ name: 1, updatedAt: -1 })
      .toArray();

    return ok({
      items: docs.map((doc) => ({
        abnormalFlag: doc.effectiveAbnormalFlag ?? null,
        code: doc.code,
        currentId: doc._id.toString(),
        id: doc._id.toString(),
        latestReason: doc.latestReason ?? null,
        ledgerId: doc.ledgerId?.toString() ?? null,
        name: doc.name,
        refRange: {
          high: doc.refRange?.high ?? null,
          low: doc.refRange?.low ?? null,
          text: doc.refRange?.text ?? null,
        },
        status: doc.status,
        takenAt: doc.takenAt?.toISOString() ?? null,
        unit: doc.unit ?? null,
        updatedAt: doc.updatedAt?.toISOString() ?? null,
        value: doc.value,
      })),
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

