import { NextRequest } from "next/server";
import { ObjectId, type Db } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ok, bad } from "@/apps/api/lib/http/responses";
import { ROLES, TUserClinicalSummary } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { NutrientKey } from "@/apps/api/lib/types/dashboard";
import {
  fetchRecentLabs,
  fetchNutritionEntries,
  summarizeLabs,
  summarizeNutrition,
  normaliseNumber,
} from "@/apps/api/lib/utils/dashboard";
export const runtime = "nodejs";

export const DEFAULT_RATIO_THRESHOLD = 12;
export const TRACKED_LABS = [
  {
    id: "egfr",
    label: "eGFR",
    codes: ["33914-3"],
    nameMatch: /egfr/i,
    unitFallback: "mL/min/1.73m²",
  },
  {
    id: "phosphorus",
    label: "Serum phosphorus",
    codes: ["2777-1", "2778-9"],
    nameMatch: /phosph/,
    unitFallback: "mg/dL",
  },
  {
    id: "potassium",
    label: "Serum potassium",
    codes: ["2823-3"],
    nameMatch: /potass/,
    unitFallback: "mmol/L",
  },
] as const;

export const RADIAL_METRICS = [
  { id: "protein", label: "Protein", key: "proteinG", unit: "g", precision: 1 },
  {
    id: "phosphorus",
    label: "Phosphorus",
    key: "phosphorusMg",
    unit: "mg",
    precision: 0,
  },
  {
    id: "potassium",
    label: "Potassium",
    key: "potassiumMg",
    unit: "mg",
    precision: 0,
  },
  {
    id: "sodium",
    label: "Sodium",
    key: "sodiumMg",
    unit: "mg",
    precision: 0,
  },
] as const;

export const ZERO_TOTALS: Record<NutrientKey, number> = {
  caloriesKcal: 0,
  proteinG: 0,
  phosphorusMg: 0,
  potassiumMg: 0,
  sodiumMg: 0,
};
export const DAY_MS = 24 * 60 * 60 * 1000;
export const FOOD_HIGHLIGHT_LIMIT = 5;

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

    const [clinicalDoc, labDocs, nutritionDocs] = await Promise.all([
      db.collection<TUserClinicalSummary>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        {
          projection: {
            ckdStage: 1,
            egfrCurrent: 1,
            dialysisStatus: 1,
            lastClinicalUpdateAt: 1,
            targets: 1,
          },
        }
      ),
      fetchRecentLabs(db, patientObjectId),
      fetchNutritionEntries(db, patientObjectId),
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
      clinicalDoc,
      rangeStart,
      rangeEnd,
      rangeDays
    );

    return ok({
      patientId: caller.patientId,
      summary: {
        ckdStage: clinicalDoc?.ckdStage ?? null,
        egfrCurrent: normaliseNumber(clinicalDoc?.egfrCurrent),
        dialysisStatus: clinicalDoc?.dialysisStatus ?? null,
        lastClinicalUpdateAt: clinicalDoc?.lastClinicalUpdateAt
          ? clinicalDoc.lastClinicalUpdateAt.toISOString()
          : null,
      },
      labs,
      nutrition,
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
