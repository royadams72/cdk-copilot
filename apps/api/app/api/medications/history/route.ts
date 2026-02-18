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
  medicationId?: ObjectId;
  dose?: string;
  frequency?: string;
  latestReason?: string | null;
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
      .collection<MedicationDoc>(COLLECTIONS.MedicationsCurrent)
      .find(
        { patientId },
        {
          projection: {
            _id: 1,
            dose: 1,
            frequency: 1,
            latestReason: 1,
            medicationId: 1,
            name: 1,
            startAt: 1,
            status: 1,
            updatedAt: 1,
          },
        },
      )
      .sort({ updatedAt: -1, startAt: -1 })
      .limit(500)
      .toArray();

    const current = rawDocs as MedicationDoc[];

    const mapHistoryItem = (d: MedicationDoc) => ({
      id: (d.medicationId ?? d._id).toString(),
      dose: d.dose ?? null,
      frequency: d.frequency ?? null,
      latestReason: d.latestReason ?? null,
      name: d.name ?? "Medication",
      startAt: d.startAt ? d.startAt.toISOString() : null,
      status: (d.status ?? "active") as MedicationStatus,
      updatedAt: d.updatedAt ? d.updatedAt.toISOString() : null,
    });
    const items = current.map(mapHistoryItem);
    return ok({ items });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
