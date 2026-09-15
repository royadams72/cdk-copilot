export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  ensurePatientTargetsSeeded,
  findTargetsCurrentDoc,
  isStructuredTargetState,
  type TargetsCurrentDoc,
} from "@/apps/api/lib/utils/targets";
import { COLLECTIONS } from "@ckd/core/server";
import { ONBOARDING_STEPS, ROLES } from "@ckd/core";

export async function POST(req: NextRequest) {
  const caller = await requireUser(req);
  if (caller.role !== ROLES.Patient || !caller.patientId || !ObjectId.isValid(caller.patientId)) {
    return bad("Patient context missing", undefined, 403);
  }
  const body = await req.json().catch(() => null);
  if (body?.confirmed !== true) {
    return bad("Target review confirmation is required", undefined, 400);
  }
  const db = await getDb();
  const patientId = new ObjectId(caller.patientId);
  const piiCollection = db.collection(COLLECTIONS.UsersPII);
  const patient = await piiCollection.findOne({ patientId }, { projection: { onboardingCompleted: 1, onboardingSteps: 1 } });
  if (patient?.onboardingCompleted === true) {
    return ok({ alreadyCompleted: true });
  }
  if (!Array.isArray(patient?.onboardingSteps) || !patient.onboardingSteps.includes(ONBOARDING_STEPS.Clinical)) {
    return bad("Complete the clinical form first", undefined, 409);
  }
  await ensurePatientTargetsSeeded(db, {
    orgId: caller.orgId,
    patientId,
    seedPrincipalId: caller.principalId,
  });
  // Accounts that started onboarding under the old auto-seeding behavior have
  // no selection flag. Confirmation leaves references inactive unless chosen.
  const current = await findTargetsCurrentDoc(db, patientId);
  if (!current?.targets || !Object.values(current.targets).some(isStructuredTargetState)) {
    return bad("No targets available for review", undefined, 409);
  }
  if (current?._id && current.targets) {
    for (const [metric, state] of Object.entries(current.targets)) {
      if (!isStructuredTargetState(state) || state.generalReferenceSelected !== undefined) continue;
      const legacyCareTeam = state.overrideMeta?.setBy.actorType === "clinician"
        ? state.override ?? null : null;
      const legacyPersonal = state.overrideMeta?.setBy.actorType === "user"
        ? state.override ?? null : null;
      const careTeamTarget = state.careTeamTarget ?? legacyCareTeam;
      const personalGoal = state.personalGoal ?? legacyPersonal;
      const effective = careTeamTarget ?? personalGoal ?? null;
      const nextState = {
        ...state,
        careTeamTarget,
        ...(legacyCareTeam ? { careTeamTargetMeta: state.overrideMeta } : {}),
        effective,
        generalReferenceSelected: false,
        override: careTeamTarget ?? personalGoal,
        overrideMeta: careTeamTarget || personalGoal ? state.overrideMeta ?? null : null,
        ...(legacyPersonal ? { personalGoalMeta: state.overrideMeta } : {}),
      };
      const now = new Date();
      await db.collection(COLLECTIONS.TargetsLedger).insertOne({
        after: effective,
        before: state.effective ?? state.recommended,
        createdAt: now,
        createdBy: { actorType: "user", principalId: caller.principalId },
        domain: state.domain,
        eventType: effective ? "user_changed_target" : "manual_target_removed",
        metric,
        orgId: caller.orgId ?? "org_demo",
        patientId,
        reason: "Confirmed target review without selecting legacy general reference",
        superseded: false,
      });
      await db.collection<TargetsCurrentDoc>(COLLECTIONS.TargetsCurrent).updateOne(
        { _id: current._id },
        { $set: {
          [`targets.${metric}`]: nextState,
          updatedAt: now,
          updatedBy: { actorType: "user", principalId: caller.principalId },
        } },
      );
    }
  }
  const now = new Date();
  await piiCollection.updateOne(
    { patientId },
    {
      $addToSet: { onboardingSteps: ONBOARDING_STEPS.Targets },
      $set: { onboardingCompleted: true, updatedAt: now },
    },
  );
  return ok({ confirmedAt: now.toISOString() });
}
