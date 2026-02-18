export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type MedicationStatus = "active" | "paused" | "stopped" | "completed";

type MedicationDoc = {
  _id: ObjectId;
  dose?: string;
  frequency?: string;
  name?: string;
  patientId: ObjectId;
  startAt?: Date | null;
  status?: MedicationStatus;
  updatedAt?: Date;
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
    const rawDocs = await db
      .collection<MedicationDoc>(COLLECTIONS.MedicationsLedger)
      .find(
        { patientId },
        {
          projection: {
            _id: 1,
            dose: 1,
            frequency: 1,
            name: 1,
            startAt: 1,
            status: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ startAt: -1, updatedAt: -1 })
      .limit(500)
      .toArray();

    const events = rawDocs as MedicationDoc[];

    const paused = events.filter((d) => d.status === "paused");
    const stopped = events.filter((d) => d.status === "stopped");
    const completed = events.filter((d) => d.status === "completed");

    return ok({ completed, paused, stopped });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
