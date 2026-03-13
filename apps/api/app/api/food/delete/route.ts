import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  decrementFavouriteMaps,
  deriveFavouriteMaps,
} from "@/apps/api/lib/utils/nutritionFavourites";
import { ROLES, TNutritionEntry } from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
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
    const requestId = makeRandomId();
    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);
    type NutritionEntryInsert = Omit<TNutritionEntry, "patientId"> & {
      patientId: ObjectId;
    };
    const collection = getCollection<NutritionEntryInsert>(
      db,
      COLLECTIONS.NutritionLedger,
    );

    const body: Record<string, any> = await req.json();
    const entryId = body?.entryId;
    if (!entryId || !ObjectId.isValid(entryId)) {
      return bad("Missing entryId", { requestId }, 400);
    }

    const existing = await collection.findOne({
      _id: new ObjectId(entryId),
      patientId: patientObjectId,
    });
    if (!existing) {
      return bad("Meal not found", { requestId }, 404);
    }

    const deleted = await collection.deleteOne({ _id: existing._id });
    if (!deleted.deletedCount) return bad("Meal not found", { requestId }, 404);

    await decrementFavouriteMaps(
      db,
      deriveFavouriteMaps({
        eatenAt: existing.eatenAt,
        items: existing.items ?? [],
        mealType: existing.mealType,
        patientId: patientObjectId,
      }),
      patientObjectId,
    );

    return ok("meal deleted");
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
