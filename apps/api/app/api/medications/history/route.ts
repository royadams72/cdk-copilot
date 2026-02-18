export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { MedicationEventDoc } from "@/apps/api/lib/utils/medicationsProjection";
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

    const detailEditEventTypes = [
      "name_changed",
      "dose_changed",
      "frequency_changed",
      "route_changed",
      "form_changed",
      "startAt_changed",
      "instructions_changed",
      "dmplusdCode_changed",
      "snomedCode_changed",
      "drugRefId_changed",
    ] as const;
    const detailEdits = await db
      .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
      .find(
        {
          patientId,
          eventType: { $in: [...detailEditEventTypes] },
        },
        {
          projection: {
            _id: 0,
            at: 1,
            medicationId: 1,
            reason: 1,
          },
        },
      )
      .sort({ at: -1 })
      .limit(2000)
      .toArray();

    const editedByMedication = new Map<string, { at?: Date; reason?: string }>();
    for (const ev of detailEdits) {
      const key = ev.medicationId.toString();
      if (!editedByMedication.has(key)) {
        editedByMedication.set(key, { at: ev.at, reason: ev.reason });
      }
    }

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

    const paused = current.filter((d) => d.status === "paused").map(mapHistoryItem);
    const stopped = current.filter((d) => d.status === "stopped").map(mapHistoryItem);
    const completed = current
      .filter((d) => d.status === "completed")
      .map(mapHistoryItem);
    const edited = current
      .filter((d) => editedByMedication.has((d.medicationId ?? d._id).toString()))
      .map((d) => {
        const key = (d.medicationId ?? d._id).toString();
        const editMeta = editedByMedication.get(key);
        const mapped = mapHistoryItem(d);
        return {
          ...mapped,
          latestReason: editMeta?.reason ?? mapped.latestReason,
          updatedAt: editMeta?.at ? editMeta.at.toISOString() : mapped.updatedAt,
        };
      });

    return ok({ completed, edited, paused, stopped });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
