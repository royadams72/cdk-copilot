export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type Kind = "steps" | "exercise" | "sleep" | "blood_pressure";

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMongoValidationMessage(err: any) {
  if (!err || err?.code !== 121) return err?.message || "Server error";
  const details = err?.errInfo?.details;
  if (!details) return err?.message || "Document failed validation";
  const rules = Array.isArray(details?.schemaRulesNotSatisfied)
    ? details.schemaRulesNotSatisfied
    : [];
  const rejectsId = rules.some(
    (rule: any) =>
      rule?.operatorName === "additionalProperties" &&
      Array.isArray(rule?.additionalProperties) &&
      rule.additionalProperties.includes("_id"),
  );
  if (rejectsId) {
    return "Document failed validation: measurements_ledger validator is out of date (missing _id). Run db:apply-validators.";
  }
  try {
    return `Document failed validation: ${JSON.stringify(details)}`;
  } catch {
    return err?.message || "Document failed validation";
  }
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
    const kind = body.kind as Kind;
    if (
      kind !== "steps" &&
      kind !== "exercise" &&
      kind !== "sleep" &&
      kind !== "blood_pressure"
    ) {
      return bad("Invalid kind", undefined, 400);
    }

    const measuredAtRaw =
      typeof body.measuredAt === "string" ? new Date(body.measuredAt) : new Date();
    if (Number.isNaN(measuredAtRaw.getTime())) {
      return bad("Invalid measuredAt", undefined, 400);
    }

    const now = new Date();
    const payload: Record<string, unknown> = {
      kind,
      patientId: new ObjectId(caller.patientId),
      orgId: caller.orgId ?? "org_demo",
      measuredAt: measuredAtRaw,
      receivedAt: new Date(),
      source: "patient",
      createdAt: now,
      updatedAt: now,
      createdBy: caller.principalId,
      updatedBy: caller.principalId,
    };

    if (kind === "steps") {
      const count = asNumber(body.count);
      if (count === null || count < 0) return bad("Invalid count", undefined, 400);
      payload.count = Math.round(count);
    }
    if (kind === "exercise" || kind === "sleep") {
      const durationMin = asNumber(body.durationMin);
      if (durationMin === null || durationMin < 0) {
        return bad("Invalid durationMin", undefined, 400);
      }
      payload.durationMin = Math.round(durationMin);
    }
    if (kind === "blood_pressure") {
      const systolicMmHg = asNumber(body.systolicMmHg);
      const diastolicMmHg = asNumber(body.diastolicMmHg);
      if (
        systolicMmHg === null ||
        diastolicMmHg === null ||
        systolicMmHg <= diastolicMmHg
      ) {
        return bad("Invalid blood pressure values", undefined, 400);
      }
      payload.systolicMmHg = Math.round(systolicMmHg);
      payload.diastolicMmHg = Math.round(diastolicMmHg);
      const pulseBpm = asNumber(body.pulseBpm);
      if (pulseBpm !== null) payload.pulseBpm = Math.round(pulseBpm);
    }

    const db = await getDb();
    let result;
    try {
      result = await db.collection(COLLECTIONS.MeasurementsLedger).insertOne(payload);
    } catch (err: any) {
      if (err?.code !== 121) throw err;
      // Compatibility retry for environments where validator disallows createdAt/updatedAt.
      const fallback = { ...payload };
      delete fallback.createdAt;
      delete fallback.updatedAt;
      result = await db.collection(COLLECTIONS.MeasurementsLedger).insertOne(fallback);
    }
    return ok({ id: result.insertedId.toString() }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(formatMongoValidationMessage(err), undefined, status);
  }
}
