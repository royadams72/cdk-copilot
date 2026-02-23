import { Db, ObjectId } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";

export type LabAbnormalFlag = "L" | "LL" | "H" | "HH" | "A" | "N";
export type LabSource = "import" | "integration" | "manual";
export type LabStatus = "final" | "corrected" | "preliminary" | "cancelled";

export type LabRefRange = {
  high?: number | null;
  low?: number | null;
  text?: string | null;
};

export type LabInput = {
  code: string;
  correctionOf?: ObjectId | null;
  latestReason?: string | null;
  name: string;
  note?: string | null;
  overrideAbnormalFlag?: LabAbnormalFlag | null;
  refRange?: LabRefRange | null;
  reportedAt?: Date | null;
  source: LabSource;
  sourceAbnormalFlag?: LabAbnormalFlag | null;
  status: LabStatus;
  takenAt: Date;
  unit?: string | null;
  value: number | string;
};

export type LabLedgerDoc = {
  _id: ObjectId;
  code: string;
  correctionOf?: ObjectId | null;
  createdAt: Date;
  createdBy: string;
  derivedAbnormalFlag?: LabAbnormalFlag;
  derivedFromRangeId?: ObjectId | null;
  derivedFromRangeVersion?: string | number | null;
  effectiveAbnormalFlag?: LabAbnormalFlag;
  latestReason?: string | null;
  name: string;
  note?: string | null;
  orgId: string;
  overrideAbnormalFlag?: LabAbnormalFlag;
  patientId: ObjectId;
  refRange?: LabRefRange | null;
  reportedAt?: Date | null;
  source: LabSource;
  sourceAbnormalFlag?: LabAbnormalFlag;
  status: LabStatus;
  takenAt: Date;
  unit?: string | null;
  updatedAt: Date;
  updatedBy: string;
  value: number | string;
};

type LabCurrentDoc = {
  _id: ObjectId;
  code: string;
  createdAt: Date;
  createdBy: string;
  derivedAbnormalFlag?: LabAbnormalFlag | null;
  effectiveAbnormalFlag?: LabAbnormalFlag | null;
  ledgerId: ObjectId;
  name: string;
  orgId: string;
  overrideAbnormalFlag?: LabAbnormalFlag | null;
  patientId: ObjectId;
  prevLedgerId?: ObjectId | null;
  refRange?: LabRefRange | null;
  reportedAt?: Date | null;
  source: LabSource;
  sourceAbnormalFlag?: LabAbnormalFlag | null;
  status: LabStatus;
  takenAt: Date;
  unit?: string | null;
  updatedAt: Date;
  updatedBy: string;
  updatedReason?: string | null;
  value: number | string;
};

type ReferenceRangeDoc = {
  _id?: ObjectId;
  criticalHigh?: number | null;
  criticalLow?: number | null;
  loincCode?: string;
  lower?: number | null;
  orgId?: string | null;
  unit?: string | null;
  updatedAt?: Date | string;
  upper?: number | null;
  version?: number;
};

type ResolvedRange = {
  criticalHigh: number | null;
  criticalLow: number | null;
  rangeId: ObjectId | null;
  rangeVersion: string | number | null;
  refRange: LabRefRange | null;
};

function toNumberValue(value: number | string): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const maybe = Number(value);
    return Number.isFinite(maybe) ? maybe : null;
  }
  return null;
}

function normalizeUnit(value?: string | null) {
  return (value ?? "")
    .toLowerCase()
    .replace(/µ/g, "u")
    .replace(/\s+/g, "");
}

function pickBestReferenceRange(
  candidates: ReferenceRangeDoc[],
  unit?: string | null,
): ReferenceRangeDoc | null {
  if (candidates.length === 0) return null;
  if (!unit) {
    return candidates
      .slice()
      .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
  }
  const target = normalizeUnit(unit);
  const exact = candidates.filter(
    (doc) => normalizeUnit(doc.unit ?? null) === target,
  );
  const pool = exact.length > 0 ? exact : candidates;
  return pool
    .slice()
    .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))[0];
}

async function resolveReferenceRangeSnapshot(
  db: Db,
  args: { loincCode: string; orgId?: string | null; unit?: string | null },
): Promise<ResolvedRange | null> {
  const { loincCode, orgId, unit } = args;
  if (!loincCode) return null;

  const projection = {
    _id: 1,
    criticalHigh: 1,
    criticalLow: 1,
    loincCode: 1,
    lower: 1,
    orgId: 1,
    updatedAt: 1,
    unit: 1,
    upper: 1,
    version: 1,
  } as const;

  let match: ReferenceRangeDoc | null = null;
  if (orgId) {
    const orgCandidates = await db
      .collection<ReferenceRangeDoc>(COLLECTIONS.LabsReferenceRanges)
      .find({ loincCode, orgId }, { projection })
      .toArray();
    match = pickBestReferenceRange(orgCandidates, unit);
  }
  if (!match) {
    const fallbackCandidates = await db
      .collection<ReferenceRangeDoc>(COLLECTIONS.LabsReferenceRanges)
      .find({ loincCode }, { projection })
      .toArray();
    match = pickBestReferenceRange(fallbackCandidates, unit);
  }
  if (!match) return null;

  const low = typeof match.lower === "number" ? match.lower : null;
  const high = typeof match.upper === "number" ? match.upper : null;
  const criticalLow =
    typeof match.criticalLow === "number" ? match.criticalLow : null;
  const criticalHigh =
    typeof match.criticalHigh === "number" ? match.criticalHigh : null;
  const rangeId = match._id ?? null;
  const rangeVersion =
    typeof match.version === "number"
      ? match.version
      : match.updatedAt instanceof Date
        ? match.updatedAt.toISOString()
        : typeof match.updatedAt === "string"
          ? match.updatedAt
          : null;
  const refRange = low !== null || high !== null ? { low, high, text: null } : null;

  return { criticalHigh, criticalLow, rangeId, rangeVersion, refRange };
}

export function deriveAbnormalFlag(
  value: number | string,
  range?: {
    criticalHigh?: number | null;
    criticalLow?: number | null;
    high?: number | null;
    low?: number | null;
  } | null,
): LabAbnormalFlag | null {
  if (!range) return null;
  const num = toNumberValue(value);
  if (num === null) return null;

  const low = typeof range.low === "number" ? range.low : null;
  const high = typeof range.high === "number" ? range.high : null;
  const criticalLow =
    typeof range.criticalLow === "number" ? range.criticalLow : null;
  const criticalHigh =
    typeof range.criticalHigh === "number" ? range.criticalHigh : null;

  if (criticalLow !== null && num < criticalLow) return "LL";
  if (criticalHigh !== null && num > criticalHigh) return "HH";
  if (low !== null && num < low) return "L";
  if (high !== null && num > high) return "H";
  if (
    low !== null ||
    high !== null ||
    criticalLow !== null ||
    criticalHigh !== null
  ) {
    return "N";
  }
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
    input: LabInput;
    orgId: string;
    patientId: ObjectId;
    principalId: string;
  },
) {
  const { orgId, patientId, principalId, input } = args;
  const now = new Date();
  const resolvedRange = await resolveReferenceRangeSnapshot(db, {
    loincCode: input.code,
    orgId,
    unit: input.unit ?? null,
  });
  const effectiveRefRange = resolvedRange?.refRange ?? input.refRange ?? null;
  const derivedAbnormalFlag = deriveAbnormalFlag(input.value, {
    criticalHigh: resolvedRange?.criticalHigh ?? null,
    criticalLow: resolvedRange?.criticalLow ?? null,
    high: effectiveRefRange?.high ?? null,
    low: effectiveRefRange?.low ?? null,
  });
  const overrideAbnormalFlag = input.overrideAbnormalFlag ?? null;
  const sourceAbnormalFlag = input.sourceAbnormalFlag ?? null;
  const effectiveDerivedAbnormalFlag =
    overrideAbnormalFlag !== null || sourceAbnormalFlag !== null
      ? null
      : derivedAbnormalFlag;
  const effectiveAbnormalFlag =
    overrideAbnormalFlag ?? sourceAbnormalFlag ?? effectiveDerivedAbnormalFlag ?? null;

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
    refRange: effectiveRefRange,
    reportedAt: input.reportedAt ?? null,
    source: input.source,
    status: input.status,
    takenAt: input.takenAt,
    unit: input.unit ?? null,
    updatedAt: now,
    updatedBy: principalId,
    value: input.value,
  };
  // Keep compatibility with older validators: only persist optional abnormal fields when present.
  if (sourceAbnormalFlag !== null) {
    ledgerDoc.sourceAbnormalFlag = sourceAbnormalFlag;
  }
  if (effectiveDerivedAbnormalFlag !== null) {
    ledgerDoc.derivedAbnormalFlag = effectiveDerivedAbnormalFlag;
  }
  if (overrideAbnormalFlag !== null) {
    ledgerDoc.overrideAbnormalFlag = overrideAbnormalFlag;
  }
  if (effectiveAbnormalFlag !== null) {
    ledgerDoc.effectiveAbnormalFlag = effectiveAbnormalFlag;
  }
  if (
    effectiveDerivedAbnormalFlag !== null &&
    effectiveAbnormalFlag === effectiveDerivedAbnormalFlag &&
    resolvedRange?.rangeId
  ) {
    ledgerDoc.derivedFromRangeId = resolvedRange.rangeId;
    ledgerDoc.derivedFromRangeVersion = resolvedRange.rangeVersion ?? null;
  }

  await db
    .collection<LabLedgerDoc>(COLLECTIONS.LabsLedger)
    .insertOne(ledgerDoc);

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
    refRange: ledgerDoc.refRange ?? null,
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
  if (ledgerDoc.overrideAbnormalFlag) {
    currentDoc.overrideAbnormalFlag = ledgerDoc.overrideAbnormalFlag;
  } else {
    currentDoc.overrideAbnormalFlag = null;
  }
  if (ledgerDoc.sourceAbnormalFlag) {
    currentDoc.sourceAbnormalFlag = ledgerDoc.sourceAbnormalFlag;
  } else {
    currentDoc.sourceAbnormalFlag = null;
  }
  if (ledgerDoc.derivedAbnormalFlag) {
    currentDoc.derivedAbnormalFlag = ledgerDoc.derivedAbnormalFlag;
  } else {
    currentDoc.derivedAbnormalFlag = null;
  }
  if (ledgerDoc.effectiveAbnormalFlag) {
    currentDoc.effectiveAbnormalFlag = ledgerDoc.effectiveAbnormalFlag;
  } else {
    currentDoc.effectiveAbnormalFlag = null;
  }

  await db
    .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
    .updateOne(currentFilter, { $set: currentDoc }, { upsert: true });

  return { currentUpdated: true, ledgerId: ledgerDoc._id };
}
