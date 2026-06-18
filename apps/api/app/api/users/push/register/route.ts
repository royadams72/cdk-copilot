export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
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
      console.log("[push:register] missing patient context", {
        principalId: user.principalId,
      });
      return bad("Patient context missing", undefined, 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = RegisterPushDeviceBody.safeParse(body);
    if (!parsed.success) {
      console.log("[push:register] validation failed", {
        body,
        patientId: user.patientId,
        principalId: user.principalId,
      });
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

    console.log("[push:register] writing token", {
      filter: patientFilter,
      patientId: user.patientId,
      platform: parsed.data.platform,
      principalId: user.principalId,
      pushToken: parsed.data.pushToken,
    });

    const pullResult = await usersPii.updateOne(
      patientFilter,
      {
        $pull: {
          devices: { pushToken: parsed.data.pushToken },
        },
      },
    );

    console.log("[push:register] pull result", {
      filter: patientFilter,
      matchedCount: pullResult.matchedCount,
      modifiedCount: pullResult.modifiedCount,
      patientId: user.patientId,
    });

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

    console.log("[push:register] push result", {
      filter: patientFilter,
      matchedCount: pushResult.matchedCount,
      modifiedCount: pushResult.modifiedCount,
      patientId: user.patientId,
      upsertedCount: pushResult.upsertedCount,
      upsertedId: pushResult.upsertedId ?? null,
    });

    const persisted = await usersPii.findOne(
      patientFilter,
      {
        projection: {
          devices: 1,
          principalId: 1,
          patientId: 1,
        },
      },
    );

    console.log("[push:register] persisted device state", persisted);

    return ok({ registered: true });
  } catch (err: any) {
    console.log("[push:register] failed", err);
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
