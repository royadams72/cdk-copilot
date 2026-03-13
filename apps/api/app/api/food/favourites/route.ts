import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  buildFavouriteViewModel,
  getNutritionFavouritesCollection,
} from "@/apps/api/lib/utils/nutritionFavourites";
import { ROLES } from "@ckd/core";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const caller: SessionUser = await requireUser(req);

  if (
    caller.role !== ROLES.Patient ||
    !caller.patientId ||
    !ObjectId.isValid(caller.patientId)
  ) {
    return bad("Patient context missing", undefined, 403);
  }

  try {
    const db = await getDb();
    const collection = getNutritionFavouritesCollection(db);
    const patientId = new ObjectId(caller.patientId);

    const favourites = await collection
      .find({
        patientId,
        isFavourite: true,
      })
      .sort({ timesUsed: -1, updatedAt: -1 })
      .limit(60)
      .toArray();

    return ok({
      foods: favourites
        .filter((item) => item.kind === "food")
        .map(buildFavouriteViewModel),
      meals: favourites
        .filter((item) => item.kind === "meal")
        .map(buildFavouriteViewModel),
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
