export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { writeLabLedgerAndCurrent } from "@/apps/api/lib/utils/labs";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type CurrentDoc = {
  _id: ObjectId;
  code: string;
  name: string;
  value: number | string;
  unit?: string | null;
  refRange?: { low?: number | null; high?: number | null; text?: string | null } | null;
  takenAt: Date;
  ledgerId?: ObjectId;
  status: "final" | "corrected" | "preliminary" | "cancelled";
};

function cleanText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ");
}

function parseValue(raw: unknown): number | string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const cleaned = cleanText(raw);
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : cleaned;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function parseRangeNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseRefRange(item: Record<string, unknown>) {
  const raw =
    item.refRange && typeof item.refRange === "object"
      ? (item.refRange as Record<string, unknown>)
      : null;
  const low = parseRangeNumber(item.refRangeLow ?? raw?.low);
  const high = parseRangeNumber(item.refRangeHigh ?? raw?.high);
  const text = cleanText(item.refRangeText ?? raw?.text) || null;
  if (low === null && high === null && !text) return null;
  return { high, low, text };
}

function valuesEqual(a: number | string, b: number | string) {
  if (typeof a === "number" && typeof b === "number") return a === b;
  return String(a).trim() === String(b).trim();
}

export async function PATCH(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const reason = cleanText(body.reason);
    if (!reason) return bad("Edit reason is required", undefined, 400);

    const labsRaw = Array.isArray(body.labs) ? body.labs : [];
    if (labsRaw.length === 0) return bad("At least one lab is required", undefined, 400);

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const orgId = caller.orgId ?? "org_demo";
    const current = await db
      .collection<CurrentDoc>(COLLECTIONS.LabsCurrent)
      .find({ patientId })
      .toArray();
    const currentByKey = new Map(
      current.map((doc) => [`${doc.code}::${doc.unit ?? ""}`, doc] as const),
    );

    const results: Array<{ code: string; ledgerId: string; updated: boolean }> = [];
    for (const raw of labsRaw) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const code = cleanText(item.code);
      const name = cleanText(item.name);
      const unit = cleanText(item.unit) || null;
      const value = parseValue(item.value);
      const takenAt = parseDate(item.takenAt);
      const reportedAt = parseDate(item.reportedAt);
      const refRange = parseRefRange(item);

      if (!code || !name || value === null || !takenAt) {
        return bad("Each lab requires code, name, value, and takenAt", undefined, 400);
      }

      const key = `${code}::${unit ?? ""}`;
      const prev = currentByKey.get(key);
      if (
        prev &&
        valuesEqual(prev.value, value) &&
        (prev.takenAt?.toISOString() ?? "") === takenAt.toISOString()
      ) {
        continue;
      }

      const write = await writeLabLedgerAndCurrent(db, {
        input: {
          code,
          correctionOf: prev?.ledgerId ?? null,
          latestReason: reason,
          name,
          refRange,
          reportedAt,
          source: "manual",
          sourceAbnormalFlag: null,
          status: "corrected",
          takenAt,
          unit,
          value,
        },
        orgId,
        patientId,
        principalId: caller.principalId,
      });
      results.push({ code, ledgerId: write.ledgerId.toString(), updated: write.currentUpdated });
    }

    return ok({ items: results });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
