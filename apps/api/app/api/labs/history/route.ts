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
  unit?: string | null;
  value: number | string;
  takenAt: Date;
};

type LabLedgerDoc = {
  _id: ObjectId;
  code: string;
  name: string;
  unit?: string | null;
  value: number | string;
  takenAt: Date;
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
    const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
    const unit = req.nextUrl.searchParams.get("unit")?.trim() ?? "";

    if (!code) {
      const rows = await db
        .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
        .find(
          { patientId },
          { projection: { _id: 1, code: 1, name: 1, takenAt: 1, unit: 1, value: 1 } },
        )
        .sort({ name: 1, takenAt: -1 })
        .toArray();

      return ok({
        items: rows.map((row) => ({
          code: row.code,
          id: row._id.toString(),
          name: row.name,
          takenAt: row.takenAt?.toISOString() ?? null,
          unit: row.unit ?? null,
          value: row.value,
        })),
      });
    }

    const query: any = { code, patientId };
    if (unit) query.unit = unit;

    const points = await db
      .collection<LabLedgerDoc>(COLLECTIONS.LabsLedger)
      .find(query, { projection: { _id: 0, code: 1, name: 1, takenAt: 1, unit: 1, value: 1 } })
      .sort({ takenAt: 1 })
      .limit(500)
      .toArray();

    return ok({
      points: points.map((point) => ({
        code: point.code,
        name: point.name,
        takenAt: point.takenAt?.toISOString() ?? null,
        unit: point.unit ?? null,
        value: point.value,
      })),
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

