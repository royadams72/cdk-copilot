import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { DAY_MS } from "@/apps/api/lib/constants/dashboard";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import {
  fetchNutritionEntries,
  fetchRecentLabs,
  fetchRecentMedications,
  normaliseNumber,
  summarizeLabs,
  summarizeMedications,
  summarizeNutrition,
} from "@/apps/api/lib/utils/dashboard";
export const runtime = "nodejs";

type UserClinicalSummaryDoc = {
  ckdStage?: string | null;
  dialysisStatus?: string | null;
  egfrCurrent?: number | null;
  lastClinicalUpdateAt?: Date | null;
};

export async function GET(req: NextRequest) {
  try {
    // Patients only have the default auth scopes, so rely on role + patient context.
    const caller = await requireUser(req);

    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }
    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);

    const [
      clinicalDoc,
      labDocs,
      nutritionDocs,
      medicationDocs,
      nutritionTargets,
    ] = await Promise.all([
      db.collection<UserClinicalSummaryDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        {
          projection: {
            ckdStage: 1,
            dialysisStatus: 1,
            egfrCurrent: 1,
            lastClinicalUpdateAt: 1,
          },
        },
      ),
      fetchRecentLabs(db, patientObjectId),
      fetchNutritionEntries(db, patientObjectId),
      fetchRecentMedications(db, patientObjectId),
      getMappedNutritionTargets(db, patientObjectId, {
        orgId: caller.orgId,
        seedPrincipalId: caller.principalId,
      }),
    ]);

    const scope = req.nextUrl.searchParams.get("scope");
    const normalizedScope = scope === "all" ? "all" : "today";
    const rangeEnd = new Date();
    let rangeStart = new Date(rangeEnd);
    rangeStart.setHours(0, 0, 0, 0);
    let rangeDays = 1;

    if (normalizedScope === "all" && nutritionDocs.length > 0) {
      const earliest = nutritionDocs.reduce<Date | null>((acc, entry) => {
        const entryDate = entry.eatenAt ?? entry.createdAt ?? null;
        if (!entryDate) return acc;
        if (!acc || entryDate < acc) return entryDate;
        return acc;
      }, null);

      if (earliest) {
        rangeStart = new Date(earliest);
        rangeStart.setHours(0, 0, 0, 0);
        const diffMs = rangeEnd.getTime() - rangeStart.getTime();
        rangeDays = Math.max(1, Math.floor(diffMs / DAY_MS) + 1);
      }
    }

    const labs = summarizeLabs(labDocs);
    const nutrition = summarizeNutrition(
      nutritionDocs,
      nutritionTargets,
      rangeStart,
      rangeEnd,
      rangeDays,
    );
    const medications = summarizeMedications(medicationDocs);

    return ok({
      labs,
      medications,
      nutrition,
      patientId: caller.patientId,
      summary: {
        ckdStage: clinicalDoc?.ckdStage ?? null,
        egfrCurrent: normaliseNumber(clinicalDoc?.egfrCurrent),
        dialysisStatus: clinicalDoc?.dialysisStatus ?? null,
        lastClinicalUpdateAt: clinicalDoc?.lastClinicalUpdateAt
          ? clinicalDoc.lastClinicalUpdateAt.toISOString()
          : null,
      },
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
