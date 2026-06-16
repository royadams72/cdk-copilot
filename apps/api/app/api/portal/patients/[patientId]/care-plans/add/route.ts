export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type {
  PortalPatientCarePlanCreateData,
  PortalPatientCarePlanDiagnosis,
} from "@/apps/api/lib/portal/patient-shared";
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

type ClinicalDoc = {
  careTeam?: Array<{
    name?: string;
    role?: string;
  }>;
  diagnoses?: Array<{
    code?: string;
    label?: string;
  }>;
};

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date;
  createdAt: Date;
  createdBy: string;
  diagnoses: Array<{
    code?: string;
    key: string;
    label: string;
  }>;
  goals: Array<{
    key: string;
    label: string;
    target?: Record<string, unknown>;
  }>;
  notes?: string;
  orgId: string;
  ownerLabels: string[];
  patientId: ObjectId;
  reviewLabel?: string;
  sources: Array<"manual" | "ai" | "template">;
  status: "draft" | "active" | "completed" | "archived";
  tasks: Array<{
    dueRule?: string;
    freq: "daily" | "weekly" | "once";
    instructions?: string;
    key: string;
    label: string;
    status: "open" | "paused" | "done";
  }>;
  title: string;
  updatedAt: Date;
  updatedBy: string;
};

const CREATE_PAYLOAD = z.object({
  diagnoses: z
    .array(
      z.object({
        code: z.string().trim().optional(),
        label: z.string().trim().min(1).max(120),
      }),
    )
    .default([]),
  frequency: z.enum(["daily", "weekly", "once"]),
  measureUsing: z.string().trim().min(1).max(60),
  ownerLabels: z.array(z.string().trim().min(1).max(80)).default([]),
  reviewLabel: z.string().trim().min(1).max(40),
  target: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(80),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

async function loadScopedPatient(
  db: Awaited<ReturnType<typeof getDb>>,
  caller: Awaited<ReturnType<typeof requireUser>>,
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

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const [patient, clinical] = await Promise.all([
      loadScopedPatient(db, caller, patientObjectId),
      db.collection<ClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { careTeam: 1, diagnoses: 1 } },
      ),
    ]);

    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const mappedPatient = mapPortalPatientDetail(patient);
    const diagnosisOptions = dedupeByLabel(
      (clinical?.diagnoses ?? [])
        .filter((item) => item?.label?.trim())
        .map((item) => ({
          code: item.code?.trim() || null,
          id: item.code?.trim() || slugify(item.label!.trim()),
          label: item.label!.trim(),
        })),
    );
    const ownerOptions = Array.from(
      new Map(
        [
          { id: "patient", label: mappedPatient.name },
          ...(clinical?.careTeam ?? [])
            .filter((entry) => entry?.name?.trim())
            .map((entry, index) => ({
              id: `${slugify(entry.name!.trim())}_${index}`,
              label: entry.role?.trim()
                ? `${entry.role.trim()} ${entry.name!.trim()}`
                : entry.name!.trim(),
            })),
        ].map((item) => [item.label.toLowerCase(), item]),
      ).values(),
    );

    const data: PortalPatientCarePlanCreateData = {
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
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const parsed = CREATE_PAYLOAD.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad("Invalid care plan payload", { issues: parsed.error.flatten() }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const patient = await loadScopedPatient(db, caller, patientObjectId);
    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const now = new Date();
    const { diagnoses, frequency, measureUsing, ownerLabels, reviewLabel, target, title } =
      parsed.data;
    const doc: CarePlanDoc = {
      _id: new ObjectId(),
      activatedAt: now,
      createdAt: now,
      createdBy: caller.principalId,
      diagnoses: diagnoses.map((diagnosis) => ({
        ...(diagnosis.code?.trim() ? { code: diagnosis.code.trim() } : {}),
        key: diagnosis.code?.trim() || slugify(diagnosis.label),
        label: diagnosis.label.trim(),
      })),
      goals: [
        {
          key: slugify(title) || "primary_goal",
          label: title,
          target: { summary: target },
        },
      ],
      orgId: caller.orgId || patient.assignments?.[0]?.orgId || "org_demo",
      ownerLabels,
      patientId: patientObjectId,
      reviewLabel,
      sources: ["manual"],
      status: "active",
      tasks: [
        {
          freq: frequency,
          instructions: `Target to meet: ${target}. Review in: ${reviewLabel}.`,
          key: "measure_progress",
          label: measureUsing,
          status: "open",
        },
      ],
      title,
      updatedAt: now,
      updatedBy: caller.principalId,
    };

    await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).insertOne(doc);

    return ok({ carePlanId: doc._id.toHexString() }, 201);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to create care plan",
      undefined,
      error?.status || 500,
    );
  }
}
