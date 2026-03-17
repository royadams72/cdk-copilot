import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getMappedNutritionTargets } from "@/apps/api/lib/utils/targets";
import { NutrientKey } from "@/apps/api/lib/types/dashboard";
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

export const DEFAULT_RATIO_THRESHOLD = 12;
export const TRACKED_LABS = [
  {
    id: "egfr",
    codes: ["33914-3"],
    label: "eGFR",
    nameMatch: /egfr/i,
    unitFallback: "mL/min/1.73m²",
  },
  {
    id: "phosphorus",
    codes: ["2777-1", "2778-9"],
    label: "Serum phosphorus",
    nameMatch: /phosph/,
    unitFallback: "mg/dL",
  },
  {
    id: "potassium",
    codes: ["2823-3"],
    label: "Serum potassium",
    nameMatch: /potass/,
    unitFallback: "mmol/L",
  },
] as const;

export const RADIAL_METRICS = [
  { id: "protein", key: "proteinG", label: "Protein", precision: 1, unit: "g" },
  {
    id: "phosphorus",
    key: "phosphorusMg",
    label: "Phosphorus",
    precision: 0,
    unit: "mg",
  },
  {
    id: "potassium",
    key: "potassiumMg",
    label: "Potassium",
    precision: 0,
    unit: "mg",
  },
  {
    id: "sodium",
    key: "sodiumMg",
    label: "Sodium",
    precision: 0,
    unit: "mg",
  },
] as const;

export const ZERO_TOTALS: Record<NutrientKey, number> = {
  caloriesKcal: 0,
  phosphorusMg: 0,
  potassiumMg: 0,
  proteinG: 0,
  sleep_duration_min_day: 0,
  sodiumMg: 0,
  steps_per_day: 0,
  weight_kg: 0,
};
export const DAY_MS = 24 * 60 * 60 * 1000;
export const FOOD_HIGHLIGHT_LIMIT = 5;

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
      getMappedNutritionTargets(db, patientObjectId),
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
