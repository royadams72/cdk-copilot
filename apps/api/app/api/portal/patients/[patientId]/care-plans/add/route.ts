export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { ConditionFormItem } from "@ckd/core";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import type { CarePlanMongoDoc } from "@/apps/api/lib/care-plans/shared";
import {
  buildCarePlanDiagnosisActivityNote,
  formatCarePlanReviewLabel,
  makeCarePlanActivityKey,
  normalizeCarePlanLabel,
  normalizeCarePlanReviewLabel,
  slugifyCarePlanLabel,
  stableCarePlanKey,
} from "@/apps/api/lib/care-plans/shared";
import { getDb } from "@/apps/api/lib/db/mongodb";
import {
  actorTypeFromRole,
  type ConditionCurrentEntry,
  type HealthProfileLedgerEventDoc,
  type HealthProfilesCurrentDoc,
  toConditionCurrentEntry,
} from "@/apps/api/lib/health-profiles/shared";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { sendPatientPushNotification } from "@/apps/api/lib/utils/pushNotifications";
import type {
  PortalPatientCarePlanCreateData,
  PortalPatientCarePlanDiagnosis,
} from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientAccessMatch,
  buildPortalPatientDetailPipeline,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

type TConditionFormItem = z.infer<typeof ConditionFormItem>;

type CarePlanClinicalDoc = {
  careTeam?: Array<{
    name?: string;
    role?: string;
  }>;
  diagnoses?: Array<{
    code?: string;
    label?: string;
  }>;
};

type StaffProfileDoc = {
  displayName?: string;
  firstName?: string;
  isActive?: boolean;
  jobTitle?: string;
  lastName?: string;
  orgId?: string;
  principalId: string;
  title?: string;
};

const CREATE_PAYLOAD = z.object({
  action: z
    .enum(["activate_and_notify", "save_as_draft"])
    .default("activate_and_notify"),
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
  reviewLabel: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((value, ctx) => {
      const normalized = normalizeCarePlanReviewLabel(value);
      if (!normalized) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid review label",
        });
        return z.NEVER;
      }
      return normalized;
    }),
  target: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(80),
});

async function loadScopedPatient(
  db: Awaited<ReturnType<typeof getDb>>,
  caller: Awaited<ReturnType<typeof requireUser>>,
  patientObjectId: ObjectId,
) {
  return db
    .collection(COLLECTIONS.Patients)
    .aggregate<RawPortalPatientDetailDoc>(
      buildPortalPatientDetailPipeline({
        ...buildPortalPatientAccessMatch(caller),
        _id: patientObjectId,
      }),
    )
    .next();
}

function dedupeByLabel(items: PortalPatientCarePlanDiagnosis[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const token = item.label.trim().toLowerCase();
    if (!token || seen.has(token)) return false;
    seen.add(token);
    return true;
  });
}

function buildReviewOptions() {
  return [
    { id: "1_week", label: "1 week" },
    { id: "2_weeks", label: "2 weeks" },
    { id: "1_month", label: "1 month" },
    { id: "3_months", label: "3 months" },
  ];
}

function buildFrequencyOptions() {
  return [
    { id: "daily", label: "Daily" },
    { id: "weekly", label: "Weekly" },
    { id: "once", label: "Once" },
  ];
}

function buildActionOptions() {
  return [
    {
      id: "activate_and_notify",
      label: "Add care plan and send to patient",
    },
    {
      id: "save_as_draft",
      label: "Save as draft",
    },
  ];
}

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function formatStaffDisplayName(doc: StaffProfileDoc) {
  return (
    doc.displayName?.trim() ||
    formatActorName([doc.title, doc.firstName, doc.lastName]) ||
    formatActorName([doc.firstName, doc.lastName]) ||
    null
  );
}

async function appendDiagnosesToHealthProfiles(params: {
  caller: Awaited<ReturnType<typeof requireUser>>;
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
    .reduce<ConditionCurrentEntry[]>((acc, entry) => {
      if (acc.some((candidate) => candidate.entryId === entry.entryId))
        return acc;
      acc.push(entry);
      return acc;
    }, []);
  const existingKeys = new Set(
    existingEntries.map(
      (entry) =>
        `${entry.value.condition.codeSystem}|${entry.value.condition.code}|${normalizeCarePlanLabel(
          entry.value.condition.label,
        )}`,
    ),
  );
  const newEntries = diagnoses
    .filter((condition) => {
      const token = `${condition.codeSystem}|${condition.code}|${normalizeCarePlanLabel(condition.label)}`;
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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad(
        "Portal staff session required",
        { code: "portal_staff_required" },
        403,
      );
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const [patient, clinical, healthProfilesCurrentDocs, staffProfiles] =
      await Promise.all([
        loadScopedPatient(db, caller, patientObjectId),
        db
          .collection<CarePlanClinicalDoc>(COLLECTIONS.UsersClinical)
          .findOne(
            { patientId: patientObjectId },
            { projection: { careTeam: 1, diagnoses: 1 } },
          ),
        db
          .collection<HealthProfilesCurrentDoc>(
            COLLECTIONS.HealthProfilesCurrent,
          )
          .find(
            { patientId: patientObjectId },
            { projection: { conditions: 1 } },
          )
          .toArray(),
        db
          .collection<StaffProfileDoc>(COLLECTIONS.UsersStaff)
          .find(
            {
              ...(caller.orgId ? { orgId: caller.orgId } : {}),
              isActive: true,
            },
            {
              projection: {
                _id: 0,
                displayName: 1,
                firstName: 1,
                jobTitle: 1,
                lastName: 1,
                orgId: 1,
                principalId: 1,
                title: 1,
              },
              sort: { lastName: 1, firstName: 1 },
            },
          )
          .toArray(),
      ]);

    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const mappedPatient = mapPortalPatientDetail(patient);
    const healthProfileConditions = healthProfilesCurrentDocs
      .flatMap((doc) => doc.conditions ?? [])
      .reduce<
        Array<{
          code?: string;
          codeSystem?: "SNOMED_CT" | "CUSTOM";
          entryId: string;
          label: string;
        }>
      >((acc, entry) => {
        if (acc.some((candidate) => candidate.entryId === entry.entryId))
          return acc;
        acc.push({
          code: entry.value.condition.code?.trim() || undefined,
          codeSystem:
            entry.value.condition.codeSystem === "SNOMED_CT" ||
            entry.value.condition.codeSystem === "CUSTOM"
              ? entry.value.condition.codeSystem
              : undefined,

          entryId: entry.entryId,
          label: entry.value.condition.label.trim(),
        });
        return acc;
      }, []);
    const diagnosisOptions = dedupeByLabel([
      ...healthProfileConditions.map((entry) => ({
        id: entry.entryId,
        code: entry.code || null,
        codeSystem: entry.codeSystem ?? null,
        label: entry.label,
      })),
      ...(clinical?.diagnoses ?? [])
        .filter((item) => item?.label?.trim())
        .map((item) => ({
          id: item.code?.trim() || slugifyCarePlanLabel(item.label!.trim()),
          code: item.code?.trim() || null,
          codeSystem: item.code?.trim() ? ("SNOMED_CT" as const) : null,
          label: item.label!.trim(),
        })),
    ]);
    const staffOwnerOptions = staffProfiles
      .map((staff) => {
        const label = formatStaffDisplayName(staff);
        if (!label) return null;
        return {
          id: staff.principalId,
          label,
        };
      })
      .filter((item): item is { id: string; label: string } => Boolean(item));

    const fallbackCareTeamOptions = (clinical?.careTeam ?? [])
      .filter((entry) => entry?.name?.trim())
      .map((entry, index) => ({
        id: `${slugifyCarePlanLabel(entry.name!.trim())}_${index}`,
        label: entry.role?.trim()
          ? `${entry.role.trim()} ${entry.name!.trim()}`
          : entry.name!.trim(),
      }));

    const ownerOptions = Array.from(
      new Map(
        [
          { id: "patient", label: `${mappedPatient.name} (Patient)` },
          ...(staffOwnerOptions.length
            ? staffOwnerOptions
            : fallbackCareTeamOptions),
        ].map((item) => [item.label.toLowerCase(), item]),
      ).values(),
    );

    const data: PortalPatientCarePlanCreateData = {
      actionOptions: buildActionOptions(),
      diagnosisOptions,
      frequencyOptions: buildFrequencyOptions(),
      headline: `Add Care Plan ${mappedPatient.name}`,
      ownerOptions,
      patient: mappedPatient,
      reviewOptions: buildReviewOptions(),
    };

    return ok(data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plan form",
      undefined,
      error?.status || 500,
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad(
        "Portal staff session required",
        { code: "portal_staff_required" },
        403,
      );
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const parsed = CREATE_PAYLOAD.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad(
        "Invalid care plan payload",
        { issues: parsed.error.flatten() },
        400,
      );
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const patient = await loadScopedPatient(db, caller, patientObjectId);
    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const now = new Date();
    const {
      action,
      diagnoses,
      frequency,
      measureUsing,
      notes,
      ownerLabels,
      reviewLabel,
      target,
      title,
    } = parsed.data;
    const normalizedDiagnoses: TConditionFormItem[] = diagnoses.map(
      (diagnosis) => ({
        code:
          diagnosis.code?.trim() ||
          slugifyCarePlanLabel(diagnosis.label) ||
          stableCarePlanKey(["custom-condition", diagnosis.label.trim()]),
        codeSystem:
          diagnosis.codeSystem ??
          (diagnosis.code?.trim() ? "SNOMED_CT" : "CUSTOM"),
        label: diagnosis.label.trim(),
        status: "active",
      }),
    );
    const shouldActivate = action === "activate_and_notify";
    const createdActivityAt = new Date(now);
    const activatedActivityAt = shouldActivate
      ? new Date(now.getTime() + 1)
      : null;
    const doc: CarePlanMongoDoc = {
      _id: new ObjectId(),
      activity: [
        {
          type: "created",
          at: createdActivityAt,
          by: caller.principalId,
          ...(shouldActivate
            ? {
                note: "Created care plan and prepared it for patient notification.",
              }
            : {
                note:
                  buildCarePlanDiagnosisActivityNote(normalizedDiagnoses) ??
                  "Created care plan draft.",
              }),
          key: makeCarePlanActivityKey(
            "created",
            createdActivityAt,
            caller.principalId,
          ),
        },
        ...(shouldActivate && activatedActivityAt
          ? [
              {
                type: "activated" as const,
                at: activatedActivityAt,
                by: caller.principalId,
                key: makeCarePlanActivityKey(
                  "activated",
                  activatedActivityAt,
                  caller.principalId,
                ),
                note:
                  buildCarePlanDiagnosisActivityNote(normalizedDiagnoses) ??
                  "Activated care plan and notified the patient.",
              },
            ]
          : []),
      ],
      createdAt: now,
      createdBy: caller.principalId,
      diagnoses: normalizedDiagnoses.map((diagnosis) => ({
        ...(diagnosis.code?.trim() ? { code: diagnosis.code.trim() } : {}),
        codeSystem: diagnosis.codeSystem,
        key: diagnosis.code.trim(),
        label: diagnosis.label,
      })),
      goals: [
        {
          key: slugifyCarePlanLabel(title) || "primary_goal",
          label: title,
          target: { summary: target },
        },
      ],
      ...(notes?.trim() ? { notes: notes.trim() } : {}),
      orgId: caller.orgId || patient.assignments?.[0]?.orgId || "org_demo",
      ownerLabels,
      patientId: patientObjectId,
      reviewLabel,
      sources: ["manual"],
      status: shouldActivate ? "active" : "draft",
      tasks: [
        {
          freq: frequency,
          instructions: `Target to meet: ${target}. Review in: ${formatCarePlanReviewLabel(reviewLabel)}.`,
          key: "measure_progress",
          label: measureUsing,
          status: "open",
        },
      ],
      title,
      updatedAt: now,
      updatedBy: caller.principalId,
      ...(shouldActivate ? { activatedAt: now } : {}),
    };

    await db.collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans).insertOne(doc);
    await appendDiagnosesToHealthProfiles({
      caller,
      db,
      diagnoses: normalizedDiagnoses,
      patientId: patientObjectId,
    });
    if (shouldActivate) {
      await sendPatientPushNotification(db, {
        body: `Your care team added "${doc.title}" to guide your next steps and daily tasks.`,
        data: {
          carePlanId: doc._id.toHexString(),
          screen: `/(dashboard)/care-plan?id=${doc._id.toHexString()}`,
          type: "care-plan-created",
        },
        patientId,
        title: "New care plan added",
      }).catch((pushError) => {
        console.error("[care-plan:add] push failed", pushError);
      });
    }

    return ok({ carePlanId: doc._id.toHexString() }, 201);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to create care plan",
      undefined,
      error?.status || 500,
    );
  }
}
