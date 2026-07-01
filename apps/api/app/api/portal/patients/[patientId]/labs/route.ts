export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { toIsoDate } from "@/apps/api/lib/format/date";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientLabData } from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { TRACKED_LABS } from "@/apps/api/lib/constants/dashboard";
import { hydrateLabReferenceRanges } from "@/apps/api/lib/utils/labs";
import { COLLECTIONS } from "@ckd/core/server";

const RECENT_LAB_HISTORY_LIMIT = 20;

type PortalLabsClinicalDoc = {
  egfrCurrent?: number | null;
};

type LabCurrentDoc = {
  _id: ObjectId;
  code?: string;
  effectiveAbnormalFlag?: "L" | "LL" | "H" | "HH" | "A" | "N" | null;
  name?: string;
  orgId?: string;
  refRange?: {
    high?: number | null;
    low?: number | null;
    text?: string | null;
  } | null;
  takenAt?: Date | null;
  unit?: string | null;
  value?: number | string | null;
};

type LabLedgerDoc = {
  _id: ObjectId;
  code?: string;
  effectiveAbnormalFlag?: "L" | "LL" | "H" | "HH" | "A" | "N" | null;
  name?: string;
  orgId?: string;
  refRange?: {
    high?: number | null;
    low?: number | null;
    text?: string | null;
  } | null;
  reportedAt?: Date | null;
  status?: "final" | "corrected" | "preliminary" | "cancelled";
  takenAt?: Date | null;
  unit?: string | null;
  value?: number | string | null;
};

function normaliseLabName(value: string | null | undefined) {
  return value?.trim() || "Lab";
}

function formatLabValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toLocaleString("en-GB", { maximumFractionDigits: 2 });
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "Not recorded";
}

function toNumericValue(value: number | string | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function formatRangeValue(value: number | null | undefined) {
  return typeof value === "number"
    ? value.toLocaleString("en-GB", { maximumFractionDigits: 2 })
    : null;
}

function formatRangeLabel(range?: {
  high?: number | null;
  low?: number | null;
  text?: string | null;
} | null) {
  const low = formatRangeValue(range?.low);
  const high = formatRangeValue(range?.high);
  if (low && high) return `${low} - ${high}`;
  if (low) return `>= ${low}`;
  if (high) return `<= ${high}`;
  return range?.text?.trim() || null;
}

function resolveTrackedLabMeta(doc: { code?: string; name?: string }) {
  const code = doc.code?.toLowerCase() ?? "";
  const name = doc.name?.toLowerCase() ?? "";
  return (
    TRACKED_LABS.find(
      (candidate) =>
        (code && candidate.codes.some((item) => item.toLowerCase() === code)) ||
        (candidate.nameMatch && candidate.nameMatch.test(name)),
    ) ?? null
  );
}

function buildSeriesId(doc: { code?: string; name?: string; unit?: string | null }) {
  const tracked = resolveTrackedLabMeta(doc);
  if (tracked) {
    return tracked.id;
  }
  return `${doc.code ?? doc.name ?? "lab"}::${doc.unit?.trim() ?? ""}`;
}

function abnormalRank(flag: string | null | undefined) {
  if (flag === "HH" || flag === "LL") return 0;
  if (flag === "H" || flag === "L" || flag === "A") return 1;
  if (flag === "N") return 2;
  return 3;
}

function isCriticalFlag(flag: string | null | undefined) {
  return flag === "HH" || flag === "LL";
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

    const [clinical, currentDocsRaw, historyDocsRaw] = await Promise.all([
      db.collection<PortalLabsClinicalDoc>(COLLECTIONS.UsersClinical).findOne(
        { patientId: patientObjectId },
        { projection: { _id: 0, egfrCurrent: 1 } },
      ),
      db
        .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
        .find(
          { patientId: patientObjectId },
          {
            projection: {
              _id: 1,
              code: 1,
              effectiveAbnormalFlag: 1,
              name: 1,
              orgId: 1,
              refRange: 1,
              takenAt: 1,
              unit: 1,
              value: 1,
            },
          },
        )
        .toArray(),
      db
        .collection<LabLedgerDoc>(COLLECTIONS.LabsLedger)
        .find(
          { patientId: patientObjectId },
          {
            projection: {
              _id: 1,
              code: 1,
              effectiveAbnormalFlag: 1,
              name: 1,
              orgId: 1,
              refRange: 1,
              reportedAt: 1,
              status: 1,
              takenAt: 1,
              unit: 1,
              value: 1,
            },
          },
        )
        .sort({ takenAt: -1, reportedAt: -1, _id: -1 })
        .limit(RECENT_LAB_HISTORY_LIMIT)
        .toArray(),
    ]);

    const [currentDocs, historyDocs] = await Promise.all([
      hydrateLabReferenceRanges(db, currentDocsRaw),
      hydrateLabReferenceRanges(db, historyDocsRaw),
    ]);

    const currentLabs = currentDocs
      .map((doc) => {
        const tracked = resolveTrackedLabMeta(doc);
        return {
          abnormalFlag: doc.effectiveAbnormalFlag ?? null,
          code: doc.code ?? "",
          id: doc._id.toString(),
          isTracked: Boolean(tracked),
          label: tracked?.label ?? normaliseLabName(doc.name),
          rangeLabel: formatRangeLabel(doc.refRange),
          takenAt: toIsoDate(doc.takenAt),
          unit: doc.unit?.trim() || tracked?.unitFallback || null,
          value: formatLabValue(doc.value),
        };
      })
      .sort((left, right) => {
        return (
          abnormalRank(left.abnormalFlag) - abnormalRank(right.abnormalFlag) ||
          Number(right.isTracked) - Number(left.isTracked) ||
          left.label.localeCompare(right.label)
        );
      });

    const historyRows = historyDocs.map((doc) => {
      const tracked = resolveTrackedLabMeta(doc);
      return {
        abnormalFlag: doc.effectiveAbnormalFlag ?? null,
        code: doc.code ?? "",
        id: doc._id.toString(),
        label: tracked?.label ?? normaliseLabName(doc.name),
        reportedAt: toIsoDate(doc.reportedAt),
        status: doc.status ?? "final",
        takenAt: toIsoDate(doc.takenAt),
        unit: doc.unit?.trim() || tracked?.unitFallback || null,
        value: formatLabValue(doc.value),
      };
    });

    const chartSeriesMap = new Map<
      string,
      PortalPatientLabData["chartSeries"][number]
    >();

    for (const doc of historyDocs) {
      const value = toNumericValue(doc.value);
      const takenAt = toIsoDate(doc.takenAt);
      if (value === null || !takenAt) {
        continue;
      }

      const tracked = resolveTrackedLabMeta(doc);
      const id = buildSeriesId(doc);
      const existing = chartSeriesMap.get(id);
      const point = {
        abnormalFlag: doc.effectiveAbnormalFlag ?? null,
        at: takenAt,
        id: doc._id.toString(),
        rangeHigh: typeof doc.refRange?.high === "number" ? doc.refRange.high : null,
        rangeLow: typeof doc.refRange?.low === "number" ? doc.refRange.low : null,
        status: doc.status ?? "final",
        value,
      };

      if (existing) {
        existing.points.push(point);
        if (!existing.rangeLabel) {
          existing.rangeLabel = formatRangeLabel(doc.refRange);
        }
        continue;
      }

      chartSeriesMap.set(id, {
        id,
        isTracked: Boolean(tracked),
        label: tracked?.label ?? normaliseLabName(doc.name),
        points: [point],
        rangeLabel: formatRangeLabel(doc.refRange),
        unit: doc.unit?.trim() || tracked?.unitFallback || null,
      });
    }

    const chartSeries = Array.from(chartSeriesMap.values())
      .map((series) => ({
        ...series,
        points: series.points.slice().sort((left, right) => left.at.localeCompare(right.at)),
      }))
      .filter((series) => series.points.length > 0)
      .sort((left, right) => {
        return (
          Number(right.isTracked) - Number(left.isTracked) ||
          right.points.length - left.points.length ||
          left.label.localeCompare(right.label)
        );
      });

    const mappedPatient = mapPortalPatientDetail(patient);
    const summary: PortalPatientLabData["summary"] = {
      abnormalCount: currentLabs.filter(
        (item) => item.abnormalFlag && item.abnormalFlag !== "N",
      ).length,
      criticalCount: currentLabs.filter((item) => isCriticalFlag(item.abnormalFlag)).length,
      historyShownCount: historyRows.length,
      lastReportedAt:
        historyRows.find((item) => item.reportedAt)?.reportedAt ??
        historyRows[0]?.takenAt ??
        null,
      totalCurrent: currentLabs.length,
      trackedCount: currentLabs.filter((item) => item.isTracked).length,
    };

    const data: PortalPatientLabData = {
      chartSeries,
      currentLabs,
      headline: `Viewing ${mappedPatient.name} - eGFR ${
        typeof clinical?.egfrCurrent === "number" ? clinical.egfrCurrent : "n/a"
      }`,
      historyRows,
      patient: mappedPatient,
      summary,
    };

    return ok(data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load patient labs",
      undefined,
      error?.status || 500,
    );
  }
}
