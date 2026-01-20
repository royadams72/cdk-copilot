import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad } from "@/apps/api/lib/http/responses";
import { TBaseFoodSchema } from "@ckd/core";
import { getCollection, COLLECTIONS } from "@ckd/core/server";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
  const db = await getDb();
  const collection = getCollection<TBaseFoodSchema>(db, COLLECTIONS.BaseFoods);

  // const token = match.food.label.trim().toLowerCase();
  // // e.g. "potatoes, boiled, no salt"

  // // split into tokens
  // const tokens = token
  //   .replace(/[,.;:()]/g, " ")
  //   .split(/\s+/)
  //   .filter(Boolean);

  // // e.g. ["potatoes","boiled","no","salt"]

  // const cofidFoods = await collection
  //   .find({
  //     keywords: { $all: tokens }, // all tokens must be in keywords[]
  //   })
  //   .limit(20)
  //   .toArray();

  // console.log("tokens::", tokens);
  // if (edamamText === "roast chicken thigh with skin") {
  // for (const food of cofidFoods) {
  //   console.log(edamamText, food.nutrientsPer100g.energyKcal);
  //   // }
  // }
}
