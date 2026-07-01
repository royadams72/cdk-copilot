export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  PatientWorseningTrendCheckIn,
  PatientWorseningTrendCheckInRequest,
  WORSENING_TREND_RULES,
} from "@ckd/core";
import {
  COLLECTIONS,
  type TWorseningTrendCheckInDoc,
} from "@ckd/core/server";

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== "patient" ||
      !caller.patientId ||
      !caller.principalId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad(
        "Patient session required",
        { code: "patient_session_required" },
        403,
      );
    }

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = PatientWorseningTrendCheckInRequest.safeParse(body);
    if (!parsed.success) {
      return bad(
        "Invalid worsening trend check-in",
        parsed.error.flatten(),
        400,
      );
    }

    const { alertId, key, responseCode } = parsed.data;
    const rule = WORSENING_TREND_RULES[key];
    const prompt = rule.checkInPrompt;
    if (!prompt) {
      return bad(
        "This worsening trend does not accept a patient check-in",
        undefined,
        400,
      );
    }

    const option = prompt.options.find((entry) => entry.code === responseCode);
    if (!option) {
      return bad("Invalid worsening trend response option", undefined, 400);
    }

    const patientId = new ObjectId(caller.patientId);
    const now = new Date();
    const db = await getDb();

    const result = await db
      .collection<TWorseningTrendCheckInDoc>(COLLECTIONS.WorseningTrendCheckIns)
      .findOneAndUpdate(
        {
          alertId,
          patientId,
        },
        {
          $set: {
            key,
            orgId: caller.orgId ?? "org_demo",
            principalId: caller.principalId,
            promptQuestion: prompt.question,
            responseCode: option.code,
            responseLabel: option.label,
            submittedAt: now,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            patientId,
          },
        },
        { returnDocument: "after", upsert: true },
      );

    await db.collection(COLLECTIONS.WorseningTrendStates).updateOne(
      {
        episodeId: alertId,
        patientId,
      },
      {
        $set: {
          updatedAt: now,
          viewedAt: now,
        },
      },
    );

    if (!result) {
      return bad("Unable to save worsening trend check-in", undefined, 500);
    }

    const saved = PatientWorseningTrendCheckIn.parse({
      alertId: result.alertId,
      createdAt: result.createdAt.toISOString(),
      key: result.key,
      orgId: result.orgId,
      patientId: result.patientId.toHexString(),
      principalId: result.principalId,
      promptQuestion: result.promptQuestion,
      responseCode: result.responseCode,
      responseLabel: result.responseLabel,
      submittedAt: result.submittedAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    });

    return ok(saved);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to save worsening trend check-in",
      undefined,
      error?.status || 500,
    );
  }
}
