export const runtime = "nodejs";

import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { markPatientEngagementOpened } from "@/apps/api/lib/utils/patientEngagement";
import { ROLES } from "@ckd/core";

const OpenPatientEngagementBody = z.object({
  key: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = await req.json().catch(() => null);
    const parsed = OpenPatientEngagementBody.safeParse(body);
    if (!parsed.success) {
      return bad("Validation failed", parsed.error.flatten(), 400);
    }

    const db = await getDb();
    const opened = await markPatientEngagementOpened(
      db,
      new ObjectId(caller.patientId),
      parsed.data.key,
    );

    return ok({ opened });
  } catch (err: any) {
    return bad(err?.message || "Server error", undefined, err?.status || 500);
  }
}
