export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientCarePlanDetailData } from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

type RawPortalPatientDetailDoc = {
  _id: ObjectId;
  assignments?: Array<{
    careTeamId?: string;
    consentStatus?: string;
    endsAt?: Date | string | null;
    facilityId?: string;
    orgId?: string;
    startsAt?: Date | string | null;
    status?: string;
  }>;
  flags?: string[];
  pii?: {
    dateOfBirth?: Date | string | null;
    email?: string;
    firstName?: string;
    lastName?: string;
  } | null;
  stage?: string | null;
  summary?: {
    lastContactAt?: Date | string | null;
    risk?: "green" | "amber" | "red" | null;
  } | null;
};

type CarePlanGoalDoc = {
  key: string;
  label: string;
  target?: Record<string, unknown>;
};

type CarePlanDiagnosisDoc = {
  code?: string;
  key: string;
  label: string;
};

type CarePlanTaskDoc = {
  dueRule?: string;
  freq: "daily" | "weekly" | "once";
  instructions?: string;
  key: string;
  label: string;
  status: "open" | "paused" | "done";
};

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  createdBy: string;
  diagnoses?: CarePlanDiagnosisDoc[];
  goals?: CarePlanGoalDoc[];
  notes?: string | null;
  ownerLabels?: string[];
  orgId: string;
  patientId: ObjectId;
  reviewLabel?: string | null;
  sources?: Array<"manual" | "ai" | "template">;
  status: "draft" | "active" | "completed" | "archived";
  tasks?: CarePlanTaskDoc[];
  title: string;
  updatedAt: Date;
  updatedBy: string;
};

type UserPiiActorDoc = {
  firstName?: string;
  lastName?: string;
  principalId: string;
};

type UserAccountActorDoc = {
  email?: string;
  principalId: string;
};

type PortalCaller = Awaited<ReturnType<typeof requireUser>>;

function toIso(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function summarizeTarget(target: Record<string, unknown> | undefined) {
  if (!target) return null;

  const parts = Object.entries(target)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);

  return parts.length ? parts.join(" • ") : null;
}

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function prettifyActorToken(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.replace(/^(pr|acc)_/i, "");
  const emailLocalPart = withoutPrefix.includes("@")
    ? withoutPrefix.split("@")[0]
    : withoutPrefix;

  const prettified = emailLocalPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!prettified) return null;

  return prettified
    .split(" ")
    .map((part) =>
      /^[a-z]+$/i.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part,
    )
    .join(" ");
}

async function loadScopedPatient(
  db: Awaited<ReturnType<typeof getDb>>,
  caller: PortalCaller,
  patientObjectId: ObjectId,
) {
  return db
    .collection(COLLECTIONS.Patients)
    .aggregate<RawPortalPatientDetailDoc>([
      {
        $match: {
          ...buildPortalPatientAccessMatch(caller),
          _id: patientObjectId,
        },
      },
      {
        $lookup: {
          as: "pii",
          foreignField: "patientId",
          from: COLLECTIONS.UsersPII,
          pipeline: [
            {
              $project: {
                _id: 0,
                dateOfBirth: 1,
                email: 1,
                firstName: 1,
                lastName: 1,
              },
            },
          ],
          localField: "_id",
        },
      },
      {
        $project: {
          assignments: 1,
          flags: 1,
          pii: { $arrayElemAt: ["$pii", 0] },
          stage: 1,
          summary: 1,
        },
      },
    ])
    .next();
}

async function loadActorNames(
  db: Awaited<ReturnType<typeof getDb>>,
  actorPrincipalIds: string[],
) {
  const [actorPiiDocs, actorAccountDocs] = await Promise.all([
    actorPrincipalIds.length === 0
      ? Promise.resolve([])
      : db
          .collection<UserPiiActorDoc>(COLLECTIONS.UsersPII)
          .find(
            { principalId: { $in: actorPrincipalIds } },
            {
              projection: {
                _id: 0,
                firstName: 1,
                lastName: 1,
                principalId: 1,
              },
            },
          )
          .toArray(),
    actorPrincipalIds.length === 0
      ? Promise.resolve([])
      : db
          .collection<UserAccountActorDoc>(COLLECTIONS.UsersAccounts)
          .find(
            { principalId: { $in: actorPrincipalIds } },
            {
              projection: {
                _id: 0,
                email: 1,
                principalId: 1,
              },
            },
          )
          .toArray(),
  ]);

  const actorNames = new Map<string, string>();
  for (const doc of actorPiiDocs) {
    const name = formatActorName([doc.firstName, doc.lastName]);
    if (name) actorNames.set(doc.principalId, name);
  }
  for (const doc of actorAccountDocs) {
    if (!actorNames.has(doc.principalId)) {
      const fallback =
        prettifyActorToken(doc.principalId) ?? prettifyActorToken(doc.email);
      if (fallback) actorNames.set(doc.principalId, fallback);
    }
  }
  return actorNames;
}

async function buildCarePlanDetailData(
  db: Awaited<ReturnType<typeof getDb>>,
  caller: PortalCaller,
  patientObjectId: ObjectId,
  carePlanObjectId: ObjectId,
) {
  const patient = await loadScopedPatient(db, caller, patientObjectId);
  if (!patient) {
    return { error: bad("Patient not found", { code: "patient_not_found" }, 404) };
  }

  const plan = await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).findOne(
    {
      _id: carePlanObjectId,
      patientId: patientObjectId,
    },
    {
      projection: {
        _id: 1,
        activatedAt: 1,
        completedAt: 1,
        createdAt: 1,
        createdBy: 1,
        diagnoses: 1,
        goals: 1,
        notes: 1,
        ownerLabels: 1,
        orgId: 1,
        patientId: 1,
        reviewLabel: 1,
        sources: 1,
        status: 1,
        tasks: 1,
        title: 1,
        updatedAt: 1,
        updatedBy: 1,
      },
    },
  );

  if (!plan) {
    return { error: bad("Care plan not found", { code: "care_plan_not_found" }, 404) };
  }

  const actorPrincipalIds = Array.from(
    new Set([plan.createdBy, plan.updatedBy].filter(Boolean)),
  );
  const actorNames = await loadActorNames(db, actorPrincipalIds);
  const mappedPatient = mapPortalPatientDetail(patient);

  const data: PortalPatientCarePlanDetailData = {
    headline: `${plan.title} - ${mappedPatient.name}`,
    patient: mappedPatient,
    plan: {
      activatedAt: toIso(plan.activatedAt),
      completedAt: toIso(plan.completedAt),
      createdAt: plan.createdAt.toISOString(),
      createdBy: actorNames.get(plan.createdBy) ?? plan.createdBy,
      diagnoses: (plan.diagnoses ?? []).map((diagnosis) => ({
        code: diagnosis.code ?? null,
        id: diagnosis.key,
        label: diagnosis.label,
      })),
      goals: (plan.goals ?? []).map((goal) => ({
        id: goal.key,
        label: goal.label,
        targetSummary: summarizeTarget(goal.target),
      })),
      id: plan._id.toHexString(),
      notes: plan.notes?.trim() || null,
      ownerLabels: plan.ownerLabels ?? [],
      reviewLabel: plan.reviewLabel?.trim() || null,
      sources: plan.sources ?? [],
      status: plan.status,
      tasks: (plan.tasks ?? []).map((task) => ({
        freq: task.freq,
        id: task.key,
        instructions: task.instructions?.trim() || null,
        label: task.label,
        status: task.status,
      })),
      title: plan.title,
      updatedAt: plan.updatedAt.toISOString(),
      updatedBy: actorNames.get(plan.updatedBy) ?? plan.updatedBy,
    },
  };

  return { data };
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ carePlanId: string; patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { carePlanId, patientId } = await context.params;
    if (!ObjectId.isValid(patientId) || !ObjectId.isValid(carePlanId)) {
      return bad("Invalid care plan request", { code: "invalid_care_plan_request" }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const carePlanObjectId = new ObjectId(carePlanId);
    const result = await buildCarePlanDetailData(
      db,
      caller,
      patientObjectId,
      carePlanObjectId,
    );
    if ("error" in result) return result.error;
    return ok(result.data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plan",
      undefined,
      error?.status || 500,
    );
  }
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ carePlanId: string; patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { carePlanId, patientId } = await context.params;
    if (!ObjectId.isValid(patientId) || !ObjectId.isValid(carePlanId)) {
      return bad("Invalid care plan request", { code: "invalid_care_plan_request" }, 400);
    }

    const body = (await req.json().catch(() => null)) as
      | { action?: string }
      | null;
    if (!["complete", "activate", "archive", "delete"].includes(body?.action ?? "")) {
      return bad("Unsupported care plan action", { code: "unsupported_care_plan_action" }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const carePlanObjectId = new ObjectId(carePlanId);

    const scopedPatient = await loadScopedPatient(db, caller, patientObjectId);
    if (!scopedPatient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const existing = await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).findOne({
      _id: carePlanObjectId,
      patientId: patientObjectId,
    });
    if (!existing) {
      return bad("Care plan not found", { code: "care_plan_not_found" }, 404);
    }

    const now = new Date();

    if (body?.action === "delete") {
      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).deleteOne({
        _id: carePlanObjectId,
        patientId: patientObjectId,
      });
      return ok({ deleted: true });
    }

    if (body?.action === "complete" && existing.status !== "completed") {
      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).updateOne(
        { _id: carePlanObjectId, patientId: patientObjectId },
        {
          $set: {
            completedAt: now,
            status: "completed",
            updatedAt: now,
            updatedBy: caller.principalId,
          },
        },
      );
    }

    if (body?.action === "activate" && existing.status === "draft") {
      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).updateOne(
        { _id: carePlanObjectId, patientId: patientObjectId },
        {
          $set: {
            activatedAt: existing.activatedAt ?? now,
            status: "active",
            updatedAt: now,
            updatedBy: caller.principalId,
          },
          $unset: {
            completedAt: "",
          },
        },
      );
    }

    if (body?.action === "archive" && existing.status === "completed") {
      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).updateOne(
        { _id: carePlanObjectId, patientId: patientObjectId },
        {
          $set: {
            status: "archived",
            updatedAt: now,
            updatedBy: caller.principalId,
          },
        },
      );
    }

    const result = await buildCarePlanDetailData(
      db,
      caller,
      patientObjectId,
      carePlanObjectId,
    );
    if ("error" in result) return result.error;
    return ok(result.data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to update care plan",
      undefined,
      error?.status || 500,
    );
  }
}
