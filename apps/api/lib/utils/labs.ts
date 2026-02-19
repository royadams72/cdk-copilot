import { Db, ObjectId } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";

export type LabAbnormalFlag = "L" | "LL" | "H" | "HH" | "A" | "N";
export type LabSource = "import" | "integration" | "manual";
export type LabStatus = "final" | "corrected" | "preliminary" | "cancelled";

export type LabRefRange = {
  low?: number | null;
  high?: number | null;
  text?: string | null;
};

export type LabInput = {
  code: string;
  name: string;
  value: number | string;
  unit?: string | null;
  takenAt: Date;
  reportedAt?: Date | null;
  refRange?: LabRefRange | null;
  source: LabSource;
  status: LabStatus;
  sourceAbnormalFlag?: LabAbnormalFlag | null;
  latestReason?: string | null;
  note?: string | null;
  correctionOf?: ObjectId | null;
};

export type LabLedgerDoc = {
  _id: ObjectId;
  orgId: string;
  patientId: ObjectId;
  code: string;
  name: string;
  value: number | string;
  unit?: string | null;
  refRange?: LabRefRange | null;
  takenAt: Date;
  reportedAt?: Date | null;
  source: LabSource;
  status: LabStatus;
  latestReason?: string | null;
  correctionOf?: ObjectId | null;
  sourceAbnormalFlag?: LabAbnormalFlag;
  derivedAbnormalFlag?: LabAbnormalFlag;
  overrideAbnormalFlag?: LabAbnormalFlag;
  effectiveAbnormalFlag?: LabAbnormalFlag;
  abnormalFlag?: LabAbnormalFlag | null;
  note?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

type LabCurrentDoc = {
  _id: ObjectId;
  orgId: string;
  patientId: ObjectId;
  code: string;
  name: string;
  value: number | string;
  unit?: string | null;
  takenAt: Date;
  reportedAt?: Date | null;
  source: LabSource;
  status: LabStatus;
  sourceAbnormalFlag?: LabAbnormalFlag;
  derivedAbnormalFlag?: LabAbnormalFlag;
  overrideAbnormalFlag?: LabAbnormalFlag;
  effectiveAbnormalFlag?: LabAbnormalFlag;
  abnormalFlag?: LabAbnormalFlag | null;
  ledgerId: ObjectId;
  prevLedgerId?: ObjectId | null;
  updatedReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

function toNumberValue(value: number | string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const maybe = Number(value);
    return Number.isFinite(maybe) ? maybe : null;
  }
  return null;
}

export function deriveAbnormalFlag(
  value: number | string,
  refRange?: LabRefRange | null,
): LabAbnormalFlag | null {
  if (!refRange) return null;
  const num = toNumberValue(value);
  if (num === null) return null;

  const low = typeof refRange.low === "number" ? refRange.low : null;
  const high = typeof refRange.high === "number" ? refRange.high : null;

  if (low !== null && num < low) return "L";
  if (high !== null && num > high) return "H";
  if (low !== null || high !== null) return "N";
  return null;
}

function isMoreRecent(newer: LabLedgerDoc, current: LabCurrentDoc) {
  const takenDiff = newer.takenAt.getTime() - current.takenAt.getTime();
  if (takenDiff !== 0) return takenDiff > 0;

  const newerReported = newer.reportedAt?.getTime() ?? 0;
  const currentReported = current.reportedAt?.getTime() ?? 0;
  if (newerReported !== currentReported) return newerReported > currentReported;

  return newer.createdAt.getTime() >= current.createdAt.getTime();
}

export async function writeLabLedgerAndCurrent(
  db: Db,
  args: {
    orgId: string;
    patientId: ObjectId;
    principalId: string;
    input: LabInput;
  },
) {
  const { orgId, patientId, principalId, input } = args;
  const now = new Date();
  const derivedAbnormalFlag = deriveAbnormalFlag(input.value, input.refRange);
  const effectiveAbnormalFlag =
    input.sourceAbnormalFlag ?? derivedAbnormalFlag ?? null;

  const ledgerDoc: LabLedgerDoc = {
    _id: new ObjectId(),
    code: input.code,
    correctionOf: input.correctionOf ?? null,
    createdAt: now,
    createdBy: principalId,
    latestReason: input.latestReason ?? null,
    name: input.name,
    note: input.note ?? null,
    orgId,
    patientId,
    refRange: input.refRange ?? null,
    reportedAt: input.reportedAt ?? null,
    source: input.source,
    status: input.status,
    takenAt: input.takenAt,
    unit: input.unit ?? null,
    updatedAt: now,
    updatedBy: principalId,
    value: input.value,
  };
  if (effectiveAbnormalFlag) {
    ledgerDoc.abnormalFlag = effectiveAbnormalFlag;
  }
  // Keep compatibility with older validators: only persist optional abnormal fields when present.
  if (input.sourceAbnormalFlag) {
    ledgerDoc.sourceAbnormalFlag = input.sourceAbnormalFlag;
  }
  if (derivedAbnormalFlag) {
    ledgerDoc.derivedAbnormalFlag = derivedAbnormalFlag;
  }
  if (effectiveAbnormalFlag) {
    ledgerDoc.effectiveAbnormalFlag = effectiveAbnormalFlag;
  }

  await db.collection<LabLedgerDoc>(COLLECTIONS.LabsLedger).insertOne(ledgerDoc);

  const currentFilter = {
    code: ledgerDoc.code,
    orgId,
    patientId,
    unit: ledgerDoc.unit ?? null,
  };
  const existing = await db
    .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
    .findOne(currentFilter);

  if (existing && !isMoreRecent(ledgerDoc, existing)) {
    return { currentUpdated: false, ledgerId: ledgerDoc._id };
  }

  const currentDoc: Partial<LabCurrentDoc> = {
    code: ledgerDoc.code,
    createdAt: existing?.createdAt ?? now,
    createdBy: existing?.createdBy ?? principalId,
    ledgerId: ledgerDoc._id,
    name: ledgerDoc.name,
    orgId,
    patientId,
    prevLedgerId: existing?.ledgerId ?? null,
    reportedAt: ledgerDoc.reportedAt ?? null,
    source: ledgerDoc.source,
    status: ledgerDoc.status,
    takenAt: ledgerDoc.takenAt,
    unit: ledgerDoc.unit ?? null,
    updatedAt: now,
    updatedBy: principalId,
    updatedReason: ledgerDoc.latestReason ?? "new result",
    value: ledgerDoc.value,
  };
  if (ledgerDoc.effectiveAbnormalFlag) {
    currentDoc.abnormalFlag = ledgerDoc.effectiveAbnormalFlag;
  }
  if (ledgerDoc.sourceAbnormalFlag) {
    currentDoc.sourceAbnormalFlag = ledgerDoc.sourceAbnormalFlag;
  }
  if (ledgerDoc.derivedAbnormalFlag) {
    currentDoc.derivedAbnormalFlag = ledgerDoc.derivedAbnormalFlag;
  }
  if (ledgerDoc.effectiveAbnormalFlag) {
    currentDoc.effectiveAbnormalFlag = ledgerDoc.effectiveAbnormalFlag;
  }

  await db
    .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
    .updateOne(currentFilter, { $set: currentDoc }, { upsert: true });

  return { currentUpdated: true, ledgerId: ledgerDoc._id };
}
