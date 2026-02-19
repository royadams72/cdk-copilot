export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { writeLabLedgerAndCurrent } from "@/apps/api/lib/utils/labs";
import { ROLES } from "@ckd/core";

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

export async function POST(req: NextRequest) {
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
    const labsRaw = Array.isArray(body.labs) ? body.labs : [];
    if (labsRaw.length === 0) return bad("At least one lab is required", undefined, 400);

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const orgId = caller.orgId ?? "org_demo";
    const results: Array<{ code: string; ledgerId: string; updated: boolean }> = [];

    for (const raw of labsRaw) {
      const item = (raw ?? {}) as Record<string, unknown>;
      const code = cleanText(item.code);
      const name = cleanText(item.name);
      const unit = cleanText(item.unit) || null;
      const value = parseValue(item.value);
      const takenAt = parseDate(item.takenAt);
      const reportedAt = parseDate(item.reportedAt);
      const low =
        typeof item.refRangeLow === "number"
          ? item.refRangeLow
          : typeof item.refRangeLow === "string" && item.refRangeLow.trim()
            ? Number(item.refRangeLow)
            : null;
      const high =
        typeof item.refRangeHigh === "number"
          ? item.refRangeHigh
          : typeof item.refRangeHigh === "string" && item.refRangeHigh.trim()
            ? Number(item.refRangeHigh)
            : null;
      const refRangeText = cleanText(item.refRangeText) || null;

      if (!code || !name || value === null || !takenAt) {
        return bad("Each lab requires code, name, value, and takenAt", undefined, 400);
      }

      const refRange =
        low !== null || high !== null || refRangeText
          ? {
              high: Number.isFinite(high as number) ? (high as number) : null,
              low: Number.isFinite(low as number) ? (low as number) : null,
              text: refRangeText,
            }
          : null;

      const write = await writeLabLedgerAndCurrent(db, {
        input: {
          code,
          name,
          refRange,
          reportedAt,
          source: "manual",
          sourceAbnormalFlag: null,
          status: "final",
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

    return ok({ items: results }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}

