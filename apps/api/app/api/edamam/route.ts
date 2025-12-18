export const runtime = "nodejs";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad } from "@/apps/api/lib/http/responses";
import { ROLES, TBaseFoodSchema, TEdamamFoodMeasure } from "@ckd/core";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import { NextRequest, NextResponse } from "next/server";
import {
  Item,
  Normalised,
  normaliseInput,
  rewriteForEdamam,
} from "./normaliseInput";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { applyPhraseRules } from "./applyPhraseRules";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const foodURI = process.env.EDAMAM_API_FOOD_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
  const db = await getDb();
  const collection = getCollection<TBaseFoodSchema>(db, COLLECTIONS.BaseFoods);
  if (!foodAppID || !foodAppKey || !foodURI) {
    return bad("App vars not found", { requestId }, 403);
  }

  try {
    const user: SessionUser = await requireUser(req);

    if (user.role !== ROLES.Patient) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const { searchParams } = new URL(req.url);
    const term = searchParams.get("query") ?? "";

    const normalised = (await normaliseInput(term)) as Normalised;
    if (!normalised || !normalised.items?.length) {
      return bad("Normalisation failed", { requestId }, 400);
    }

    const itemsForEdamam = rewriteForEdamam(normalised.items);

    const results = await Promise.all(
      itemsForEdamam.map(async (item: Item) => {
        const edamamText = item.normalised;
        // console.log("edamamText::", edamamText);

        const params = new URLSearchParams({
          app_id: foodAppID,
          app_key: foodAppKey,
          ingr: edamamText, // let URLSearchParams handle encoding
          "nutrition-type": "logging",
          category: "generic-foods",
        });
        // console.log(params);

        const res = await fetch(`${foodURI}?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Edamam error (${res.status})`);
        }
        const data = await res.json();
        const matches: TEdamamFoodMeasure[] | null = await pickBestEdamamFood(
          data,
          edamamText
        );
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

        console.log("matches::", matches);
        // console.log("tokens::", tokens);
        // if (edamamText === "roast chicken thigh with skin") {
        // for (const food of cofidFoods) {
        //   console.log(edamamText, food.nutrientsPer100g.energyKcal);
        //   // }
        // }
        // console.log("cofidFoods::", cofidFoods);

        return {
          item, // original normalised item
          matches, // Edamam parser response for this item
        };
      })
    );

    return NextResponse.json({ items: results, requestId });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error.message || "Server error", { requestId }, status);
  }
}

export async function pickBestEdamamFood(
  data: any,
  item: string
): Promise<TEdamamFoodMeasure[] | null> {
  item = item.toLowerCase();
  const hints = (data?.hints ?? []) as any[];

  if (!hints.length) return null;

  // Prefer generic foods
  const genericFoods = hints.filter((h) => h.food.categoryLabel === "food");
  const pool = genericFoods.length ? genericFoods : hints;

  // const phraseMatch = applyPhraseRules(item, pool as TEdamamFoodMeasure[]);
  // if (phraseMatch) return phraseMatch as any;
  // console.log("phraseMatch::", phraseMatch);

  // console.log(pool);

  // Otherwise, fall back to first generic food
  return pool;
}
