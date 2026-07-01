export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { buildPortalPatientAccessMatch } from "@/apps/api/lib/portal/patients";
import { sendPatientPushNotification } from "@/apps/api/lib/utils/pushNotifications";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

const NotifyPortalPatientsBody = z.object({
  body: z.string().trim().min(1).max(240).optional(),
  patientIds: z.array(z.string().min(1)).min(1).max(25),
  title: z.string().trim().min(1).max(80).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const payload = NotifyPortalPatientsBody.parse(await req.json().catch(() => null));
    const requestedIds = payload.patientIds.filter((id) => ObjectId.isValid(id));

    if (!requestedIds.length) {
      return bad("No valid patients supplied", { code: "no_valid_patients" }, 400);
    }

    const db = await getDb();
    const patients = await db
      .collection(COLLECTIONS.Patients)
      .find(
        {
          $and: [
            buildPortalPatientAccessMatch(caller),
            { _id: { $in: requestedIds.map((id) => new ObjectId(id)) } },
          ],
        },
        {
          projection: { _id: 1 },
        },
      )
      .toArray();

    if (!patients.length) {
      return bad("No accessible patients matched", { code: "no_accessible_patients" }, 404);
    }

    const results = await Promise.all(
      patients.map((patient) =>
        sendPatientPushNotification(db, {
          body:
            payload.body ??
            "Your care team would like you to review your recent health information in CKD Copilot.",
          data: {
            screen: "/dashboard",
            type: "clinician-notify",
          },
          patientId: patient._id.toHexString(),
          title: payload.title ?? "Check-in requested",
        }),
      ),
    );

    return ok({
      attemptedPatients: patients.length,
      delivered: results.reduce((sum, result) => sum + result.delivered, 0),
      failed: results.reduce((sum, result) => sum + result.failed, 0),
      notifiedPatientIds: patients.map((patient) => patient._id.toHexString()),
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return bad("Invalid notify request", { issues: error.issues }, 400);
    }
    return bad(error?.message || "Unable to notify patients", undefined, error?.status || 500);
  }
}
