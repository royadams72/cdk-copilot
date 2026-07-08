import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS, getCollection } from "@ckd/core/server";

export const runtime = "nodejs";

type UserPiiDoc = {
  dateOfBirth?: Date | null;
  firstName?: string | null;
  lastName?: string | null;
  nhsNumber?: string | null;
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
      {
        projection: {
          _id: 0,
          dateOfBirth: 1,
          firstName: 1,
          lastName: 1,
          nhsNumber: 1,
          units: 1,
        },
      },
    );

    return ok({
      dateOfBirth:
        pii?.dateOfBirth instanceof Date ? pii.dateOfBirth.toISOString() : null,
      firstName: pii?.firstName ?? null,
      lastName: pii?.lastName ?? null,
      nhsNumber: pii?.nhsNumber ?? null,
      units: pii?.units === "imperial" ? "imperial" : "metric",
    });
  } catch (err: any) {
    return badFromError(err);
  }
}
