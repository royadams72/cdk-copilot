import { SessionUser, requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES, TEdamamNutritionResponse } from "@ckd/core";
import { NextRequest, NextResponse } from "next/server";

const foodAppKey = process.env.EDAMAM_API_KEY || "";
const nutrientsUri = process.env.EDAMAM_API_NUTRIENTS_URI || "";
const foodAppID = process.env.EDAMAM_API_ID || "";

export async function POST(req: NextRequest) {
  const b = await req.json();
  const requestId = makeRandomId();

  if (!foodAppID || !foodAppKey || !nutrientsUri) {
    return bad("App vars not found", { requestId }, 403);
  }
  try {
    const user: SessionUser = await requireUser(req);

    if (user.role !== ROLES.Patient) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const reqIngredients = Array.isArray(b) ? b : b?.reqIngredients;
    if (!Array.isArray(reqIngredients) || reqIngredients.length === 0) {
      return bad("Invalid ingredients payload", { requestId }, 400);
    }

    const params = new URLSearchParams({
      app_id: foodAppID,
      app_key: foodAppKey,
    });
    const results = await Promise.all(
      reqIngredients.map(async (ingredient: TEdamamNutritionResponse) => {
        const ingredients = [ingredient];
        const res = await fetch(`${nutrientsUri}?${params.toString()}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ingredients }),
        });
        // console.log("res:", res);
        // console.log("ingredients:::", JSON.stringify([ingredient]));

        if (!res.ok) {
          return bad(
            `${res.status} Failed to fetch nutrients`,
            { requestId },
            500,
          );
        }
        const data = await res.json();
        // console.log("data:", data);

        return data;
      }),
    );
    // console.log("results::", results);
    // const nutrients = await results.json()
    return ok(results);
  } catch (error) {
    console.log(error);
    return bad(
      error instanceof Error ? error.message : "Failed to fetch nutrients",
      { requestId },
      502,
    );
  }

  //
  // "ingredients": [
  //   {
  //     "quantity": 100,
  //     "measureURI": "http://www.edamam.com/ontologies/edamam.owl#Measure_gram",
  //     "qualifiers": [
  //       "string"
  //     ],
  //     "foodId": "food_bsarl08be0gwarb34bpviafna9d4"
  //   }
  // ]
  // const body = {
  //   ingredients: [
  //     {
  //       quantity: 0,
  //       measureURI: "string",
  //       qualifiers: ["string"],
  //       foodId: "string",
  //     },
  //   ],
  // };
}
