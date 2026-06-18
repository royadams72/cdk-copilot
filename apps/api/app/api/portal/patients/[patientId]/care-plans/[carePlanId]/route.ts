export const runtime = "nodejs";

import { createHash } from "crypto";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import {
  ConditionFormItem,
  HealthProfileCurrentEntry,
  HealthProfileLedgerEvent,
  HealthProfilesCurrent,
  ROLES,
} from "@ckd/core";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientCarePlanDetailData } from "@/apps/api/lib/portal/patient-shared";
import { sendPatientPushNotification } from "@/apps/api/lib/utils/pushNotifications";
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
  codeSystem?: "SNOMED_CT" | "CUSTOM";
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

type UserStaffActorDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
};

type UserAccountActorDoc = {
  email?: string;
  principalId: string;
};

type PortalCaller = Awaited<ReturnType<typeof requireUser>>;
type TConditionFormItem = z.infer<typeof ConditionFormItem>;
type THealthProfileCurrentEntry = z.infer<typeof HealthProfileCurrentEntry>;
type THealthProfilesCurrent = z.infer<typeof HealthProfilesCurrent>;
type THealthProfileLedgerEvent = z.infer<typeof HealthProfileLedgerEvent>;

type HealthProfilesCurrentDoc = Omit<THealthProfilesCurrent, "patientId"> & {
  patientId: ObjectId;
};

type HealthProfileLedgerEventDoc = Omit<
  THealthProfileLedgerEvent,
  "_id" | "correctionOf" | "patientId"
> & {
  _id: ObjectId;
  correctionOf?: ObjectId | null;
  patientId: ObjectId;
};

const UPDATE_DRAFT_PAYLOAD = z.object({
  action: z.literal("update_draft"),
  diagnoses: z
    .array(
      z.object({
        code: z.string().trim().optional(),
        codeSystem: z.enum(["SNOMED_CT", "CUSTOM"]).optional(),
        label: z.string().trim().min(1).max(120),
      }),
    )
    .default([]),
  frequency: z.enum(["daily", "weekly", "once"]),
  measureUsing: z.string().trim().min(1).max(60),
  notes: z.string().trim().max(2000).optional(),
  ownerLabels: z.array(z.string().trim().min(1).max(80)).default([]),
  reviewLabel: z.string().trim().min(1).max(40),
  target: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(80),
});

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

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function stableKey(parts: string[]) {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 24);
}

function makeConditionEntryId(item: TConditionFormItem) {
  return `hp_condition_${stableKey([
    item.codeSystem,
    item.code,
    normalizeLabel(item.label),
  ])}`;
}

function toConditionCurrentEntry(
  condition: TConditionFormItem,
): THealthProfileCurrentEntry & {
  value: { condition: TConditionFormItem; kind: "condition" };
} {
  return {
    entryId: makeConditionEntryId(condition),
    value: { condition, kind: "condition" },
  };
}

function actorTypeFromRole(role: string) {
  if (role === ROLES.Patient) return "patient";
  if (role === ROLES.Clinician) return "clinician";
  if (role === ROLES.Dietitian) return "dietitian";
  if (role === "admin") return "admin";
  return "system";
}

async function appendDiagnosesToHealthProfiles(params: {
  caller: PortalCaller;
  db: Awaited<ReturnType<typeof getDb>>;
  diagnoses: TConditionFormItem[];
  patientId: ObjectId;
}) {
  const { caller, db, diagnoses, patientId } = params;
  if (!diagnoses.length) return;

  const currentCollection = db.collection<HealthProfilesCurrentDoc>(
    COLLECTIONS.HealthProfilesCurrent,
  );
  const ledgerCollection = db.collection<HealthProfileLedgerEventDoc>(
    COLLECTIONS.HealthProfilesLedger,
  );
  const previousDocs = await currentCollection.find({ patientId }).toArray();
  const existingEntries = previousDocs
    .flatMap((doc) => doc.conditions ?? [])
    .reduce<
      Array<
        THealthProfileCurrentEntry & {
          value: { condition: TConditionFormItem; kind: "condition" };
        }
      >
    >((acc, entry) => {
      if (acc.some((candidate) => candidate.entryId === entry.entryId)) return acc;
      acc.push(entry);
      return acc;
    }, []);
  const existingKeys = new Set(
    existingEntries.map((entry) =>
      `${entry.value.condition.codeSystem}|${entry.value.condition.code}|${normalizeLabel(
        entry.value.condition.label,
      )}`,
    ),
  );
  const newEntries = diagnoses
    .filter((condition) => {
      const token = `${condition.codeSystem}|${condition.code}|${normalizeLabel(condition.label)}`;
      if (existingKeys.has(token)) return false;
      existingKeys.add(token);
      return true;
    })
    .map((condition) => toConditionCurrentEntry(condition));

  if (!newEntries.length) return;

  const now = new Date();
  const actor = {
    actorType: actorTypeFromRole(caller.role),
    principalId: caller.principalId,
  } as const;
  const conditions = [...existingEntries, ...newEntries].sort((a, b) =>
    a.entryId.localeCompare(b.entryId),
  );

  await ledgerCollection.insertMany(
    newEntries.map((entry) => ({
      _id: new ObjectId(),
      after: entry.value,
      before: null,
      createdAt: now,
      createdBy: actor,
      entryId: entry.entryId,
      eventType: "created",
      ...(caller.orgId ? { orgId: caller.orgId } : {}),
      patientId,
      superseded: false,
    })),
    { ordered: true },
  );

  const currentUpdate = {
    $set: {
      conditions,
      ...(caller.orgId ? { orgId: caller.orgId } : {}),
      updatedAt: now,
      updatedBy: actor,
    },
  };

  if (previousDocs.length) {
    await currentCollection.updateMany({ patientId }, currentUpdate);
    return;
  }

  await currentCollection.updateOne(
    { patientId },
    {
      ...currentUpdate,
      $setOnInsert: {
        allergies: [],
        createdAt: now,
        createdBy: actor,
        dietaryPreferences: [],
        patientId,
      },
    },
    { upsert: true },
  );
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

    const rawBody = (await req.json().catch(() => null)) as
      | Record<string, unknown>
      | null;
    const action = typeof rawBody?.action === "string" ? rawBody.action : null;
    if (!["complete", "activate", "archive", "delete", "update_draft"].includes(action ?? "")) {
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

    if (action === "delete") {
      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).deleteOne({
        _id: carePlanObjectId,
        patientId: patientObjectId,
      });
      return ok({ deleted: true });
    }

    if (action === "update_draft") {
      if (existing.status !== "draft") {
        return bad("Only draft care plans can be edited", { code: "care_plan_not_draft" }, 409);
      }

      const parsed = UPDATE_DRAFT_PAYLOAD.safeParse(rawBody);
      if (!parsed.success) {
        return bad("Invalid care plan payload", { issues: parsed.error.flatten() }, 400);
      }

      const normalizedDiagnoses: TConditionFormItem[] = parsed.data.diagnoses.map((diagnosis) => ({
        code:
          diagnosis.code?.trim() ||
          diagnosis.label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_") ||
          stableKey(["custom-condition", diagnosis.label.trim()]),
        codeSystem: diagnosis.codeSystem ?? (diagnosis.code?.trim() ? "SNOMED_CT" : "CUSTOM"),
        label: diagnosis.label.trim(),
        status: "active",
      }));

      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).updateOne(
        { _id: carePlanObjectId, patientId: patientObjectId },
        {
          $set: {
            diagnoses: normalizedDiagnoses.map((diagnosis) => ({
              ...(diagnosis.code?.trim() ? { code: diagnosis.code.trim() } : {}),
              codeSystem: diagnosis.codeSystem,
              key: diagnosis.code.trim(),
              label: diagnosis.label,
            })),
            goals: [
              {
                key:
                  parsed.data.title
                    .toLowerCase()
                    .replace(/[^a-z0-9]+/g, "_")
                    .replace(/^_+|_+$/g, "")
                    .slice(0, 40) || "primary_goal",
                label: parsed.data.title,
                target: { summary: parsed.data.target },
              },
            ],
            ...(parsed.data.notes?.trim()
              ? { notes: parsed.data.notes.trim() }
              : { notes: null }),
            ownerLabels: parsed.data.ownerLabels,
            reviewLabel: parsed.data.reviewLabel,
            tasks: [
              {
                freq: parsed.data.frequency,
                instructions: `Target to meet: ${parsed.data.target}. Review in: ${parsed.data.reviewLabel}.`,
                key: "measure_progress",
                label: parsed.data.measureUsing,
                status: "open",
              },
            ],
            title: parsed.data.title,
            updatedAt: now,
            updatedBy: caller.principalId,
          },
        },
      );

      await appendDiagnosesToHealthProfiles({
        caller,
        db,
        diagnoses: normalizedDiagnoses,
        patientId: patientObjectId,
      });
    }

    if (action === "complete" && existing.status !== "completed") {
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

      const actorNames = await loadActorNames(db, [caller.principalId]);
      const actorName =
        actorNames.get(caller.principalId) ??
        prettifyActorToken(caller.principalId) ??
        "your care team";

      await sendPatientPushNotification(db, {
        body: `${actorName} marked "${existing.title}" as complete.`,
        data: {
          carePlanId: carePlanObjectId.toHexString(),
          screen: `/(dashboard)/care-plan?id=${carePlanObjectId.toHexString()}`,
          type: "care-plan-completed",
        },
        patientId,
        title: "Care plan completed",
      }).catch((pushError) => {
        console.error("[care-plan:complete] push failed", pushError);
      });
    }

    if (action === "activate" && existing.status === "draft") {
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

    if (action === "archive" && existing.status === "completed") {
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
