import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS, getCollection } from "@ckd/core/server";

export const runtime = "nodejs";

type UserPiiDoc = {
  patientId?: ObjectId;
  units?: "metric" | "imperial";
};

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user.patientId || !ObjectId.isValid(user.patientId)) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const usersPii = getCollection<UserPiiDoc>(db, COLLECTIONS.UsersPII);
    const pii = await usersPii.findOne(
      { patientId: new ObjectId(user.patientId) },
      { projection: { _id: 0, units: 1 } },
    );
    console.log("pii?.units", pii?.units, "user.patientId::", user.patientId);

    return ok({ units: pii?.units === "imperial" ? "imperial" : "metric" });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
