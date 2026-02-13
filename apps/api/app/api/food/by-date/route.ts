import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES, TMealType } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const caller: SessionUser = await requireUser(req);

  if (
    caller.role !== ROLES.Patient ||
    !caller.patientId ||
    !ObjectId.isValid(caller.patientId)
  ) {
    return bad("Patient context missing", undefined, 403);
  }

  try {
    const body: { mealType?: TMealType; eatenAt?: string } =
      (await req.json().catch(() => null)) ?? {};
    const mealType = body.mealType;
    const eatenAt = body.eatenAt ? new Date(body.eatenAt) : null;
    if (!mealType || !eatenAt || Number.isNaN(eatenAt.getTime())) {
      return bad("Missing mealType or eatenAt", undefined, 400);
    }

    const start = new Date(eatenAt);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const db = await getDb();
    const entry = await db
      .collection(COLLECTIONS.NutritionLedger)
      .findOne(
        {
          patientId: new ObjectId(caller.patientId),
          mealType,
          eatenAt: { $gte: start, $lt: end },
        },
        { projection: { _id: 1, eatenAt: 1, mealType: 1, items: 1 } },
      );

    if (!entry) {
      return ok({ entry: null });
    }

    return ok({
      entry: {
        entryId: entry._id.toString(),
        mealType,
        eatenAt: entry.eatenAt ? entry.eatenAt.toISOString() : null,
        items: entry.items ?? [],
      },
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
