export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type MeasurementDoc = {
  kind:
    | "weight"
    | "blood_pressure"
    | "heart_rate"
    | "steps"
    | "exercise"
    | "sleep";
  measuredAt: Date;
  valueKg?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  bpm?: number;
  count?: number;
  durationMin?: number;
};

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

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

    const kind = req.nextUrl.searchParams.get("kind");
    if (
      kind !== "steps" &&
      kind !== "exercise" &&
      kind !== "sleep" &&
      kind !== "blood_pressure"
    ) {
      return bad("Invalid kind", undefined, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const docs = await db
      .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
      .find(
        { patientId, kind },
        {
          projection: {
            _id: 0,
            bpm: 1,
            count: 1,
            diastolicMmHg: 1,
            durationMin: 1,
            kind: 1,
            measuredAt: 1,
            systolicMmHg: 1,
            valueKg: 1,
          },
        },
      )
      .sort({ measuredAt: -1 })
      .limit(365)
      .toArray();

    const byDay = new Map<
      string,
      { measuredAt: Date; value: number | null; value2: number | null }
    >();

    for (const doc of docs) {
      const key = dayKey(doc.measuredAt);
      if (byDay.has(key)) continue;

      let value: number | null = null;
      let value2: number | null = null;
      if (kind === "steps") value = asNumber(doc.count);
      if (kind === "exercise" || kind === "sleep") value = asNumber(doc.durationMin);
      if (kind === "blood_pressure") {
        value = asNumber(doc.systolicMmHg);
        value2 = asNumber(doc.diastolicMmHg);
      }

      byDay.set(key, {
        measuredAt: doc.measuredAt,
        value,
        value2,
      });
    }

    const points = Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([date, item]) => ({
        date,
        measuredAt: item.measuredAt.toISOString(),
        value: item.value,
        value2: item.value2,
      }));

    return ok({ points });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

