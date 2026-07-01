export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { buildPortalPatientAccessMatch } from "@/apps/api/lib/portal/patients";
import { loadReviewedPortalWorseningItems } from "@/apps/api/lib/portal/worseningSnapshots";
import { COLLECTIONS } from "@ckd/core/server";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(_req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", undefined, 400);
    }

    const db = await getDb();
    const objectId = new ObjectId(patientId);
    const patient = await db.collection(COLLECTIONS.Patients).findOne(
      {
        $and: [buildPortalPatientAccessMatch(caller), { _id: objectId }],
      },
      { projection: { _id: 1 } },
    );

    if (!patient) {
      return bad("Patient not found", undefined, 404);
    }

    const items = await loadReviewedPortalWorseningItems(db, objectId);
    return ok({ items, patientId });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load reviewed worsening trends",
      undefined,
      error?.status || 500,
    );
  }
}
