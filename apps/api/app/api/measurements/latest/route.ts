// app/api/measurements/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { ObjectId } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";

export const runtime = "nodejs";

const MEASUREMENT_KINDS = [
  "blood_pressure",
  "exercise",
  "heart_rate",
  "sleep",
  "steps",
  "weight",
] as const;

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
  const collection = db.collection(COLLECTIONS.MeasurementsLedger);
  const results = await Promise.all(
    MEASUREMENT_KINDS.map((kind) =>
      collection.findOne(
        { kind, patientId },
        { projection: { _id: 0 }, sort: { measuredAt: -1, receivedAt: -1 } },
      ),
    ),
  );
  const docs = results
    .filter((doc) => doc !== null)
    .sort((a, b) => String(a.kind).localeCompare(String(b.kind)));

  return NextResponse.json({ ok: true, data: docs });
}
