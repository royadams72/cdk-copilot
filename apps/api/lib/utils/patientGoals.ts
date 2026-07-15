import {
  PatientGoalActor,
  PatientGoalsCurrent,
  PatientGoalsOverrideRequest,
  PatientGoalsUpdateRequest,
  TPatientGoalActor,
  TPatientGoalCode,
  TPatientGoalDomain,
  TPatientGoalState,
  TPatientGoalsCurrent,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId, type Db } from "mongodb";
import type {
  CarePlanActivityDoc,
  CarePlanGoalDoc,
  CarePlanMongoDoc,
} from "@/apps/api/lib/care-plans/shared";
import { makeCarePlanActivityKey } from "@/apps/api/lib/care-plans/shared";

import type { SessionUser } from "../auth/auth_requireUser";
import { actorTypeFromRole } from "../audit/actors";

type GoalStateDoc = Omit<TPatientGoalState, "selectedAt" | "updatedAt" | "overrideAt"> & {
  selectedAt: Date;
  updatedAt: Date;
  overrideAt?: Date | null;
};

type GoalsCurrentDoc = Omit<
  TPatientGoalsCurrent,
  "_id" | "patientId" | "createdAt" | "updatedAt"
> & {
  _id?: ObjectId;
  patientId: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  goals: GoalStateDoc[];
};

type GoalLedgerDoc = {
  after: GoalStateDoc | null;
  before: GoalStateDoc | null;
  createdAt: Date;
  createdBy: TPatientGoalActor;
  eventType: string;
  goalCode: TPatientGoalCode;
  orgId?: string | null;
  patientId: ObjectId;
  reason?: string | null;
};

const GOAL_METADATA: Record<
  TPatientGoalCode,
  { domain: TPatientGoalDomain; label: string }
> = {
  better_meal_routine: {
    domain: "lifestyle",
    label: "Build a better meal routine",
  },
  general_health: {
    domain: "general",
    label: "Support general health",
  },
  improve_energy: {
    domain: "symptom",
    label: "Improve energy levels",
  },
  increase_protein: {
    domain: "nutrition",
    label: "Increase protein intake",
  },
  reduce_phosphorus: {
    domain: "nutrition",
    label: "Reduce phosphorus intake",
  },
  reduce_potassium: {
    domain: "nutrition",
    label: "Reduce potassium intake",
  },
  reduce_sodium: {
    domain: "nutrition",
    label: "Reduce sodium intake",
  },
  weight_gain: {
    domain: "weight",
    label: "Gain weight",
  },
  weight_loss: {
    domain: "weight",
    label: "Lose weight",
  },
  weight_maintenance: {
    domain: "weight",
    label: "Maintain weight",
  },
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

export function buildPatientGoalActor(caller: SessionUser) {
  return PatientGoalActor.parse({
    actorType: actorTypeFromRole(caller.role),
    displayName: null,
    principalId: caller.principalId,
  });
}

function serializeGoalsCurrent(doc: GoalsCurrentDoc | null) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return PatientGoalsCurrent.parse({
    ...rest,
    _id: _id ? _id.toString() : undefined,
    patientId: rest.patientId.toString(),
  });
}

function cloneGoal(goal: GoalStateDoc | TPatientGoalState | null | undefined) {
  if (!goal) return null;
  return JSON.parse(JSON.stringify(goal)) as GoalStateDoc;
}

function goalsEqual(left: GoalStateDoc | null, right: GoalStateDoc | null) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function getGoalMetadata(code: TPatientGoalCode) {
  return GOAL_METADATA[code];
}

function makeGoalState(input: {
  actor: TPatientGoalActor;
  code: TPatientGoalCode;
  lockedByCareTeam?: boolean;
  notes?: string | null;
  now: Date;
  overrideCode?: TPatientGoalCode | null;
  overrideReason?: string | null;
  priority: number;
  source: GoalStateDoc["source"];
  status?: GoalStateDoc["status"];
}): GoalStateDoc {
  const metadata = getGoalMetadata(input.code);
  return {
    code: input.code,
    domain: metadata.domain,
    effectiveCode: input.overrideCode ?? input.code,
    label: metadata.label,
    lockedByCareTeam: input.lockedByCareTeam ?? false,
    notes: input.notes ?? null,
    overrideAt: input.overrideCode ? input.now : null,
    overrideBy: input.overrideCode ? input.actor : null,
    overrideCode: input.overrideCode ?? null,
    overrideReason: input.overrideReason ?? null,
    priority: input.priority,
    selectedAt: input.now,
    selectedBy: input.actor,
    source: input.source,
    status: input.status ?? "active",
    updatedAt: input.now,
  };
}

function sortGoals(goals: GoalStateDoc[]) {
  return goals
    .slice()
    .sort((left, right) => left.priority - right.priority || left.label.localeCompare(right.label));
}

async function insertGoalLedgerEvent(db: Db, doc: GoalLedgerDoc) {
  await db.collection(COLLECTIONS.PatientGoalsLedger).insertOne(doc);
}

async function upsertGoalsCurrent(
  db: Db,
  input: {
    actor: TPatientGoalActor;
    goals: GoalStateDoc[];
    orgId?: string | null;
    patientId: ObjectId;
  },
) {
  const collection = db.collection<GoalsCurrentDoc>(COLLECTIONS.PatientGoalsCurrent);
  const existing = await collection.findOne({ patientId: input.patientId });
  const now = new Date();

  if (!existing) {
    const doc: GoalsCurrentDoc = {
      createdAt: now,
      createdBy: input.actor,
      goals: sortGoals(input.goals),
      orgId: input.orgId ?? null,
      patientId: input.patientId,
      updatedAt: now,
      updatedBy: input.actor,
    };
    await collection.insertOne(doc);
    return doc;
  }

  await collection.updateOne(
    { _id: existing._id },
    {
      $set: {
        goals: sortGoals(input.goals),
        orgId: input.orgId ?? existing.orgId ?? null,
        updatedAt: now,
        updatedBy: input.actor,
      },
    },
  );

  return {
    ...existing,
    goals: sortGoals(input.goals),
    orgId: input.orgId ?? existing.orgId ?? null,
    updatedAt: now,
    updatedBy: input.actor,
  };
}

async function syncGoalsToCarePlan(
  db: Db,
  input: {
    actor: TPatientGoalActor;
    current: GoalsCurrentDoc;
  },
) {
  const carePlans = db.collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans);
  const now = new Date();
  const activeGoals = sortGoals(
    input.current.goals.filter((goal) => goal.status === "active"),
  );
  const mirroredGoals: CarePlanGoalDoc[] = activeGoals.map((goal) => ({
    key: goal.effectiveCode,
    label: getGoalMetadata(goal.effectiveCode).label,
    target: {
      code: goal.code,
      domain: goal.domain,
      effectiveCode: goal.effectiveCode,
      lockedByCareTeam: goal.lockedByCareTeam,
      mirroredFrom: "patient_goals_current",
      overrideCode: goal.overrideCode ?? null,
      priority: goal.priority,
      source: goal.source,
      status: goal.status,
    },
  }));

  const existing = await carePlans.findOne(
    {
      patientId: input.current.patientId,
      status: { $in: ["active", "draft"] },
    },
    { sort: { activatedAt: -1, updatedAt: -1 } },
  );

  if (!existing) {
    const createdActivityAt = new Date(now);
    const activatedActivityAt = new Date(now.getTime() + 1);
    const activity: CarePlanActivityDoc[] = [
      {
        at: createdActivityAt,
        by: input.actor.principalId,
        key: makeCarePlanActivityKey(
          "created",
          createdActivityAt,
          input.actor.principalId,
        ),
        note: "Created care plan from patient goals.",
        type: "created",
      },
      {
        at: activatedActivityAt,
        by: input.actor.principalId,
        key: makeCarePlanActivityKey(
          "activated",
          activatedActivityAt,
          input.actor.principalId,
        ),
        note: "Activated care plan mirrored from patient_goals_current.",
        type: "activated",
      },
    ];

    await carePlans.insertOne({
      _id: new ObjectId(),
      activatedAt: now,
      activity,
      createdAt: now,
      createdBy: input.actor.principalId,
      diagnoses: [],
      goals: mirroredGoals,
      notes: "Mirrored from patient_goals_current",
      orgId: input.current.orgId ?? "org_demo",
      ownerLabels: [],
      patientId: input.current.patientId,
      sources: ["manual"],
      status: "active",
      tasks: [],
      title: "Active patient goals",
      updatedAt: now,
      updatedBy: input.actor.principalId,
    });
    return;
  }

  await carePlans.updateOne(
    { _id: existing._id },
    {
      $set: {
        goals: mirroredGoals,
        notes: "Mirrored from patient_goals_current",
        updatedAt: now,
        updatedBy: input.actor.principalId,
      },
    },
  );
}

export async function getPatientGoalsCurrent(db: Db, patientId: ObjectId) {
  const collection = db.collection<GoalsCurrentDoc>(COLLECTIONS.PatientGoalsCurrent);
  const doc = await collection.findOne(
    { patientId },
    { sort: { updatedAt: -1, _id: -1 } },
  );
  return serializeGoalsCurrent(doc);
}

export function resolveActivePatientGoals(
  current: TPatientGoalsCurrent | null,
) {
  return (current?.goals ?? [])
    .filter((goal) => goal.status === "active")
    .slice()
    .sort((left, right) => left.priority - right.priority);
}

export async function updatePatientSelectedGoals(
  db: Db,
  caller: SessionUser,
  body: unknown,
) {
  const parsed = PatientGoalsUpdateRequest.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid goal selection payload"), {
      status: 400,
      issues: parsed.error.flatten(),
    });
  }

  const actor = buildPatientGoalActor(caller);
  const patientId = caller.patientId ? caller.patientId : null;
  if (!patientId) {
    throw Object.assign(new Error("Patient context missing"), { status: 403 });
  }

  const patientObjectId = new ObjectId(patientId);
  const selectedGoals = new Set<TPatientGoalCode>(parsed.data.selectedGoals);
  const currentCollection = db.collection<GoalsCurrentDoc>(COLLECTIONS.PatientGoalsCurrent);
  const current = await currentCollection.findOne({ patientId: patientObjectId });
  const now = new Date();

  const nextGoals: GoalStateDoc[] = [];
  const existingByCode = new Map<TPatientGoalCode, GoalStateDoc>();
  for (const goal of current?.goals ?? []) {
    existingByCode.set(goal.code, goal);
  }

  for (const goal of current?.goals ?? []) {
    if (goal.lockedByCareTeam || goal.source !== "patient") {
      if (selectedGoals.has(goal.code)) {
        selectedGoals.delete(goal.code);
      }
      nextGoals.push(goal);
      continue;
    }

    if (selectedGoals.has(goal.code)) {
      selectedGoals.delete(goal.code);
      const nextGoal: GoalStateDoc = {
        ...goal,
        priority: parsed.data.selectedGoals.indexOf(goal.code) + 1,
        status: "active",
        updatedAt: now,
      };
      nextGoals.push(nextGoal);
      if (!goalsEqual(cloneGoal(goal), cloneGoal(nextGoal))) {
        await insertGoalLedgerEvent(db, {
          after: nextGoal,
          before: goal,
          createdAt: now,
          createdBy: actor,
          eventType: "patient_selected",
          goalCode: goal.code,
          orgId: caller.orgId ?? null,
          patientId: patientObjectId,
          reason: null,
        });
      }
      continue;
    }

    if (goal.status !== "inactive") {
      const nextGoal: GoalStateDoc = {
        ...goal,
        status: "inactive",
        updatedAt: now,
      };
      nextGoals.push(nextGoal);
      await insertGoalLedgerEvent(db, {
        after: nextGoal,
        before: goal,
        createdAt: now,
        createdBy: actor,
        eventType: "patient_deselected",
        goalCode: goal.code,
        orgId: caller.orgId ?? null,
        patientId: patientObjectId,
        reason: null,
      });
    } else {
      nextGoals.push(goal);
    }
  }

  for (const code of parsed.data.selectedGoals) {
    if (!selectedGoals.has(code)) continue;
    const existing = existingByCode.get(code);
    if (existing && (existing.lockedByCareTeam || existing.source !== "patient")) {
      continue;
    }
    const nextGoal =
      existing && existing.source === "patient"
        ? {
            ...existing,
            effectiveCode: existing.overrideCode ?? existing.code,
            priority: parsed.data.selectedGoals.indexOf(code) + 1,
            status: "active" as const,
            updatedAt: now,
          }
        : makeGoalState({
            actor,
            code,
            now,
            priority: parsed.data.selectedGoals.indexOf(code) + 1,
            source: "patient",
            status: "active",
          });
    nextGoals.push(nextGoal);
    await insertGoalLedgerEvent(db, {
      after: nextGoal,
      before: existing ?? null,
      createdAt: now,
      createdBy: actor,
      eventType: "patient_selected",
      goalCode: code,
      orgId: caller.orgId ?? null,
      patientId: patientObjectId,
      reason: null,
    });
  }

  const saved = await upsertGoalsCurrent(db, {
    actor,
    goals: nextGoals,
    orgId: caller.orgId ?? null,
    patientId: patientObjectId,
  });
  await syncGoalsToCarePlan(db, { actor, current: saved });
  return serializeGoalsCurrent(saved);
}

export async function applyCareTeamGoalOverride(
  db: Db,
  caller: SessionUser,
  body: unknown,
) {
  const parsed = PatientGoalsOverrideRequest.safeParse(body);
  if (!parsed.success) {
    throw Object.assign(new Error("Invalid goal override payload"), {
      status: 400,
      issues: parsed.error.flatten(),
    });
  }

  const actor = buildPatientGoalActor(caller);
  const input = parsed.data;
  const patientObjectId = new ObjectId(input.patientId);
  const currentCollection = db.collection<GoalsCurrentDoc>(COLLECTIONS.PatientGoalsCurrent);
  const current = await currentCollection.findOne({ patientId: patientObjectId });
  const now = new Date();
  const existing = (current?.goals ?? []).find((goal) => goal.code === input.code) ?? null;

  const nextGoal: GoalStateDoc = {
    ...(existing ??
      makeGoalState({
        actor,
        code: input.code,
        lockedByCareTeam: input.lockedByCareTeam,
        now,
        overrideCode: input.overrideCode ?? null,
        overrideReason: cleanText(input.reason),
        priority: input.priority ?? 1,
        source: caller.role === "dietitian" ? "dietitian" : caller.role === "clinician" ? "clinician" : caller.role === "admin" ? "admin" : "system",
        status: input.status,
        notes: cleanText(input.notes),
      })),
    domain: getGoalMetadata(input.code).domain,
    effectiveCode: input.overrideCode ?? input.code,
    label: getGoalMetadata(input.code).label,
    lockedByCareTeam: input.lockedByCareTeam,
    notes: cleanText(input.notes),
    overrideAt: input.overrideCode ? now : null,
    overrideBy: input.overrideCode ? actor : null,
    overrideCode: input.overrideCode ?? null,
    overrideReason: cleanText(input.reason),
    priority: input.priority ?? existing?.priority ?? 1,
    source:
      caller.role === "dietitian"
        ? "dietitian"
        : caller.role === "clinician"
          ? "clinician"
          : caller.role === "admin"
            ? "admin"
            : "system",
    status: input.status,
    updatedAt: now,
  };

  const nextGoals = [
    ...(current?.goals ?? []).filter((goal) => goal.code !== input.code),
    nextGoal,
  ];

  if (existing) {
    await insertGoalLedgerEvent(db, {
      after: nextGoal,
      before: existing,
      createdAt: now,
      createdBy: actor,
      eventType: input.overrideCode
        ? "care_team_override_set"
        : "care_team_updated",
      goalCode: input.code,
      orgId: caller.orgId ?? null,
      patientId: patientObjectId,
      reason: cleanText(input.reason),
    });
  } else {
    await insertGoalLedgerEvent(db, {
      after: nextGoal,
      before: null,
      createdAt: now,
      createdBy: actor,
      eventType: "care_team_added",
      goalCode: input.code,
      orgId: caller.orgId ?? null,
      patientId: patientObjectId,
      reason: cleanText(input.reason),
    });
  }

  const saved = await upsertGoalsCurrent(db, {
    actor,
    goals: nextGoals,
    orgId: caller.orgId ?? current?.orgId ?? null,
    patientId: patientObjectId,
  });
  await syncGoalsToCarePlan(db, { actor, current: saved });
  return serializeGoalsCurrent(saved);
}
