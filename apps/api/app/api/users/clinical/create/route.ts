export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { treeifyError } from "zod";

import { COLLECTIONS, getCollection } from "@ckd/core/server";
import {
  STEP3,
  TUserClinical,
  TUserClinicalCreate,
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
    console.log("user:", user);

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
      patientId: new ObjectId(insertDto.patientId),
      createdAt: now,
      updatedAt: now,
      createdBy: user.principalId,
      updatedBy: user.principalId,
      lastClinicalUpdateAt: insertDto.lastClinicalUpdateAt ?? now,
    };

    const db = await getDb();
    const collection = getCollection<UserClinicalDoc>(
      db,
      COLLECTIONS.UsersClinical
    );

    const { insertedId } = await collection.insertOne(doc);

    return ok({ _id: insertedId, requestId }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", { requestId }, status);
  }
}
