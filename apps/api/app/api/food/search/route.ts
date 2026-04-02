export const runtime = "nodejs";

import { searchFood } from "@/apps/api/lib/nutrition/searchFood";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  FoodSearchApiRequestSchema,
  FoodSearchApiResponseSchema,
} from "@ckd/core";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const body = await req.json();
    const parsed = FoodSearchApiRequestSchema.safeParse(body);

    if (!parsed.success) {
      return bad("Invalid food search payload", parsed.error.flatten(), 400);
    }

    const result = await searchFood(parsed.data);
    const response = FoodSearchApiResponseSchema.parse({
      requestId,
      result,
    });
    console.log("response:", response);

    return ok(response);
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Food search failed",
      { requestId },
      500,
    );
  }
}

export async function GET(req: NextRequest) {
  const query = new URL(req.url).searchParams.get("query")?.trim();
  if (!query) {
    return bad("query is required", undefined, 400);
  }
  const requestId = makeRandomId();

  try {
    const result = await searchFood({
      normalizedText: query,
      query,
    });
    const response = FoodSearchApiResponseSchema.parse({
      requestId,
      result,
    });
    return ok(response);
  } catch (error) {
    return bad(
      error instanceof Error ? error.message : "Food search failed",
      { requestId },
      500,
    );
  }
}
