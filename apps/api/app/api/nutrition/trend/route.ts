import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { NutrientKey } from "@/apps/api/lib/types/dashboard";
import { DAY_MS } from "@/apps/api/app/api/dashboard/route";
import {
  fetchNutritionEntriesInRange,
  hasOlderNutritionEntries,
  mapNutritionTargets,
  summarizeNutrition,
  startOfDayUtc,
} from "@/apps/api/lib/utils/dashboard";

export const runtime = "nodejs";

const DEFAULT_DAYS = 7;
const MAX_DAYS = 7;

type TargetsCurrentDoc = {
  targets?: Record<string, unknown>;
};

function parsePositiveInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseBefore(beforeParam: string | null) {
  if (!beforeParam) return startOfDayUtc(new Date());
  const parsed = new Date(beforeParam);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Invalid before date");
  }
  return startOfDayUtc(parsed);
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

    const days = Math.min(
      parsePositiveInt(req.nextUrl.searchParams.get("days"), DEFAULT_DAYS),
      MAX_DAYS,
    );
    const rangeEnd = parseBefore(req.nextUrl.searchParams.get("before"));
    const rangeStart = new Date(rangeEnd.getTime() - (days - 1) * DAY_MS);
    const rangeEndExclusive = new Date(rangeEnd.getTime() + DAY_MS);

    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);

    const [entries, targetsCurrentDoc, hasMore] = await Promise.all([
      fetchNutritionEntriesInRange(
        db,
        patientObjectId,
        rangeStart,
        rangeEndExclusive,
      ),
      db.collection<TargetsCurrentDoc>(COLLECTIONS.TargetsCurrent).findOne(
        {
          patientId: patientObjectId,
          targets: { $exists: true, $type: "object" },
        },
        {
          projection: { targets: 1 },
          sort: { updatedAt: -1, _id: -1 },
        },
      ),
      hasOlderNutritionEntries(db, patientObjectId, rangeStart),
    ]);

    const nutritionTargets = mapNutritionTargets(
      (targetsCurrentDoc?.targets as Record<string, never> | undefined) ?? null,
    ) as Partial<Record<NutrientKey, number>>;

    const nutrition = summarizeNutrition(
      entries,
      nutritionTargets,
      rangeStart,
      rangeEnd,
      days,
    );

    return ok({
      hasMore,
      nextBefore: hasMore
        ? new Date(rangeStart.getTime() - DAY_MS).toISOString()
        : null,
      nutrition,
      targets: nutritionTargets,
      window: {
        days,
        from: rangeStart.toISOString(),
        to: rangeEnd.toISOString(),
      },
    });
  } catch (err: any) {
    const status =
      err?.message === "Invalid before date" ? 400 : err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
