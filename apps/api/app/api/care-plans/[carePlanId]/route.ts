export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";

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
  patientId: ObjectId;
  reviewLabel?: string | null;
  status: "draft" | "active" | "completed" | "archived";
  tasks?: CarePlanTaskDoc[];
  title: string;
  updatedAt: Date;
  updatedBy: string;
};

type UserStaffActorDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
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

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function formatStaffDisplayName(doc: UserStaffActorDoc) {
  return (
    doc.displayName?.trim() ||
    formatActorName([doc.title, doc.firstName, doc.lastName]) ||
    formatActorName([doc.firstName, doc.lastName])
  );
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

function summarizeTarget(target: Record<string, unknown> | undefined) {
  if (!target) return null;
  const parts = Object.entries(target)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return parts.length ? parts.join(" • ") : null;
}

async function loadActorNames(
  db: Awaited<ReturnType<typeof getDb>>,
  actorPrincipalIds: string[],
) {
  const [actorStaffDocs, actorPiiDocs, actorAccountDocs] = await Promise.all([
    actorPrincipalIds.length === 0
      ? Promise.resolve([])
      : db
          .collection<UserStaffActorDoc>(COLLECTIONS.UsersStaff)
          .find(
            { principalId: { $in: actorPrincipalIds } },
            {
              projection: {
                _id: 0,
                displayName: 1,
                firstName: 1,
                lastName: 1,
                principalId: 1,
                title: 1,
              },
            },
          )
          .toArray(),
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
  for (const doc of actorStaffDocs) {
    const name = formatStaffDisplayName(doc);
    if (name) actorNames.set(doc.principalId, name);
  }
  for (const doc of actorPiiDocs) {
    if (actorNames.has(doc.principalId)) continue;
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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ carePlanId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role !== "patient" || !caller.patientId) {
      return bad("Patient session required", { code: "patient_session_required" }, 403);
    }

    const { carePlanId } = await context.params;
    if (!ObjectId.isValid(caller.patientId) || !ObjectId.isValid(carePlanId)) {
      return bad("Invalid care plan request", { code: "invalid_care_plan_request" }, 400);
    }

    const db = await getDb();
    const plan = await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).findOne(
      {
        _id: new ObjectId(carePlanId),
        patientId: new ObjectId(caller.patientId),
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
          patientId: 1,
          reviewLabel: 1,
          status: 1,
          tasks: 1,
          title: 1,
          updatedAt: 1,
          updatedBy: 1,
        },
      },
    );

    if (!plan) {
      return bad("Care plan not found", { code: "care_plan_not_found" }, 404);
    }

    const actorNames = await loadActorNames(
      db,
      Array.from(new Set([plan.createdBy, plan.updatedBy].filter(Boolean))),
    );

    return ok({
      plan: {
        activatedAt: plan.activatedAt?.toISOString() ?? null,
        completedAt: plan.completedAt?.toISOString() ?? null,
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
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plan",
      undefined,
      error?.status || 500,
    );
  }
}
