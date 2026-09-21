import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { LEGAL_DOCUMENT_VERSIONS, ONBOARDING_STEPS } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { makeRandomId } from "@/apps/api/lib/http/request";

const Body = z.object({
  privacyAcknowledged: z.literal(true),
  privacyVersion: z.literal(LEGAL_DOCUMENT_VERSIONS.privacy),
  termsAccepted: z.literal(true),
  termsVersion: z.literal(LEGAL_DOCUMENT_VERSIONS.terms),
});

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const requestId = makeRandomId();
  try {
    const caller = await requireUser(req);
    if (!caller.patientId || !ObjectId.isValid(caller.patientId)) {
      return bad("Patient context missing", { requestId }, 403);
    }
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return bad("Validation failed", { requestId }, 400);

    const now = new Date();
    const db = await getDb();
    const result = await db.collection(COLLECTIONS.UsersPII).updateOne(
      { patientId: new ObjectId(caller.patientId) },
      {
        $addToSet: { onboardingSteps: ONBOARDING_STEPS.Legal },
        $set: {
          consentAppTosAt: now,
          consentAppTosVersion: parsed.data.termsVersion,
          consentPrivacyAt: now,
          consentPrivacyVersion: parsed.data.privacyVersion,
          updatedAt: now,
          updatedBy: caller.principalId,
        },
      },
    );
    if (!result.matchedCount) return bad("Patient profile not found", { requestId }, 404);
    return ok({ requestId }, 201);
  } catch (error: any) {
    return bad(error?.message ?? "Unable to save legal acceptance", { requestId }, error?.status ?? 500);
  }
}
