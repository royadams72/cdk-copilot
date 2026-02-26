export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";

type ReferenceRangeDoc = {
  _id: ObjectId;
  code: string;
  kind: "lab_range";
  label?: string;
  status: "active" | "deprecated" | "disabled";
  unit: string;
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
    const docs = await db
      .collection<ReferenceRangeDoc>("clinical_reference_rules")
      .find(
        { kind: "lab_range", status: "active" },
        {
          projection: {
            _id: 0,
            code: 1,
            kind: 1,
            label: 1,
            status: 1,
            unit: 1,
          },
        },
      )
      .sort({ label: 1, code: 1, unit: 1 })
      .limit(1500)
      .toArray();

    const seen = new Set<string>();
    const items = docs
      .filter((doc) => {
        const key = `${doc.code}::${doc.unit}`;
        if (!doc.code || !doc.unit || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      })
      .map((doc) => ({
        code: doc.code,
        name: doc.label ?? doc.code,
        unit: doc.unit,
      }));

    return ok({ items });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
