// app/api/measurements/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { ObjectId } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const caller = await requireUser(req);
  const patientIdParam =
    new URL(req.url).searchParams.get("patientId") || caller.patientId || null;

  if (!patientIdParam || !ObjectId.isValid(patientIdParam)) {
    return NextResponse.json(
      { ok: false, error: "Patient context missing" },
      { status: 403 },
    );
  }

  const patientId = new ObjectId(patientIdParam);

  const db = await getDb();

  const docs = await db
    .collection(COLLECTIONS.MeasurementsLedger)
    .aggregate([
      { $match: { patientId } },
      { $sort: { measuredAt: 1, receivedAt: 1, _id: 1 } },
      { $group: { _id: "$kind", latest: { $last: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$latest" } },
      { $project: { _id: 0 } },
      { $sort: { kind: 1 } },
    ])
    .toArray();

  return NextResponse.json({ ok: true, data: docs });
}
