import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  NutritionEntry,
  ROLES,
  TFoodItem,
  TFoodItemEntry,
  TMealType,
  TNutrientKey,
  TNutritionEntry,
} from "@ckd/core";
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

    type NutritionEntryInsert = Omit<TNutritionEntry, "patientId"> & {
      patientId: ObjectId;
    };
    const collection = getCollection<NutritionEntryInsert>(
      db,
      COLLECTIONS.NutritionLedger,
    );
    const body: Record<string, any> = await req.json();
    const { eatenAt: eatenAtRaw, entryId, ...meal } = body ?? {};
    if (!entryId || !ObjectId.isValid(entryId)) {
      return bad("Missing entryId", { requestId }, 400);
    }

    const type = Object.keys(meal);
    if (type.length !== 1) {
      return bad("Malformed meal payload", { requestId }, 400);
    }
    const mealType = type[0] as TMealType;
    const rawMealItems = (meal as Record<TMealType, TFoodItem[]>)[mealType];
    if (!Array.isArray(rawMealItems)) {
      return bad("Malformed meal payload", { requestId }, 400);
    }
    const mealArray: TFoodItemEntry[] = rawMealItems.map(
      ({ groupId, measures, ...rest }) => rest,
    );
    const now = new Date();
    const eatenAt = eatenAtRaw ? new Date(eatenAtRaw) : now;
    const resolvedEatenAt = Number.isNaN(eatenAt.getTime()) ? now : eatenAt;

    const entryObjectId = new ObjectId(entryId);
    const existing = await collection.findOne({
      _id: entryObjectId,
      patientId: new ObjectId(caller.patientId),
    });
    if (!existing) {
      return bad("Meal not found", { requestId }, 404);
    }

    const totals = { ...getTotals(mealArray) };
    const updated: TNutritionEntry = {
      ...existing,
      eatenAt: resolvedEatenAt,
      items: mealArray,
      mealType,
      patientId: caller.patientId,
      totals,
      updatedAt: now,
    };

    const parsed = NutritionEntry.safeParse(updated);
    if (!parsed.success) {
      return bad("Malformed 101", { requestId }, 500);
    }

    await collection.updateOne(
      { _id: entryObjectId },
      {
        $set: {
          eatenAt: resolvedEatenAt,
          items: mealArray,
          mealType,
          totals,
          updatedAt: now,
        },
      },
    );

    return ok("meal updated");
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

const nutrientKeys: TNutrientKey[] = [
  "caloriesKcal",
  "proteinG",
  "phosphorusMg",
  "potassiumMg",
  "sodiumMg",
  "phosphorus_protein_ratio",
];

const getTotals = (entries: TFoodItemEntry[]) =>
  entries.reduce(
    (acc, entry) => {
      for (const key of nutrientKeys) {
        acc[key] += entry.nutrients[key] ?? 0;
      }
      return acc;
    },
    {
      caloriesKcal: 0,
      phosphorus_protein_ratio: 0,
      phosphorusMg: 0,
      potassiumMg: 0,
      proteinG: 0,
      sodiumMg: 0,
    },
  );
