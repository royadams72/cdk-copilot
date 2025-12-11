export const runtime = "nodejs";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { NextRequest, NextResponse } from "next/server";

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
    console.log(term);

    const res = await fetch(
      `${foodURI}?app_id=${foodAppID}&app_key=${foodAppKey}&ingr=${encodeURIComponent(
        term
      )}`
    );
    const data = await res.json();
    if (!data) {
      return bad("data not found", { requestId }, 404);
    }

    console.log(data.parsed[0].food, data.parsed[0]);
    return NextResponse.json({ data, requestId });
  } catch (error: any) {
    const status = error?.status || 500;
    return bad(error.message || "Server error", { requestId }, status);
  }
}
