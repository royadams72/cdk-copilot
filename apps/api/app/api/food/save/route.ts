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
    const { eatenAt: eatenAtRaw, ...meal } = body ?? {};
    const type = Object.keys(meal);
    if (type.length > 1) {
      bad("Malformed 100", 500);
    }
    const mealType = type[0] as TMealType;
    const mealArray: TFoodItemEntry[] = (
      meal as Record<TMealType, TFoodItem[]>
    )[mealType].map(({ groupId, measures, ...rest }) => rest);
    const now = new Date();
    const eatenAt = eatenAtRaw ? new Date(eatenAtRaw) : now;
    console.log("caller.patientId:", caller.patientId);

    const doc: TNutritionEntry = {
      createdAt: now,
      eatenAt: Number.isNaN(eatenAt.getTime()) ? now : eatenAt,
      items: mealArray,
      mealType,
      patientId: caller.patientId,
      photos: [],
      status: "active",
      tags: [],
      totals: { ...getTotals(mealArray) },
      updatedAt: now,
    };

    const parsed = NutritionEntry.safeParse(doc);
    console.log("parsed", parsed);

    if (!parsed.success) {
      bad("Malformed 101", { requestId }, 500);
    }

    if (parsed?.data) {
      await collection.insertOne({
        ...parsed.data,
        patientId: new ObjectId(parsed.data.patientId),
      });
    }

    return ok("meal saved");
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

// export const NutritionEntry = z.object({
//   patientId: PrincipalId,
//   eatenAt: z.coerce.date(), // when the meal was consumed
//   items: z.array(FoodItem).min(1),
//   totals: Nutrients, // sum of items (precomputed)
//   mealType: MealType,
//   tags: z.array(z.string()).default([]), // e.g., ["high-protein"]
//   photos: z.array(z.url()).default([]),
//   recipeId: z.string().optional(), // if linked to a saved recipe
//   notes: z.string().optional(),
//   createdAt: z.coerce.date(), // when the meal was consumed
//   createdBy: PrincipalId.optional(),
//   updatedBy: PrincipalId.optional(),
//   status: z.enum(["active", "deleted"]).default("active"),
//   deletedAt: z.coerce.date().optional(),
//   deletedBy: z.enum(["patient", "clinician", "dietitian", "admin"]).optional(),
// });
