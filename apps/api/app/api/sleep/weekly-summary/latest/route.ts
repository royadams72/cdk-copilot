export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { getWeeklySleepSummary } from "@/apps/api/lib/utils/sleep";
import { ROLES } from "@ckd/core";

function parseReferenceDate(referenceDate?: string | null) {
  if (!referenceDate) return undefined;
  const parsed = new Date(referenceDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

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
    const summary = await getWeeklySleepSummary(
      db,
      new ObjectId(caller.patientId),
      {
        referenceDate: parseReferenceDate(
          req.nextUrl.searchParams.get("referenceDate"),
        ),
      },
    );

    return ok({ summary });
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
