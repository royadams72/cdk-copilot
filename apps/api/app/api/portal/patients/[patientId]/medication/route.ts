export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { toIsoDate } from "@/apps/api/lib/format/date";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientMedicationData } from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

type PortalMedicationClinicalDoc = {
  egfrCurrent?: number | null;
  medications?: Array<{
    dose?: string;
    frequency?: string;
    name?: string;
    startedAt?: Date | string | null;
  }>;
};

type MedicationStatus = "active" | "paused" | "stopped" | "completed";

type MedicationCurrentDoc = {
  _id: ObjectId;
  dose?: string;
  form?: string;
  frequency?: string;
  instructions?: string;
  latestReason?: string | null;
  medicationId?: ObjectId;
  name?: string;
  patientId: ObjectId;
  route?: string;
  startAt?: Date | null;
  status?: MedicationStatus;
  updatedAt?: Date | null;
  endAt?: Date | null;
};

type MedicationEventType =
  | "created"
  | "name_changed"
  | "dose_changed"
  | "frequency_changed"
  | "route_changed"
  | "form_changed"
  | "startAt_changed"
  | "dmplusdCode_changed"
  | "snomedCode_changed"
  | "drugRefId_changed"
  | "instructions_changed"
  | "status_changed";

type MedicationLedgerEventDoc = {
  _id: ObjectId;
  at: Date;
  by: string;
  eventType: MedicationEventType;
  medicationId: ObjectId;
  patientId: ObjectId;
  reason?: string | null;
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

function formatEventLabel(eventType: MedicationEventType) {
  if (eventType === "created") return "Medication created";
  if (eventType === "status_changed") return "Status changed";
  if (eventType === "startAt_changed") return "Start date changed";
  if (eventType.endsWith("_changed")) {
    const stem = eventType.replace("_changed", "").replace(/_/g, " ");
    return `${stem.charAt(0).toUpperCase()}${stem.slice(1)} changed`;
  }
  return eventType;
}

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function formatActorFallback(principalId: string) {
  return principalId.startsWith("pr_") ? principalId : principalId;
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
    const patient = await db
      .collection(COLLECTIONS.Patients)
      .aggregate<RawPortalPatientDetailDoc>(
        buildPortalPatientDetailPipeline({
          ...buildPortalPatientAccessMatch(caller),
          _id: patientObjectId,
        }),
      )
      .next();

    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const mappedPatient = mapPortalPatientDetail(patient);

    const [clinical, currentDocs, eventDocs] = await Promise.all([
      db.collection<PortalMedicationClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { _id: 0, egfrCurrent: 1, medications: 1 } },
      ),
      db
        .collection<MedicationCurrentDoc>(COLLECTIONS.MedicationsCurrent)
        .find(
          { patientId: patientObjectId },
          {
            projection: {
              _id: 1,
              dose: 1,
              endAt: 1,
              form: 1,
              frequency: 1,
              instructions: 1,
              latestReason: 1,
              medicationId: 1,
              name: 1,
              route: 1,
              startAt: 1,
              status: 1,
              updatedAt: 1,
            },
          },
        )
        .sort({ updatedAt: -1, startAt: -1, name: 1 })
        .toArray(),
      db
        .collection<MedicationLedgerEventDoc>(COLLECTIONS.MedicationsLedger)
        .find(
          { patientId: patientObjectId },
          {
            projection: {
              _id: 1,
              at: 1,
              by: 1,
              eventType: 1,
              medicationId: 1,
              reason: 1,
            },
          },
        )
        .sort({ at: -1, _id: -1 })
        .limit(12)
        .toArray(),
    ]);

    const actorPrincipalIds = Array.from(new Set(eventDocs.map((event) => event.by)));
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

    const actorLabels = new Map<string, string>();
    for (const doc of actorPiiDocs) {
      const label = formatActorName([doc.firstName, doc.lastName]);
      if (label) {
        actorLabels.set(doc.principalId, label);
      }
    }
    for (const doc of actorAccountDocs) {
      if (actorLabels.has(doc.principalId)) continue;
      if (doc.email?.trim()) {
        actorLabels.set(doc.principalId, doc.email.trim());
      }
    }

    const projectedRows = currentDocs.map((doc) => ({
      dose: doc.dose?.trim() || null,
        endAt: toIsoDate(doc.endAt),
      form: doc.form?.trim() || null,
      frequency: doc.frequency?.trim() || null,
      id: (doc.medicationId ?? doc._id).toString(),
      instructions: doc.instructions?.trim() || null,
      latestReason: doc.latestReason?.trim() || null,
      name: doc.name?.trim() || "Medication",
      route: doc.route?.trim() || null,
      source: "current_projection" as const,
        startAt: toIsoDate(doc.startAt),
      status: doc.status ?? "active",
        updatedAt: toIsoDate(doc.updatedAt),
    }));

    const clinicalRows =
      projectedRows.length === 0
        ? (clinical?.medications ?? []).map((medication, index) => ({
            dose: medication.dose?.trim() || null,
            endAt: null,
            form: null,
            frequency: medication.frequency?.trim() || null,
            id: `clinical-${index}`,
            instructions: null,
            latestReason: null,
            name: medication.name?.trim() || `Medication ${index + 1}`,
            route: null,
            source: "clinical_profile" as const,
            startAt: toIsoDate(medication.startedAt),
            status: "active" as const,
            updatedAt: null,
          }))
        : [];

    const rows = projectedRows.length > 0 ? projectedRows : clinicalRows;
    const activeCount = rows.filter((row) => row.status === "active").length;
    const projectedCount = projectedRows.length;
    const lastUpdatedAt = rows
      .map((row) => row.updatedAt)
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ?? null;

    const data: PortalPatientMedicationData = {
      headline: `Viewing ${mappedPatient.name} - Medication profile`,
      patient: mappedPatient,
      recentEvents: eventDocs.map((event) => ({
        at: event.at.toISOString(),
        by: actorLabels.get(event.by) ?? formatActorFallback(event.by),
        id: event._id.toString(),
        label: formatEventLabel(event.eventType),
        reason: event.reason?.trim() || null,
      })),
      rows,
      summary: {
        activeCount,
        lastUpdatedAt,
        projectedCount,
        totalCount: rows.length,
      },
    };

    return ok(data);
  } catch (error) {
    console.error("[portal/patients/:patientId/medication] request failed", error);
    return bad("Unable to load medication profile", { code: "medication_profile_failed" }, 500);
  }
}
