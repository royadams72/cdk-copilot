export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { runWeeklyNutritionInsightForPatient, runWeeklyNutritionInsightsForActivePatients } from "@/apps/api/lib/utils/weeklyNutritionInsights";
import { ROLES } from "@ckd/core";

function isCronRequest(req: NextRequest) {
  const secret = process.env.WEEKLY_NUTRITION_CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("x-cron-secret") === secret;
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  const body =
    (await req.json().catch(() => null)) as
      | {
          patientId?: string;
          referenceDate?: string;
        }
      | null;
  const referenceDate =
    body?.referenceDate && !Number.isNaN(new Date(body.referenceDate).getTime())
      ? new Date(body.referenceDate)
      : undefined;

  if (isCronRequest(req)) {
    try {
      if (body?.patientId) {
        if (!ObjectId.isValid(body.patientId)) {
          return bad("Invalid patientId", undefined, 400);
        }
        const insight = await runWeeklyNutritionInsightForPatient(
          db,
          new ObjectId(body.patientId),
          { referenceDate },
        );
        return ok({ count: 1, insights: [insight] });
      }

      const insights = await runWeeklyNutritionInsightsForActivePatients(db, {
        referenceDate,
      });
      return ok({ count: insights.length, insights });
    } catch (err: any) {
      return bad(err?.message || "Server error", undefined, err?.status || 500);
    }
  }

  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const insight = await runWeeklyNutritionInsightForPatient(
      db,
      new ObjectId(caller.patientId),
      { referenceDate },
    );
    return ok(insight);
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
