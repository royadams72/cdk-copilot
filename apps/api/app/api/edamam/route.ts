export const runtime = "nodejs";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { NextRequest, NextResponse } from "next/server";
import {
  Item,
  Normalised,
  normaliseInput,
  rewriteForEdamam,
} from "./normaliseInput";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const foodURI = process.env.EDAMAM_API_FOOD_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();
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
        const params = new URLSearchParams({
          app_id: foodAppID,
          app_key: foodAppKey,
          ingr: item.normalised, // let URLSearchParams handle encoding
          "nutrition-type": "logging",
          category: "generic-foods",
        });

        const res = await fetch(`${foodURI}?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Edamam error (${res.status})`);
        }
        const data = await res.json();
        const match = await pickBestEdamamFood(data, item);
        console.log("match::", match);

        return {
          item, // original normalised item
          data, // Edamam parser response for this item
        };
      })
    );

    return NextResponse.json({ items: results, requestId });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error.message || "Server error", { requestId }, status);
  }
}

async function pickBestEdamamFood(data: any, item: { normalised: string }) {
  const text = item.normalised.toLowerCase();
  const hints = (data?.hints ?? []) as any[];

  if (!hints.length) return null;

  // Prefer generic foods
  const genericFoods = hints.filter((h) => h.food.categoryLabel === "food");
  const pool = genericFoods.length ? genericFoods : hints;

  // If user said "brown" / "wholemeal" / "whole wheat", try to honour that
  if (/brown|wholemeal|whole[- ]wheat/.test(text)) {
    const brownish = pool.find((h) =>
      /brown|wholemeal|whole[- ]wheat/i.test(h.food.label)
    );
    if (brownish) return brownish;
  }

  // If user said "white", try to honour that
  if (/white/.test(text)) {
    const white = pool.find((h) => /white/i.test(h.food.label));
    if (white) return white;
  }

  // Otherwise, fall back to first generic food
  return pool[0];
}
