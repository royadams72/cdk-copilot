import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { reconcileFavouriteMaps } from "@/apps/api/lib/utils/nutritionFavourites";
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

const mealTypes = new Set<TMealType>([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "drink",
]);

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();
  try {
    const caller: SessionUser = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);

    type NutritionEntryInsert = Omit<TNutritionEntry, "patientId"> & {
      patientId: ObjectId;
    };
    const collection = getCollection<NutritionEntryInsert>(
      db,
      COLLECTIONS.NutritionLedger,
    );
    const rawBody: unknown = await req.json();
    const payload = isRecord((rawBody as any)?.mealData)
      ? ((rawBody as any).mealData as Record<string, any>)
      : rawBody;

    if (!isRecord(payload)) {
      return bad(
        "Malformed meal payload",
        { reason: "Payload must be an object", requestId },
        400,
      );
    }

    const { eatenAt: eatenAtRaw, entryId, ...mealPayload } = payload;
    if (!entryId || !ObjectId.isValid(entryId)) {
      return bad("Missing entryId", { requestId }, 400);
    }

    const mealKeys = Object.keys(mealPayload);

    if (mealKeys.length !== 1 || !mealTypes.has(mealKeys[0] as TMealType)) {
      return bad("Malformed meal payload", { requestId }, 400);
    }
    const mealType = mealKeys[0] as TMealType;
    const rawMealItems = (mealPayload as Record<TMealType, TFoodItem[]>)[
      mealType
    ];

    if (!Array.isArray(rawMealItems)) {
      return bad("Malformed meal payload", { requestId }, 400);
    }
    if (rawMealItems.length === 0) {
      return bad("Meal must include at least one item", { requestId }, 400);
    }
    const mealArray: TFoodItemEntry[] = rawMealItems.map((rawItem, index) => {
      const { groupId, measures, ...rest } = rawItem;
      const fallbackUid = `${entryId}:${index}`;
      const source =
        rest.source === "user" ||
        rest.source === "barcode" ||
        rest.source === "image_ai" ||
        rest.source === "api"
          ? rest.source
          : "user";
      const uid =
        typeof rest.uid === "string" && rest.uid.trim().length > 0
          ? rest.uid
          : fallbackUid;
      const foodId =
        typeof rest.foodId === "string" && rest.foodId.trim().length > 0
          ? rest.foodId
          : uid;
      const name =
        typeof rest.name === "string" && rest.name.trim().length > 0
          ? rest.name
          : "Food item";
      const quantity = sanitiseQuantity(rest.quantity);
      const unit = sanitiseUnit(rest.unit);

      return {
        ...rest,
        foodId,
        name,
        nutrients: sanitiseNutrients(rest.nutrients),
        quantity,
        source,
        uid,
        unit,
      };
    });
    const now = new Date();
    const eatenAt = eatenAtRaw ? new Date(eatenAtRaw) : now;
    const resolvedEatenAt = Number.isNaN(eatenAt.getTime()) ? now : eatenAt;

    const entryObjectId = new ObjectId(entryId);
    const existing = await collection.findOne({
      _id: entryObjectId,
      patientId: patientObjectId,
    });
    if (!existing) {
      return bad("Meal not found", { requestId }, 404);
    }

    const totals = { ...getTotals(mealArray) };
    const updated: TNutritionEntry = {
      createdAt: existing.createdAt instanceof Date ? existing.createdAt : now,
      eatenAt: resolvedEatenAt,
      items: mealArray,
      mealType,
      patientId: caller.patientId,
      photos: Array.isArray(existing.photos) ? existing.photos : [],
      status: existing.status === "deleted" ? "deleted" : "active",
      tags: Array.isArray(existing.tags) ? existing.tags : [],
      totals,
      updatedAt: now,
    };

    const parsed = NutritionEntry.safeParse(updated);
    if (!parsed.success) {
      return bad(
        "Malformed meal payload",
        { requestId, ...parsed.error.flatten() },
        400,
      );
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

    await reconcileFavouriteMaps({
      db,
      eatenAt: resolvedEatenAt,
      nextItems: mealArray,
      nextMealType: mealType,
      oldItems: existing.items ?? [],
      oldMealType: existing.mealType,
      patientId: patientObjectId,
    });

    return ok("meal updated");
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
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

const nutrientMax: Record<string, number> = {
  caloriesKcal: 5000,
  carbsG: 600,
  fatG: 300,
  fiberG: 200,
  phosphorus_protein_ratio: 300,
  phosphorusMg: 5000,
  potassiumMg: 10000,
  proteinG: 300,
  sodiumMg: 20000,
};

const getTotals = (entries: TFoodItemEntry[]) =>
  sanitiseNutrients(
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
    ),
  );

function normaliseNutrient(key: string, value: unknown): number | undefined {
  if (typeof value !== "number") return undefined;
  if (!Number.isFinite(value) || Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  const max = nutrientMax[key];
  const bounded = typeof max === "number" ? Math.min(value, max) : value;
  return roundNutrient(bounded);
}

function roundNutrient(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sanitiseQuantity(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  if (!Number.isFinite(value)) return 1;
  if (value < 0) return 0;
  if (value > 600) return 600;
  return value;
}

function sanitiseUnit(value: unknown): string {
  if (typeof value !== "string") return "serving";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "serving";
}

function sanitiseNutrients(nutrients: unknown) {
  const input =
    nutrients && typeof nutrients === "object" && !Array.isArray(nutrients)
      ? (nutrients as Record<string, unknown>)
      : {};

  const out: Record<string, number> = {};
  const keys = [
    "caloriesKcal",
    "carbsG",
    "fatG",
    "fiberG",
    "phosphorus_protein_ratio",
    "phosphorusMg",
    "potassiumMg",
    "proteinG",
    "sodiumMg",
  ];

  for (const key of keys) {
    const n = normaliseNutrient(key, input[key]);
    if (typeof n === "number") out[key] = n;
  }

  return out;
}
