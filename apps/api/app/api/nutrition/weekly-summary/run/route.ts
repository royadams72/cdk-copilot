export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { sendWeeklyInsightPushNotifications } from "@/apps/api/lib/utils/pushNotifications";
import {
  runWeeklyNutritionInsightForPatient,
  runWeeklyNutritionInsightsForActivePatients,
} from "@/apps/api/lib/utils/weeklyNutritionInsights";
import { ROLES } from "@ckd/core";

function isCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

function parseReferenceDate(referenceDate?: string | null) {
  if (!referenceDate) return undefined;
  const parsed = new Date(referenceDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

async function handleCronRun(
  db: Awaited<ReturnType<typeof getDb>>,
  input?: {
    patientId?: string | null;
    referenceDate?: string | null;
  },
) {
  const referenceDate = parseReferenceDate(input?.referenceDate);

  if (input?.patientId) {
    if (!ObjectId.isValid(input.patientId)) {
      return bad("Invalid patientId", undefined, 400);
    }
    const insight = await runWeeklyNutritionInsightForPatient(
      db,
      new ObjectId(input.patientId),
      { referenceDate },
    );
    return ok({ count: 1, insights: [insight] });
  }

  const insights = await runWeeklyNutritionInsightsForActivePatients(db, {
    referenceDate,
  });
  const notifications = await sendWeeklyInsightPushNotifications(db, insights);
  return ok({ count: insights.length, insights, notifications });
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return bad("Unauthorized", undefined, 401);
  }

  const db = await getDb();

  try {
    return handleCronRun(db, {
      patientId: req.nextUrl.searchParams.get("patientId"),
      referenceDate: req.nextUrl.searchParams.get("referenceDate"),
    });
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}

export async function POST(req: NextRequest) {
  const db = await getDb();
  const body = (await req.json().catch(() => null)) as {
    patientId?: string;
    referenceDate?: string;
  } | null;

  if (isCronRequest(req)) {
    try {
      return handleCronRun(db, body ?? undefined);
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
      { referenceDate: parseReferenceDate(body?.referenceDate) },
    );
    return ok(insight);
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
