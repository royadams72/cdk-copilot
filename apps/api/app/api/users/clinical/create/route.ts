export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { treeifyError } from "zod";

import { COLLECTIONS, getCollection } from "@ckd/core/server";
import {
  STEP3,
  ONBOARDING_STEPS,
  TUserClinical,
  TUserClinicalCreate,
  TUserPII,
  UserClinical_Create,
} from "@ckd/core";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { bad, ok } from "@/apps/api/lib/http/responses";

type UserClinicalDoc = Omit<TUserClinical, "patientId"> & {
  patientId: ObjectId;
};

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const user = await requireUser(req, STEP3);

    if (!user.patientId) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const body = await req.json();
    const parsed = UserClinical_Create.safeParse({
      ...body,
      patientId: user.patientId,
      ...(user.orgId ? { orgId: user.orgId } : {}),
    });

    if (!parsed.success) {
      return bad("Validation failed", treeifyError(parsed.error), 400);
    }

    const now = new Date();
    const insertDto: TUserClinicalCreate = parsed.data;
    const doc: UserClinicalDoc = {
      ...insertDto,
      createdAt: now,
      createdBy: user.principalId,
      lastClinicalUpdateAt: insertDto.lastClinicalUpdateAt ?? now,
      patientId: new ObjectId(insertDto.patientId),
      updatedAt: now,
      updatedBy: user.principalId,
    };

    const db = await getDb();
    const collection = getCollection<UserClinicalDoc>(
      db,
      COLLECTIONS.UsersClinical,
    );
    const piiCollection = getCollection<TUserPII>(db, COLLECTIONS.UsersPII);

    await collection.updateOne(
      { patientId: doc.patientId },
      {
        $set: {
          acrCategory: doc.acrCategory,
          allergies: doc.allergies,
          careTeam: doc.careTeam,
          ckdStage: doc.ckdStage,
          contraindications: doc.contraindications,
          diagnoses: doc.diagnoses,
          dialysisStatus: doc.dialysisStatus,
          dietaryPreferences: doc.dietaryPreferences,
          egfrCurrent: doc.egfrCurrent,
          heightCm: doc.heightCm,
          lastClinicalUpdateAt: doc.lastClinicalUpdateAt,
          medications: doc.medications,
          orgId: doc.orgId,
          principalId: doc.principalId,
          updatedAt: now,
          updatedBy: user.principalId,
          weightKg: doc.weightKg,
        },
        $setOnInsert: {
          createdAt: now,
          createdBy: user.principalId,
          patientId: doc.patientId,
        },
      },
      { upsert: true },
    );

    await piiCollection.updateOne(
      { patientId: user.patientId },
      {
        $addToSet: { onboardingSteps: ONBOARDING_STEPS.Clinical },
        $set: {
          onboardingCompleted: true,
          updatedAt: now,
        },
      },
    );

    return ok({ patientId: user.patientId, requestId }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
