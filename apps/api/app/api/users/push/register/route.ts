export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, badFromError, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS, getCollection } from "@ckd/core/server";

const RegisterPushDeviceBody = z.object({
  platform: z.enum(["ios", "android", "web"]),
  pushToken: z.string().min(1),
});

type UserPiiPushDoc = {
  devices?: Array<{
    lastSeenAt?: Date;
    platform?: "android" | "ios" | "web";
    pushToken?: string;
  }>;
  patientId?: ObjectId | string;
  principalId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req);
    if (!user.patientId) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = RegisterPushDeviceBody.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", parsed.error.flatten(), 400);
    }

    const db = await getDb();
    const usersPii = getCollection<UserPiiPushDoc>(db, COLLECTIONS.UsersPII);
    const now = new Date();
    const patientObjectId = ObjectId.isValid(user.patientId)
      ? new ObjectId(user.patientId)
      : null;
    const patientFilter = patientObjectId
      ? {
          $or: [
            { patientId: patientObjectId },
            { patientId: user.patientId },
            { principalId: user.principalId },
          ],
        }
      : { principalId: user.principalId };

    await usersPii.updateOne(
      patientFilter,
      {
        $pull: {
          devices: { pushToken: parsed.data.pushToken },
        },
      },
    );

    const pushResult = await usersPii.updateOne(
      patientFilter,
      {
        $push: {
          devices: {
            lastSeenAt: now,
            platform: parsed.data.platform,
            pushToken: parsed.data.pushToken,
          },
        },
        $set: {
          lastActiveAt: now,
          updatedAt: now,
        },
      },
    );
    if (pushResult.matchedCount === 0) {
      console.error("[push:register] no patient profile matched token registration", {
        patientId: user.patientId,
        principalId: user.principalId,
      });
    }

    return ok({ registered: true });
  } catch (err: any) {
    console.error("[push:register] failed", err);
    return badFromError(err);
  }
}
