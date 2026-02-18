import { Db, ObjectId } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";

export type MedicationStatus = "active" | "paused" | "stopped" | "completed";

export type MedicationEventType =
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

export type MedicationEventDoc = {
  _id: ObjectId;
  at: Date;
  by: string;
  data?: Record<string, unknown>;
  eventType: MedicationEventType;
  medicationId: ObjectId;
  orgId?: string;
  patientId: ObjectId;
  reason?: string;
};

export type MedicationState = {
  dmplusdCode: string | null;
  dose: string;
  drugRefId: ObjectId | null;
  endAt: Date | null;
  form: string;
  frequency: string;
  instructions: string;
  latestReason: string | null;
  medicationId: ObjectId;
  name: string;
  orgId: string | null;
  patientId: ObjectId;
  route: string;
  snomedCode: string | null;
  startAt: Date | null;
  status: MedicationStatus;
  updatedAt: Date | null;
  updatedBy: string | null;
};

export function emptyMedicationState(
  medicationId: ObjectId,
  patientId: ObjectId,
  orgId: string | null = null,
): MedicationState {
  return {
    dmplusdCode: null,
    dose: "",
    drugRefId: null,
    endAt: null,
    form: "",
    frequency: "",
    instructions: "",
    latestReason: null,
    medicationId,
    name: "",
    orgId,
    patientId,
    route: "",
    snomedCode: null,
    startAt: null,
    status: "active",
    updatedAt: null,
    updatedBy: null,
  };
}

export function applyMedicationEvent(
  state: MedicationState,
  ev: MedicationEventDoc,
): MedicationState {
  const next: MedicationState = { ...state };
  next.updatedAt = ev.at;
  next.updatedBy = ev.by;
  next.orgId = ev.orgId ?? next.orgId;
  if (ev.reason && ev.reason.trim()) next.latestReason = ev.reason.trim();

  const d = (ev.data ?? {}) as Record<string, unknown>;

  switch (ev.eventType) {
    case "created": {
      if (typeof d.name === "string") next.name = d.name;
      if (typeof d.dose === "string") next.dose = d.dose;
      if (typeof d.frequency === "string") next.frequency = d.frequency;
      if (typeof d.route === "string") next.route = d.route;
      if (typeof d.form === "string") next.form = d.form;
      if (typeof d.instructions === "string")
        next.instructions = d.instructions;
      if (d.startAt) next.startAt = new Date(d.startAt as any);
      if (typeof d.status === "string")
        next.status = d.status as MedicationStatus;
      if (typeof d.dmplusdCode === "string") next.dmplusdCode = d.dmplusdCode;
      if (typeof d.snomedCode === "string") next.snomedCode = d.snomedCode;
      if (typeof d.drugRefId === "string" && ObjectId.isValid(d.drugRefId)) {
        next.drugRefId = new ObjectId(d.drugRefId);
      }
      return next;
    }
    case "name_changed": {
      if (typeof d.to === "string") next.name = d.to;
      return next;
    }
    case "dose_changed": {
      if (typeof d.to === "string") next.dose = d.to;
      return next;
    }
    case "frequency_changed": {
      if (typeof d.to === "string") next.frequency = d.to;
      return next;
    }
    case "route_changed": {
      if (typeof d.to === "string") next.route = d.to;
      return next;
    }
    case "form_changed": {
      if (typeof d.to === "string") next.form = d.to;
      return next;
    }
    case "instructions_changed": {
      if (typeof d.to === "string") next.instructions = d.to;
      return next;
    }
    case "startAt_changed": {
      if (d.to === null) next.startAt = null;
      else if (d.to) next.startAt = new Date(d.to as any);
      return next;
    }
    case "dmplusdCode_changed": {
      if (d.to === null) next.dmplusdCode = null;
      else if (typeof d.to === "string") next.dmplusdCode = d.to;
      return next;
    }
    case "snomedCode_changed": {
      if (d.to === null) next.snomedCode = null;
      else if (typeof d.to === "string") next.snomedCode = d.to;
      return next;
    }
    case "drugRefId_changed": {
      if (d.to === null) next.drugRefId = null;
      else if (typeof d.to === "string" && ObjectId.isValid(d.to))
        next.drugRefId = new ObjectId(d.to);
      return next;
    }
    case "status_changed": {
      const to = d.to as any;
      if (to) next.status = to as MedicationStatus;
      if (to === "stopped" || to === "completed") next.endAt = ev.at;
      if (to === "active" || to === "paused") next.endAt = null;
      return next;
    }
    default:
      return next;
  }
}

export async function rebuildAndUpsertMedicationCurrent(
  db: Db,
  patientId: ObjectId,
  medicationId: ObjectId,
) {
  const events = await db
    .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
    .find({ medicationId, patientId })
    .sort({ at: 1, _id: 1 })
    .toArray();

  if (!events.length) return null;

  const seedOrgId = events.find((event) => typeof event.orgId === "string")?.orgId ?? null;
  let state = emptyMedicationState(medicationId, patientId, seedOrgId);
  for (const ev of events) {
    state = applyMedicationEvent(state, ev);
  }

  const lastEvent = events[events.length - 1];
  const now = new Date();
  const currentDoc = {
    _id: medicationId,
    medicationId: state.medicationId,
    orgId: state.orgId ?? undefined,
    patientId: state.patientId,
    name: state.name,
    dose: state.dose,
    frequency: state.frequency,
    route: state.route,
    form: state.form,
    instructions: state.instructions,
    startAt: state.startAt,
    endAt: state.endAt,
    status: state.status,
    drugRefId: state.drugRefId,
    dmplusdCode: state.dmplusdCode,
    snomedCode: state.snomedCode,
    latestReason: state.latestReason,
    updatedAt: state.updatedAt ?? now,
    updatedBy: state.updatedBy ?? lastEvent.by,
    lastEventAt: lastEvent.at,
    lastEventId: lastEvent._id,
  };

  await db
    .collection(COLLECTIONS.MedicationsCurrent)
    .updateOne({ _id: medicationId }, { $set: currentDoc }, { upsert: true });

  return { events, state };
}

