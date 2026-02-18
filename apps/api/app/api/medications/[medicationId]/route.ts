export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  applyMedicationEvent,
  emptyMedicationState,
  rebuildAndUpsertMedicationCurrent,
} from "@/apps/api/lib/utils/medicationsProjection";
import type {
  MedicationEventDoc,
  MedicationEventType,
  MedicationState,
  MedicationStatus,
} from "@/apps/api/lib/utils/medicationsProjection";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function normalizeDose(value: string) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return "";
  const match = cleaned.match(
    /^(\d+(?:\.\d+)?)\s*(mg|mcg|g|ml|units?|tablet(?:s)?|capsule(?:s)?|puff(?:s)?|drop(?:s)?)$/i,
  );
  if (!match) return cleaned;
  const amount = match[1];
  const unit = match[2].toLowerCase();
  return `${amount} ${unit}`;
}

function normalizeFrequency(value: string) {
  const cleaned = cleanText(value).toLowerCase();
  if (!cleaned) return "";

  const map: Record<string, string> = {
    bid: "twice daily",
    od: "once daily",
    prn: "as needed",
    qd: "once daily",
    qid: "four times daily",
    tid: "three times daily",
  };
  return map[cleaned] ?? cleaned;
}

function mapOut(state: MedicationState) {
  return {
    id: state.medicationId.toString(),
    dmplusdCode: state.dmplusdCode,
    dose: state.dose,
    drugRefId: state.drugRefId ? state.drugRefId.toString() : null,
    endAt: state.endAt ? state.endAt.toISOString() : null,
    form: state.form,
    frequency: state.frequency,
    instructions: state.instructions,
    latestReason: state.latestReason,
    name: state.name,
    route: state.route,
    snomedCode: state.snomedCode,
    startAt: state.startAt ? state.startAt.toISOString() : null,
    status: state.status,
    updatedAt: state.updatedAt ? state.updatedAt.toISOString() : null,
  };
}

export async function GET(
  req: NextRequest,
  { params }: { params: { medicationId: string } },
) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }
    if (!ObjectId.isValid(params.medicationId)) {
      return bad("Invalid medicationId", undefined, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const medicationId = new ObjectId(params.medicationId);
    const events = await db
      .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
      .find({
        medicationId,
        patientId,
      })
      .sort({ at: 1, _id: 1 })
      .toArray();
    if (!events || events.length === 0)
      return bad("Medication not found", undefined, 404);
    let state = emptyMedicationState(
      medicationId,
      patientId,
      caller.orgId ?? "org_demo",
    );
    for (const ev of events) {
      state = applyMedicationEvent(state, ev);
    }
    return ok(mapOut(state));
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { medicationId: string } },
) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }
    if (!ObjectId.isValid(params.medicationId)) {
      return bad("Invalid medicationId", undefined, 400);
    }

    const body = (await req.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const medicationId = new ObjectId(params.medicationId);
    // Query all events for this {patientId, medicationId}
    const events = await db
      .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
      .find({ medicationId, patientId })
      .sort({ at: 1, _id: 1 })
      .toArray();
    if (!events || events.length === 0)
      return bad("Medication not found", undefined, 404);
    let state = emptyMedicationState(
      medicationId,
      patientId,
      caller.orgId ?? "org_demo",
    );
    for (const ev of events) {
      state = applyMedicationEvent(state, ev);
    }

    // Parse/normalize incoming
    const nextName = cleanText(body.name);
    const nextDoseRaw = cleanText(body.dose);
    const nextFrequencyRaw = cleanText(body.frequency);
    const nextRoute = cleanText(body.route).toLowerCase();
    const nextForm = cleanText(body.form).toLowerCase();
    const nextDmplusdCode = cleanText(body.dmplusdCode);
    const nextSnomedCode = cleanText(body.snomedCode);
    const nextDrugRefIdRaw = cleanText(body.drugRefId);
    const nextStatusRaw = cleanText(body.status).toLowerCase() as
      | MedicationStatus
      | "";
    const editReason = cleanText(body.editReason);
    const nextInstructions = cleanText(body.instructions);
    const nextStartAtRaw = cleanText(body.startAt);
    const nextStartAt = nextStartAtRaw ? new Date(nextStartAtRaw) : null;
    if (
      nextStartAtRaw &&
      (!nextStartAt || Number.isNaN(nextStartAt.getTime()))
    ) {
      return bad("Invalid startAt date", undefined, 400);
    }

    const allowedStatus: MedicationStatus[] = [
      "active",
      "paused",
      "stopped",
      "completed",
    ];
    const nextStatus = allowedStatus.includes(nextStatusRaw as MedicationStatus)
      ? (nextStatusRaw as MedicationStatus)
      : state.status;

    // Determine changed fields
    const changed: Array<{
      eventType: MedicationEventType;
      field: string;
      from: any;
      to: any;
    }> = [];
    // name
    if (body.name !== undefined) {
      const norm = titleCase(nextName);
      if (norm !== state.name) {
        changed.push({
          eventType: "name_changed",
          field: "name",
          from: state.name,
          to: norm,
        });
      }
    }
    // dose
    if (body.dose !== undefined) {
      const norm = normalizeDose(nextDoseRaw);
      if (norm !== state.dose) {
        changed.push({
          eventType: "dose_changed",
          field: "dose",
          from: state.dose,
          to: norm,
        });
      }
    }
    // frequency
    if (body.frequency !== undefined) {
      const norm = normalizeFrequency(nextFrequencyRaw);
      if (norm !== state.frequency) {
        changed.push({
          eventType: "frequency_changed",
          field: "frequency",
          from: state.frequency,
          to: norm,
        });
      }
    }
    // route
    if (body.route !== undefined) {
      if (nextRoute !== state.route) {
        changed.push({
          eventType: "route_changed",
          field: "route",
          from: state.route,
          to: nextRoute,
        });
      }
    }
    // form
    if (body.form !== undefined) {
      if (nextForm !== state.form) {
        changed.push({
          eventType: "form_changed",
          field: "form",
          from: state.form,
          to: nextForm,
        });
      }
    }
    // instructions
    if (body.instructions !== undefined) {
      if (nextInstructions !== state.instructions) {
        changed.push({
          eventType: "instructions_changed",
          field: "instructions",
          from: state.instructions,
          to: nextInstructions,
        });
      }
    }
    // startAt
    if (body.startAt !== undefined) {
      const norm = nextStartAt ? nextStartAt : null;
      const prev = state.startAt ? state.startAt.toISOString() : null;
      const normIso = norm ? norm.toISOString() : null;
      if (normIso !== prev) {
        changed.push({
          eventType: "startAt_changed",
          field: "startAt",
          from: state.startAt ? state.startAt.toISOString() : null,
          to: normIso,
        });
      }
    }
    // dmplusdCode
    if (body.dmplusdCode !== undefined) {
      const to = nextDmplusdCode || null;
      if (to !== state.dmplusdCode) {
        changed.push({
          eventType: "dmplusdCode_changed",
          field: "dmplusdCode",
          from: state.dmplusdCode,
          to,
        });
      }
    }
    // snomedCode
    if (body.snomedCode !== undefined) {
      const to = nextSnomedCode || null;
      if (to !== state.snomedCode) {
        changed.push({
          eventType: "snomedCode_changed",
          field: "snomedCode",
          from: state.snomedCode,
          to,
        });
      }
    }
    // drugRefId
    if (body.drugRefId !== undefined) {
      let to: string | null = null;
      if (nextDrugRefIdRaw && ObjectId.isValid(nextDrugRefIdRaw)) {
        to = nextDrugRefIdRaw;
      }
      // state.drugRefId is ObjectId|null
      const prev = state.drugRefId ? state.drugRefId.toString() : null;
      if (to !== prev) {
        changed.push({
          eventType: "drugRefId_changed",
          field: "drugRefId",
          from: prev,
          to,
        });
      }
    }
    // status
    const statusChanged = nextStatus !== state.status;

    // If changing medication details while status is active, require editReason
    const medDetailFields = [
      "name",
      "dose",
      "frequency",
      "route",
      "form",
      "instructions",
      "startAt",
    ];
    const isMedDetailChanged = changed.some((c) =>
      medDetailFields.includes(c.field),
    );
    if (isMedDetailChanged && nextStatus === "active" && !editReason) {
      return bad(
        "Reason for edit is required when changing medication details",
        undefined,
        400,
      );
    }

    // If no changes, return current state
    if (changed.length === 0 && !statusChanged) {
      return ok(mapOut(state));
    }

    const now = new Date();
    const eventDocs: MedicationEventDoc[] = [];
    // Add events for changed fields
    for (const change of changed) {
      let evData: Record<string, unknown> = {
        from: change.from,
        to: change.to,
      };
      eventDocs.push({
        _id: new ObjectId(),
        at: now,
        by: caller.principalId,
        data: evData,
        eventType: change.eventType,
        medicationId,
        orgId: caller.orgId ?? "org_demo",
        patientId,
        reason: editReason || undefined,
      });
    }
    // Status change event
    if (statusChanged) {
      eventDocs.push({
        _id: new ObjectId(),
        at: now,
        by: caller.principalId,
        data: { from: state.status, to: nextStatus },
        eventType: "status_changed",
        medicationId,
        orgId: caller.orgId ?? "org_demo",
        patientId,
        reason: editReason || undefined,
      });
    }
    // Insert events
    if (eventDocs.length > 0) {
      await db
        .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
        .insertMany(eventDocs);
    }
    const replay = await rebuildAndUpsertMedicationCurrent(
      db,
      patientId,
      medicationId,
    );
    if (!replay) return bad("Medication not found", undefined, 404);
    return ok(mapOut(replay.state));
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
