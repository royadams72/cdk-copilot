export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
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

    const body = (await req.json()) as Record<string, unknown>;
    const name = cleanText(body.name);
    const dose = normalizeDose(String(body.dose ?? ""));
    const frequency = normalizeFrequency(String(body.frequency ?? ""));
    const instructions = cleanText(body.instructions);
    const route = cleanText(body.route);
    const form = cleanText(body.form);
    const dmplusdCode = cleanText(body.dmplusdCode);
    const snomedCode = cleanText(body.snomedCode);
    const drugRefIdRaw = cleanText(body.drugRefId);
    const startAtRaw = cleanText(body.startAt);

    if (!name || !dose || !startAtRaw) {
      return bad("name, dose and startAt are required", undefined, 400);
    }

    const startAt = new Date(startAtRaw);
    if (Number.isNaN(startAt.getTime())) {
      return bad("Invalid startAt date", undefined, 400);
    }

    const now = new Date();
    const db = await getDb();
    const payload: Record<string, unknown> = {
      createdAt: now,
      createdBy: caller.principalId,
      dose,
      frequency: frequency || "as directed",
      name: titleCase(name),
      orgId: caller.orgId ?? "org_demo",
      patientId: new ObjectId(caller.patientId),
      source: "manual",
      startAt,
      status: "active",
      updatedAt: now,
      updatedBy: caller.principalId,
    };

    if (instructions) payload.instructions = instructions;
    if (route) payload.route = route.toLowerCase();
    if (form) payload.form = form.toLowerCase();
    if (dmplusdCode) payload.dmplusdCode = dmplusdCode;
    if (snomedCode) payload.snomedCode = snomedCode;
    if (drugRefIdRaw && ObjectId.isValid(drugRefIdRaw)) {
      payload.drugRefId = new ObjectId(drugRefIdRaw);
    }

    const result = await db
      .collection(COLLECTIONS.MedicationsLedger)
      .insertOne(payload);

    return ok({ id: result.insertedId.toString() }, 201);
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
