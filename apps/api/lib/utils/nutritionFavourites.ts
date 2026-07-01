import {
  TFoodItemEntry,
  TMealType,
  TNutritionFavourite,
  TNutritionFavouriteFood,
  TNutritionFavouriteMeal,
} from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";
import { withDerivedPhosphorusProteinRatio } from "./nutritionMath";

type NutritionFavouriteDoc = {
  _id?: ObjectId;
} & Omit<TNutritionFavourite, "patientId"> & {
  patientId: ObjectId;
};

type FavouriteFoodDoc = {
  _id?: ObjectId;
} & Omit<TNutritionFavouriteFood, "patientId"> & {
  patientId: ObjectId;
};

type FavouriteMealDoc = {
  _id?: ObjectId;
} & Omit<TNutritionFavouriteMeal, "patientId"> & {
  patientId: ObjectId;
};

type SignatureMaps = {
  foods: Map<string, FavouriteFoodDoc>;
  meal: FavouriteMealDoc;
};

export function getNutritionFavouritesCollection(db: Db) {
  return getCollection<NutritionFavouriteDoc>(db, COLLECTIONS.NutritionFavourites);
}

export function deriveFavouriteMaps(args: {
  eatenAt: Date;
  items: TFoodItemEntry[];
  mealType: TMealType;
  patientId: ObjectId;
}): SignatureMaps {
  const { eatenAt, items, mealType, patientId } = args;
  const now = new Date();
  const foods = new Map<string, FavouriteFoodDoc>();

  for (const item of items) {
    const signature = foodSignature(item);
    foods.set(signature, {
      createdAt: now,
      isFavourite: false,
      kind: "food",
      label: item.name,
      lastUsedAt: eatenAt,
      mealType,
      patientId,
      signature,
      snapshot: {
        ...item,
        mealType,
      },
      timesUsed: 1,
      updatedAt: now,
    });
  }

  return {
    foods,
    meal: {
      createdAt: now,
      isFavourite: false,
      kind: "meal",
      label: buildMealLabel(items),
      lastUsedAt: eatenAt,
      mealType,
      patientId,
      signature: mealSignature(items),
      snapshot: {
        items,
        mealType,
        totals: getTotals(items),
      },
      timesUsed: 1,
      updatedAt: now,
    },
  };
}

export async function incrementFavouriteMaps(
  db: Db,
  maps: SignatureMaps,
) {
  const collection = getNutritionFavouritesCollection(db);
  const ops = [
    ...Array.from(maps.foods.values()).map((doc) => ({
      updateOne: {
        filter: {
          kind: doc.kind,
          patientId: doc.patientId,
          signature: doc.signature,
        },
        update: {
          $inc: { timesUsed: 1 },
          $set: {
            isFavourite: true,
            label: doc.label,
            lastUsedAt: doc.lastUsedAt,
            mealType: doc.mealType,
            snapshot: doc.snapshot,
            updatedAt: doc.updatedAt,
          },
          $setOnInsert: {
            createdAt: doc.createdAt,
          },
        },
        upsert: true,
      },
    })),
    ...(maps.meal.signature
      ? [
          {
            updateOne: {
              filter: {
                kind: maps.meal.kind,
                patientId: maps.meal.patientId,
                signature: maps.meal.signature,
              },
              update: {
                $inc: { timesUsed: 1 },
                $set: {
                  isFavourite: true,
                  label: maps.meal.label,
                  lastUsedAt: maps.meal.lastUsedAt,
                  mealType: maps.meal.mealType,
                  snapshot: maps.meal.snapshot,
                  updatedAt: maps.meal.updatedAt,
                },
                $setOnInsert: {
                  createdAt: maps.meal.createdAt,
                },
              },
              upsert: true,
            },
          },
        ]
      : []),
  ];

  if (!ops.length) return;
  await collection.bulkWrite(ops);
  await collection.updateMany(
    {
      patientId: maps.meal.patientId,
      timesUsed: { $lt: 2 },
    },
    { $set: { isFavourite: false } },
  );
}

export async function reconcileFavouriteMaps(args: {
  db: Db;
  eatenAt: Date;
  nextItems: TFoodItemEntry[];
  oldItems: TFoodItemEntry[];
  oldMealType: TMealType;
  nextMealType: TMealType;
  patientId: ObjectId;
}) {
  const {
    db,
    eatenAt,
    nextItems,
    oldItems,
    oldMealType,
    nextMealType,
    patientId,
  } = args;
  const collection = getNutritionFavouritesCollection(db);
  const previous = deriveFavouriteMaps({
    eatenAt,
    items: oldItems,
    mealType: oldMealType,
    patientId,
  });
  const next = deriveFavouriteMaps({
    eatenAt,
    items: nextItems,
    mealType: nextMealType,
    patientId,
  });

  const previousFoodSignatures = new Set(previous.foods.keys());
  const nextFoodSignatures = new Set(next.foods.keys());

  for (const signature of previousFoodSignatures) {
    if (nextFoodSignatures.has(signature)) {
      const doc = next.foods.get(signature);
      if (!doc) continue;
      await collection.updateOne(
        { patientId, kind: "food", signature },
        {
          $set: {
            label: doc.label,
            lastUsedAt: doc.lastUsedAt,
            mealType: doc.mealType,
            snapshot: doc.snapshot,
            updatedAt: doc.updatedAt,
          },
        },
      );
      next.foods.delete(signature);
      previous.foods.delete(signature);
    }
  }

  if (previous.meal.signature === next.meal.signature) {
    await collection.updateOne(
      {
        patientId,
        kind: "meal",
        signature: next.meal.signature,
      },
      {
        $set: {
          label: next.meal.label,
          lastUsedAt: next.meal.lastUsedAt,
          mealType: next.meal.mealType,
          snapshot: next.meal.snapshot,
          updatedAt: next.meal.updatedAt,
        },
      },
    );
    previous.meal.signature = "";
    next.meal.signature = "";
  }

  await decrementFavouriteMaps(db, previous, patientId);
  await incrementFavouriteMaps(db, next);
}

export async function decrementFavouriteMaps(
  db: Db,
  maps: Partial<SignatureMaps>,
  patientId: ObjectId,
) {
  const collection = getNutritionFavouritesCollection(db);
  const signatures = [
    ...Array.from(maps.foods?.keys() ?? []).map((signature) => ({
      kind: "food" as const,
      signature,
    })),
    ...(maps.meal?.signature
      ? [{ kind: "meal" as const, signature: maps.meal.signature }]
      : []),
  ];

  for (const entry of signatures) {
    const existing = await collection.findOne({
      patientId,
      kind: entry.kind,
      signature: entry.signature,
    });
    if (!existing) continue;

    const nextTimesUsed = Math.max(0, (existing.timesUsed ?? 0) - 1);
    if (nextTimesUsed === 0) {
      await collection.deleteOne({
        _id: existing._id,
      });
      continue;
    }

    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          isFavourite: nextTimesUsed >= 2,
          timesUsed: nextTimesUsed,
          updatedAt: new Date(),
        },
      },
    );
  }
}

export function buildFavouriteViewModel(doc: NutritionFavouriteDoc) {
  return {
    id: doc._id instanceof ObjectId ? doc._id.toString() : "",
    isFavourite: doc.isFavourite,
    kind: doc.kind,
    label: doc.label,
    lastUsedAt: doc.lastUsedAt.toISOString(),
    mealType: doc.mealType,
    signature: doc.signature,
    snapshot: doc.snapshot,
    timesUsed: doc.timesUsed,
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function foodSignature(item: TFoodItemEntry) {
  const baseId =
    item.foodId?.trim().toLowerCase() ||
    item.name.trim().toLowerCase().replace(/\s+/g, " ");
  return `food:${baseId}`;
}

function mealSignature(items: TFoodItemEntry[]) {
  const parts = items
    .map((item) => {
      const quantity = roundQuantity(item.quantity);
      const unit = normalizeUnit(item.unit);
      return `${foodSignature(item)}:${quantity}:${unit}`;
    })
    .sort();
  return `meal:${parts.join("|")}`;
}

function buildMealLabel(items: TFoodItemEntry[]) {
  return items
    .slice(0, 3)
    .map((item) => item.name)
    .join(", ");
}

function getTotals(items: TFoodItemEntry[]) {
  return withDerivedPhosphorusProteinRatio(
    items.reduce(
      (acc, entry) => {
        acc.caloriesKcal += entry.nutrients.caloriesKcal ?? 0;
        acc.carbsG += entry.nutrients.carbsG ?? 0;
        acc.fatG += entry.nutrients.fatG ?? 0;
        acc.fiberG += entry.nutrients.fiberG ?? 0;
        acc.phosphorusMg += entry.nutrients.phosphorusMg ?? 0;
        acc.potassiumMg += entry.nutrients.potassiumMg ?? 0;
        acc.proteinG += entry.nutrients.proteinG ?? 0;
        acc.sodiumMg += entry.nutrients.sodiumMg ?? 0;
        return acc;
      },
      {
        caloriesKcal: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        phosphorusMg: 0,
        potassiumMg: 0,
        proteinG: 0,
        sodiumMg: 0,
      },
    ),
  );
}

function roundQuantity(value: number) {
  return Math.round(value * 1000) / 1000;
}

function normalizeUnit(unit: string | undefined) {
  return (unit ?? "").trim().toLowerCase();
}
