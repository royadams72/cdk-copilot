export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { buildPortalPatientAccessMatch } from "@/apps/api/lib/portal/patients";
import { markPortalWorseningSnapshotsReviewed } from "@/apps/api/lib/portal/worseningSnapshots";
import { COLLECTIONS } from "@ckd/core/server";

const ReviewWorseningTrendsBody = z
  .object({
    episodeIds: z.array(z.string().min(1)).max(50).optional(),
    patientIds: z.array(z.string().min(1)).max(50).optional(),
  })
  .refine(
    (value) =>
      Boolean(value.episodeIds?.length) || Boolean(value.patientIds?.length),
    "Provide episodeIds or patientIds",
  );

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const payload = ReviewWorseningTrendsBody.parse(
      await req.json().catch(() => null),
    );
    const db = await getDb();

    let matchedPatientIds: ObjectId[] = [];
    if (payload.patientIds?.length) {
      const requestedIds = payload.patientIds
        .filter((id) => ObjectId.isValid(id))
        .map((id) => new ObjectId(id));

      matchedPatientIds = (
        await db
          .collection(COLLECTIONS.Patients)
          .find(
            {
              $and: [
                buildPortalPatientAccessMatch(caller),
                { _id: { $in: requestedIds } },
              ],
            },
            { projection: { _id: 1 } },
          )
          .toArray()
      ).map((doc) => doc._id);
    } else if (payload.episodeIds?.length) {
      matchedPatientIds = (
        await db
          .collection(COLLECTIONS.WorseningTrendSnapshots)
          .aggregate<{ patientId: ObjectId }>([
            {
              $match: {
                episodeId: { $in: payload.episodeIds },
              },
            },
            {
              $lookup: {
                as: "patient",
                foreignField: "_id",
                from: COLLECTIONS.Patients,
                localField: "patientId",
                pipeline: [{ $match: buildPortalPatientAccessMatch(caller) }],
              },
            },
            {
              $match: {
                "patient.0": { $exists: true },
              },
            },
            {
              $project: {
                _id: 0,
                patientId: 1,
              },
            },
          ])
          .toArray()
      ).map((doc) => doc.patientId);
    }

    if (!matchedPatientIds.length) {
      return bad("No accessible worsening trends matched", undefined, 404);
    }

    const result = await markPortalWorseningSnapshotsReviewed(db, {
      episodeIds: payload.episodeIds,
      patientIds: matchedPatientIds,
      reviewedByPrincipalId: caller.principalId,
      reviewedByRole: caller.role,
    });

    return ok({
      modifiedCount: result.modifiedCount,
      reviewedPatientIds: matchedPatientIds.map((id) => id.toHexString()),
    });
  } catch (error: any) {
    if (error?.name === "ZodError") {
      return bad("Invalid worsening review request", { issues: error.issues }, 400);
    }
    return bad(
      error?.message || "Unable to mark worsening trends as reviewed",
      undefined,
      error?.status || 500,
    );
  }
}
