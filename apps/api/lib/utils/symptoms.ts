import { createHash, randomUUID } from "crypto";

import {
  CreateSymptomRequest,
  ListSymptomsResponse,
  type TSymptomActor,
  type TSymptomEntry,
  type TSymptomHistoryGroup,
  type TSymptomLedgerEvent,
  type TSymptomLedgerEventType,
  type TSymptomStatus,
  UpdateSymptomRequest,
  SymptomClinicianResponse,
  SymptomEntry,
  SymptomTrendDirection,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId, type Db } from "mongodb";
import { treeifyError } from "zod";

import type { SessionUser } from "../auth/auth_requireUser";

type SymptomEntryDoc = Omit<TSymptomEntry, "_id" | "patientId"> & {
  _id?: ObjectId;
  patientId: ObjectId;
};

type SymptomLedgerEventDoc = Omit<
  TSymptomLedgerEvent,
  "_id" | "patientId" | "after" | "before"
> & {
  _id?: ObjectId;
  after: SymptomEntryDoc;
  before: SymptomEntryDoc | null;
  patientId: ObjectId;
};

function actorTypeFromRole(role: SessionUser["role"]): TSymptomActor["actorType"] {
  if (role === "patient") return "patient";
  if (role === "clinician") return "clinician";
  if (role === "dietitian") return "dietitian";
  if (role === "admin") return "admin";
  return "system";
}

export function buildSymptomActor(caller: SessionUser): TSymptomActor {
  return {
    actorType: actorTypeFromRole(caller.role),
    principalId: caller.principalId,
  };
}

export function normalizeSymptomName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cleanText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length ? trimmed : null;
}

function cleanTriggers(value: string[] | undefined) {
  if (!value?.length) return [];
  return Array.from(
    new Set(
      value
        .map((entry) => entry.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  );
}

function serializeSymptomEntry(doc: SymptomEntryDoc): TSymptomEntry {
  return SymptomEntry.parse({
    ...doc,
    _id: doc._id?.toString(),
    patientId: doc.patientId.toString(),
  });
}

function serializeLedgerEvent(doc: SymptomLedgerEventDoc): TSymptomLedgerEvent {
  return {
    after: serializeSymptomEntry(doc.after),
    before: doc.before ? serializeSymptomEntry(doc.before) : null,
    createdAt: doc.createdAt,
    createdBy: doc.createdBy,
    eventType: doc.eventType,
    orgId: doc.orgId ?? null,
    patientId: doc.patientId.toString(),
    symptomId: doc.symptomId,
    _id: doc._id?.toString(),
  };
}

function makeSymptomId(input: {
  normalizedName: string;
  patientId: string;
  recordedAt: Date;
}) {
  const hash = createHash("sha1")
    .update(
      [
        input.patientId,
        input.normalizedName,
        input.recordedAt.toISOString(),
        randomUUID(),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 16);
  return `sym_${hash}`;
}

function nextResolvedAt(status: TSymptomStatus, recordedAt: Date) {
  return status === "resolved" ? recordedAt : null;
}

function toEntryDoc(input: {
  actor: TSymptomActor;
  createdAt?: Date;
  name: string;
  note?: string | null;
  orgId?: string | null;
  patientId: ObjectId;
  recordedAt: Date;
  severity: number;
  source: TSymptomActor["actorType"];
  startedAt?: Date | null;
  status: TSymptomStatus;
  symptomId: string;
  triggers?: string[];
  updatedAt: Date;
}): SymptomEntryDoc {
  const doc: SymptomEntryDoc = {
    createdAt: input.createdAt ?? input.updatedAt,
    createdBy: input.actor,
    name: input.name.trim().replace(/\s+/g, " "),
    normalizedName: normalizeSymptomName(input.name),
    note: cleanText(input.note),
    orgId: input.orgId ?? null,
    patientId: input.patientId,
    recordedAt: input.recordedAt,
    resolvedAt: nextResolvedAt(input.status, input.recordedAt),
    severity: input.severity,
    source: input.source,
    startedAt: input.startedAt ?? null,
    status: input.status,
    symptomId: input.symptomId,
    triggers: cleanTriggers(input.triggers),
    updatedAt: input.updatedAt,
    updatedBy: input.actor,
  };

  const parsed = SymptomEntry.safeParse({
    ...doc,
    patientId: input.patientId.toString(),
  });
  if (!parsed.success) {
    throw Object.assign(new Error("Validation failed"), {
      issues: treeifyError(parsed.error),
      status: 400,
    });
  }

  return doc;
}

export function determineTrendDirection(
  entries: Array<Pick<TSymptomEntry, "recordedAt" | "severity">>,
) {
  if (entries.length < 2) return SymptomTrendDirection.enum.unknown;
  const sorted = [...entries].sort(
    (left, right) =>
      new Date(left.recordedAt).getTime() - new Date(right.recordedAt).getTime(),
  );
  const first = sorted[0]?.severity ?? null;
  const last = sorted[sorted.length - 1]?.severity ?? null;
  if (first == null || last == null) return SymptomTrendDirection.enum.unknown;
  if (last > first) return SymptomTrendDirection.enum.up;
  if (last < first) return SymptomTrendDirection.enum.down;
  return SymptomTrendDirection.enum.flat;
}

export function assertValidStatusTransition(
  previous: TSymptomStatus,
  next: TSymptomStatus,
) {
  if (previous === next) return;
  if (previous === "resolved" && next === "improving") {
    throw Object.assign(
      new Error("Resolved symptoms must be reopened as active before improving"),
      { status: 400 },
    );
  }
}

function eventTypeForTransition(
  previous: TSymptomStatus | null,
  next: TSymptomStatus,
): TSymptomLedgerEventType {
  if (!previous) return "created";
  if (previous === "resolved" && next !== "resolved") return "reopened";
  if (next === "resolved" && previous !== "resolved") return "resolved";
  return "updated";
}

async function readCurrentDocs(db: Db, patientId: ObjectId) {
  return db
    .collection<SymptomEntryDoc>(COLLECTIONS.SymptomsCurrent)
    .find({ patientId })
    .sort({ updatedAt: -1, symptomId: -1 })
    .toArray();
}

async function readLedgerDocs(db: Db, patientId: ObjectId) {
  return db
    .collection<SymptomLedgerEventDoc>(COLLECTIONS.SymptomsLedger)
    .find({ patientId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(500)
    .toArray();
}

export async function listPatientSymptoms(db: Db, patientId: ObjectId) {
  const [currentDocs, ledgerDocs] = await Promise.all([
    readCurrentDocs(db, patientId),
    readLedgerDocs(db, patientId),
  ]);

  const current = currentDocs.map(serializeSymptomEntry);
  const activeSymptoms = current.filter((entry) => entry.status !== "resolved");
  const recentlyResolvedSymptoms = current.filter(
    (entry) => entry.status === "resolved",
  );
  const history = ledgerDocs.map(serializeLedgerEvent);

  return ListSymptomsResponse.parse({
    activeSymptoms,
    current,
    history,
    recentlyResolvedSymptoms,
  });
}

export async function createPatientSymptom(
  db: Db,
  caller: SessionUser,
  input: unknown,
) {
  if (!caller.patientId || !ObjectId.isValid(caller.patientId)) {
    throw Object.assign(new Error("Patient context missing"), { status: 403 });
  }

  const parsed = CreateSymptomRequest.safeParse(input);
  if (!parsed.success) {
    throw Object.assign(new Error("Validation failed"), {
      issues: treeifyError(parsed.error),
      status: 400,
    });
  }

  const actor = buildSymptomActor(caller);
  const now = new Date();
  const patientId = new ObjectId(caller.patientId);
  const recordedAt = parsed.data.recordedAt ?? now;
  const symptomId = makeSymptomId({
    normalizedName: normalizeSymptomName(parsed.data.name),
    patientId: caller.patientId,
    recordedAt,
  });
  const entry = toEntryDoc({
    actor,
    name: parsed.data.name,
    note: parsed.data.note,
    orgId: caller.orgId,
    patientId,
    recordedAt,
    severity: parsed.data.severity,
    source: actor.actorType,
    startedAt: parsed.data.startedAt ?? null,
    status: parsed.data.status,
    symptomId,
    triggers: parsed.data.triggers,
    updatedAt: now,
  });

  const event: SymptomLedgerEventDoc = {
    after: entry,
    before: null,
    createdAt: now,
    createdBy: actor,
    eventType: eventTypeForTransition(null, entry.status),
    orgId: caller.orgId ?? null,
    patientId,
    symptomId,
  };

  await db.collection<SymptomEntryDoc>(COLLECTIONS.SymptomsCurrent).insertOne(entry);
  await db.collection<SymptomLedgerEventDoc>(COLLECTIONS.SymptomsLedger).insertOne(
    event,
  );

  return {
    current: serializeSymptomEntry(entry),
    event: serializeLedgerEvent(event),
  };
}

export async function updatePatientSymptom(
  db: Db,
  caller: SessionUser,
  symptomId: string,
  input: unknown,
) {
  if (!caller.patientId || !ObjectId.isValid(caller.patientId)) {
    throw Object.assign(new Error("Patient context missing"), { status: 403 });
  }
  if (!symptomId.trim()) {
    throw Object.assign(new Error("Symptom id is required"), { status: 400 });
  }

  const parsed = UpdateSymptomRequest.safeParse(input);
  if (!parsed.success) {
    throw Object.assign(new Error("Validation failed"), {
      issues: treeifyError(parsed.error),
      status: 400,
    });
  }

  const patientId = new ObjectId(caller.patientId);
  const currentCollection = db.collection<SymptomEntryDoc>(
    COLLECTIONS.SymptomsCurrent,
  );
  const existing = await currentCollection.findOne({ patientId, symptomId });

  if (!existing) {
    throw Object.assign(new Error("Symptom not found"), { status: 404 });
  }

  const actor = buildSymptomActor(caller);
  const nextStatus = parsed.data.status ?? existing.status;
  assertValidStatusTransition(existing.status, nextStatus);
  const recordedAt = parsed.data.recordedAt ?? existing.recordedAt;
  const updatedAt = new Date();

  const updated = toEntryDoc({
    actor,
    createdAt: existing.createdAt,
    name: existing.name,
    note:
      parsed.data.note !== undefined ? parsed.data.note : (existing.note ?? null),
    orgId: caller.orgId ?? existing.orgId ?? null,
    patientId,
    recordedAt,
    severity: parsed.data.severity ?? existing.severity,
    source: existing.source,
    startedAt:
      parsed.data.startedAt !== undefined
        ? parsed.data.startedAt
        : (existing.startedAt ?? null),
    status: nextStatus,
    symptomId,
    triggers:
      parsed.data.triggers !== undefined
        ? parsed.data.triggers
        : (existing.triggers ?? []),
    updatedAt,
  });

  const event: SymptomLedgerEventDoc = {
    after: updated,
    before: existing,
    createdAt: updatedAt,
    createdBy: actor,
    eventType: eventTypeForTransition(existing.status, updated.status),
    orgId: caller.orgId ?? existing.orgId ?? null,
    patientId,
    symptomId,
  };

  await currentCollection.updateOne(
    { patientId, symptomId },
    {
      $set: {
        name: updated.name,
        normalizedName: updated.normalizedName,
        note: updated.note,
        orgId: updated.orgId ?? null,
        recordedAt: updated.recordedAt,
        resolvedAt: updated.resolvedAt ?? null,
        severity: updated.severity,
        source: updated.source,
        startedAt: updated.startedAt ?? null,
        status: updated.status,
        triggers: updated.triggers,
        updatedAt: updated.updatedAt,
        updatedBy: updated.updatedBy,
      },
    },
  );
  await db.collection<SymptomLedgerEventDoc>(COLLECTIONS.SymptomsLedger).insertOne(
    event,
  );

  return {
    current: serializeSymptomEntry(updated),
    event: serializeLedgerEvent(event),
  };
}

export function buildSymptomHistoryGroups(
  entries: TSymptomEntry[],
): TSymptomHistoryGroup[] {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const grouped = new Map<string, TSymptomEntry[]>();

  for (const entry of entries) {
    const bucket = grouped.get(entry.normalizedName) ?? [];
    bucket.push(entry);
    grouped.set(entry.normalizedName, bucket);
  }

  return Array.from(grouped.entries())
    .map(([normalizedName, bucket]) => {
      const sorted = [...bucket].sort(
        (left, right) =>
          new Date(right.recordedAt).getTime() - new Date(left.recordedAt).getTime(),
      );
      const latestWithNote = sorted.find((entry) => entry.note)?.note ?? null;
      return {
        entries: sorted,
        last30dCount: bucket.filter(
          (entry) => new Date(entry.recordedAt).getTime() >= thirtyDaysAgo,
        ).length,
        last7dCount: bucket.filter(
          (entry) => new Date(entry.recordedAt).getTime() >= sevenDaysAgo,
        ).length,
        latestNote: latestWithNote,
        latestSeverity: sorted[0]?.severity ?? null,
        name: sorted[0]?.name ?? normalizedName,
        normalizedName,
        symptomIds: Array.from(new Set(sorted.map((entry) => entry.symptomId))),
        trendDirection: determineTrendDirection(sorted),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function buildClinicianSymptomResponse(
  db: Db,
  patientId: ObjectId,
) {
  const list = await listPatientSymptoms(db, patientId);
  const groupedHistory = buildSymptomHistoryGroups(
    list.history.map((event: TSymptomLedgerEvent) => event.after),
  );
  const latestNotes = groupedHistory
    .map((group: TSymptomHistoryGroup) => {
      const latestNotedEntry =
        group.entries.find((entry: TSymptomEntry) => entry.note) ?? group.entries[0];
      return {
        name: group.name,
        note: latestNotedEntry?.note ?? null,
        normalizedName: group.normalizedName,
        recordedAt: latestNotedEntry?.recordedAt ?? null,
        symptomId: latestNotedEntry?.symptomId ?? group.symptomIds[0] ?? "",
      };
    })
    .filter((entry: { symptomId: string }) => entry.symptomId);

  return SymptomClinicianResponse.parse({
    activeSymptoms: list.activeSymptoms,
    groupedHistory,
    history: list.history,
    latestNotes,
    patientId: patientId.toString(),
    recentlyResolvedSymptoms: list.recentlyResolvedSymptoms,
  });
}
