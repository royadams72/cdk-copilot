import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS, getCollection } from "@ckd/core/server";
import { z } from "zod";

export const runtime = "nodejs";

type UserPiiDoc = {
  dateOfBirth?: Date | null;
  firstName?: string | null;
  email?: string | null;
  lastName?: string | null;
  nhsNumber?: string | null;
  patientId?: ObjectId;
  phoneE164?: string | null;
  units?: "metric" | "imperial";
  updatedAt?: Date;
};

type UserClinicalDoc = {
  careTeam?: Array<{ contact?: string; name?: string; org?: string; role: string }>;
  ckdStage?: string | null;
  dialysisStatus?: string | null;
  heightCm?: number | null;
  patientId: ObjectId;
  lastClinicalUpdateAt?: Date;
  updatedAt?: Date;
  updatedBy?: string;
};

const CurrentProfilePatch = z.object({
  ckdStage: z.enum(["1", "2", "3a", "3b", "4", "5"]).nullable(),
  dialysisStatus: z.enum(["none", "hemodialysis", "peritoneal", "post-transplant"]),
  heightCm: z.number().positive().max(260),
  nhsNumber: z.string().regex(/^\d{10}$/).nullable(),
  phoneE164: z.string().regex(/^\+?[1-9]\d{1,14}$/).nullable(),
  units: z.enum(["metric", "imperial"]),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user.patientId || !ObjectId.isValid(user.patientId)) {
      return bad("Patient context missing", undefined, 403);
    }

    const db = await getDb();
    const usersPii = getCollection<UserPiiDoc>(db, COLLECTIONS.UsersPII);
    const patientId = new ObjectId(user.patientId);
    const [pii, clinical] = await Promise.all([
      usersPii.findOne(
      { patientId },
      {
        projection: {
          _id: 0,
          dateOfBirth: 1,
          email: 1,
          firstName: 1,
          lastName: 1,
          nhsNumber: 1,
          phoneE164: 1,
          units: 1,
        },
      },
      ),
      getCollection<UserClinicalDoc>(db, COLLECTIONS.UsersClinical).findOne(
        { patientId },
        { projection: { _id: 0, careTeam: 1, ckdStage: 1, dialysisStatus: 1, heightCm: 1 } },
      ),
    ]);

    return ok({
      careTeam: clinical?.careTeam ?? [],
      ckdStage: clinical?.ckdStage ?? null,
      dateOfBirth:
        pii?.dateOfBirth instanceof Date ? pii.dateOfBirth.toISOString() : null,
      dialysisStatus: clinical?.dialysisStatus ?? "none",
      email: pii?.email ?? null,
      firstName: pii?.firstName ?? null,
      heightCm: clinical?.heightCm ?? null,
      lastName: pii?.lastName ?? null,
      nhsNumber: pii?.nhsNumber ?? null,
      phoneE164: pii?.phoneE164 ?? null,
      units: pii?.units === "imperial" ? "imperial" : "metric",
    });
  } catch (err: any) {
    return badFromError(err);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user.patientId || !ObjectId.isValid(user.patientId)) {
      return bad("Patient context missing", undefined, 403);
    }
    const parsed = CurrentProfilePatch.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return bad("Validation failed", parsed.error.flatten(), 400);

    const db = await getDb();
    const patientId = new ObjectId(user.patientId);
    const now = new Date();
    await Promise.all([
      getCollection<UserPiiDoc>(db, COLLECTIONS.UsersPII).updateOne(
        { patientId },
        { $set: { nhsNumber: parsed.data.nhsNumber, phoneE164: parsed.data.phoneE164, units: parsed.data.units, updatedAt: now } },
      ),
      getCollection<UserClinicalDoc>(db, COLLECTIONS.UsersClinical).updateOne(
        { patientId },
        { $set: { ckdStage: parsed.data.ckdStage, dialysisStatus: parsed.data.dialysisStatus, heightCm: parsed.data.heightCm, lastClinicalUpdateAt: now, updatedAt: now, updatedBy: user.principalId } },
      ),
    ]);
    return ok({ updatedAt: now });
  } catch (err: any) {
    return badFromError(err);
  }
}
