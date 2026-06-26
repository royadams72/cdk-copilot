export const runtime = "nodejs";

import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  buildPortalPatientAccessMatch,
  buildPortalPatientStats,
  mapPortalPatientListItemsWithWorsening,
  matchesPortalPatientFilter,
  matchesPortalPatientQuery,
  sortPortalPatients,
} from "@/apps/api/lib/portal/patients";
import { normalizePortalPatientFilter } from "@/apps/api/lib/portal/patient-shared";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

type RawPortalPatientDoc = {
  _id: ObjectId;
  assignments?: Array<{
    careTeamId?: string;
    consentStatus?: string;
    endsAt?: Date | string | null;
    facilityId?: string;
    orgId?: string;
    startsAt?: Date | string | null;
    status?: string;
  }>;
  flags?: string[];
  pii?: {
    dateOfBirth?: Date | string | null;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  stage?: string | null;
  summary?: {
    lastContactAt?: Date | string | null;
    risk?: "green" | "amber" | "red" | null;
  } | null;
};

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const query = req.nextUrl.searchParams.get("q")?.trim() ?? "";
    const filter = normalizePortalPatientFilter(
      req.nextUrl.searchParams.get("filter"),
    );

    const db = await getDb();
    const patients = await db
      .collection(COLLECTIONS.Patients)
      .aggregate<RawPortalPatientDoc>([
        { $match: buildPortalPatientAccessMatch(caller) },
        {
          $lookup: {
            as: "pii",
            foreignField: "patientId",
            from: COLLECTIONS.UsersPII,
            localField: "_id",
            pipeline: [
              {
                $project: {
                  _id: 0,
                  dateOfBirth: 1,
                  email: 1,
                  firstName: 1,
                  lastName: 1,
                },
              },
            ],
          },
        },
        {
          $project: {
            assignments: 1,
            flags: 1,
            pii: { $arrayElemAt: ["$pii", 0] },
            stage: 1,
            summary: 1,
          },
        },
      ])
      .toArray();

    const allPatients = sortPortalPatients(
      await mapPortalPatientListItemsWithWorsening(db, patients),
    );
    const stats = buildPortalPatientStats(allPatients);
    const filteredPatients = allPatients.filter(
      (patient) =>
        matchesPortalPatientQuery(patient, query) &&
        matchesPortalPatientFilter(patient, filter),
    );

    return ok({
      filter,
      matchedPatients: filteredPatients.length,
      patients: filteredPatients,
      query,
      stats,
      totalPatients: allPatients.length,
    });
  } catch (error: any) {
    return bad(error?.message || "Unable to load portal patients", undefined, error?.status || 500);
  }
}
