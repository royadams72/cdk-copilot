export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import type {
  CarePlanActivityDoc,
  CarePlanMongoDoc,
} from "@/apps/api/lib/care-plans/shared";
import {
  formatCarePlanReviewLabel,
  getCarePlanNextReviewAt,
  isCarePlanReviewDue,
  makeCarePlanActivityKey,
} from "@/apps/api/lib/care-plans/shared";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";

const PatientReviewResponseValue = z.enum([
  "understand_diagnosis",
  "know_next_steps",
  "fits_into_routine",
  "need_more_support",
]);

const UpdateCarePlanBody = z.discriminatedUnion("action", [
  z.object({
    action: z.enum(["complete_task", "reopen_task"]),
    taskId: z.string().trim().min(1),
  }),
  z.object({
    action: z.literal("submit_review"),
    note: z.string().trim().max(4000).optional().default(""),
    responses: z.array(PatientReviewResponseValue).max(4).default([]),
  }),
]);

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

function formatPatientReviewResponseLabel(value: z.infer<typeof PatientReviewResponseValue>) {
  switch (value) {
    case "understand_diagnosis":
      return "This care plan helped me understand my diagnosis";
    case "know_next_steps":
      return "I know what I should do next";
    case "fits_into_routine":
      return "This plan fits into my day-to-day routine";
    case "need_more_support":
      return "I still need more support with this plan";
  }
}

function buildPatientReviewActivityNote(input: {
  note?: string;
  responses: Array<z.infer<typeof PatientReviewResponseValue>>;
}) {
  const selected = input.responses.map(formatPatientReviewResponseLabel);
  const sections: string[] = ["Patient review submitted."];
  if (selected.length) {
    sections.push(`Checked: ${selected.join("; ")}.`);
  }
  if (input.note?.trim()) {
    sections.push(`Note: ${input.note.trim()}`);
  }
  return sections.join(" ");
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
    const plan = await db.collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans).findOne(
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
          reviewedAt: 1,
          status: 1,
          tasks: 1,
          title: 1,
          updatedAt: 1,
          updatedBy: 1,
          activity: 1,
        },
      },
    );

    if (!plan) {
      return bad("Care plan not found", { code: "care_plan_not_found" }, 404);
    }
    if (!["active", "completed"].includes(plan.status)) {
      return bad("Care plan not available", { code: "care_plan_not_available" }, 404);
    }

    const actorNames = await loadActorNames(
      db,
      Array.from(
        new Set([plan.createdBy, plan.updatedBy, ...(plan.activity ?? []).map((event) => event.by)].filter(Boolean)),
      ),
    );

    return ok({
      plan: {
        activatedAt: plan.activatedAt?.toISOString() ?? null,
        completedAt: plan.completedAt?.toISOString() ?? null,
        createdAt: plan.createdAt.toISOString(),
        createdBy: actorNames.get(plan.createdBy) ?? plan.createdBy,
        diagnoses: (plan.diagnoses ?? []).map((diagnosis) => ({
          code: diagnosis.code ?? null,
          codeSystem: diagnosis.codeSystem ?? (diagnosis.code ? "SNOMED_CT" : null),
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
        reviewDue: isCarePlanReviewDue(plan),
        reviewLabel: plan.reviewLabel?.trim() || null,
        reviewLabelDisplay: formatCarePlanReviewLabel(plan.reviewLabel),
        reviewedAt: plan.reviewedAt?.toISOString() ?? null,
        nextReviewAt: getCarePlanNextReviewAt(plan)?.toISOString() ?? null,
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
      activity: (plan.activity ?? [])
        .slice()
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .map((event) => ({
          at: event.at.toISOString(),
          by: actorNames.get(event.by) ?? event.by,
          id: event.key,
          note: event.note?.trim() || null,
          type: event.type,
        })),
    });
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

    const parsed = UpdateCarePlanBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad("Invalid care plan update payload", parsed.error.flatten(), 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(caller.patientId);
    const carePlanObjectId = new ObjectId(carePlanId);
    const plan = await db.collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans).findOne({
      _id: carePlanObjectId,
      patientId: patientObjectId,
    });

    if (!plan) {
      return bad("Care plan not found", { code: "care_plan_not_found" }, 404);
    }
    if (plan.status !== "active") {
      return bad(
        "Only active care plans can be updated",
        { code: "care_plan_not_active" },
        409,
      );
    }

    if (parsed.data.action === "submit_review") {
      if (!plan.reviewLabel?.trim()) {
        return bad(
          "This care plan is not set up for review",
          { code: "care_plan_review_not_configured" },
          409,
        );
      }
      if (!isCarePlanReviewDue(plan)) {
        return bad(
          "This care plan is not ready for review yet",
          { code: "care_plan_review_not_due" },
          409,
        );
      }

      const now = new Date();
      await db.collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans).updateOne(
        { _id: carePlanObjectId, patientId: patientObjectId },
        {
          $push: {
            activity: {
              at: now,
              by: caller.principalId,
              key: makeCarePlanActivityKey("patient_reviewed", now, caller.principalId),
              note: buildPatientReviewActivityNote(parsed.data),
              type: "patient_reviewed",
            },
          },
          $set: {
            reviewedAt: now,
            updatedAt: now,
            updatedBy: caller.principalId,
          },
        },
      );

      return ok({ updated: true });
    }

    const taskUpdate = parsed.data;
    const targetTask = (plan.tasks ?? []).find((task) => task.key === taskUpdate.taskId);
    if (!targetTask) {
      return bad("Task not found", { code: "care_plan_task_not_found" }, 404);
    }

    const nextStatus = taskUpdate.action === "complete_task" ? "done" : "open";
    if (targetTask.status === nextStatus) {
      return ok({ updated: false });
    }

    const now = new Date();
    const activityType = taskUpdate.action === "complete_task" ? "task_completed" : "task_reopened";
    await db.collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans).updateOne(
      { _id: carePlanObjectId, patientId: patientObjectId },
      {
        $set: {
          tasks: (plan.tasks ?? []).map((task) =>
            task.key === taskUpdate.taskId ? { ...task, status: nextStatus } : task,
          ),
          updatedAt: now,
          updatedBy: caller.principalId,
        },
        $push: {
          activity: {
            at: now,
            by: caller.principalId,
            key: makeCarePlanActivityKey(activityType, now, caller.principalId),
            note:
              taskUpdate.action === "complete_task"
                ? `Completed task: ${targetTask.label}.`
                : `Reopened task: ${targetTask.label}.`,
            type: activityType,
          },
        },
      },
    );

    return ok({ updated: true });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to update care plan task",
      undefined,
      error?.status || 500,
    );
  }
}
