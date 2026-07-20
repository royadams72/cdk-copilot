export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { buildPortalPatientAccessMatch } from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

const METRICS = ["weight", "bloodPressure", "symptoms", "steps", "nutrition"] as const;
const DIRECTIONS = ["increase", "decrease"] as const;
type Metric = (typeof METRICS)[number];
type Direction = (typeof DIRECTIONS)[number];

type PatientDoc = {
  _id: ObjectId;
  pii?: { dateOfBirth?: Date | string; email?: string; firstName?: string; lastName?: string } | null;
  stage?: string | null;
};

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function dateValue(value: unknown) {
  const date = value instanceof Date ? value : new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function displayName(patient: PatientDoc) {
  const name = [patient.pii?.firstName, patient.pii?.lastName].filter(Boolean).join(" ").trim();
  return name || patient.pii?.email || "Patient";
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const metrics = Array.isArray(body?.metrics)
      ? body.metrics.filter((item): item is Metric => METRICS.includes(item as Metric))
      : [];
    const directions = Array.isArray(body?.directions)
      ? body.directions.filter((item): item is Direction => DIRECTIONS.includes(item as Direction))
      : [];
    const days = [7, 14, 30, 60, 90].includes(Number(body?.days)) ? Number(body?.days) : 30;
    const matchMode = body?.matchMode === "all" ? "all" : "any";
    const query = typeof body?.query === "string" ? body.query.trim().toLowerCase() : "";
    const stage = typeof body?.stage === "string" ? body.stage.trim() : "";
    const dateOfBirth = typeof body?.dateOfBirth === "string" ? body.dateOfBirth.trim() : "";
    if (!metrics.length || !directions.length) {
      return bad("Select at least one item and one direction", undefined, 400);
    }

    const db = await getDb();
    const patients = await db.collection(COLLECTIONS.Patients).aggregate<PatientDoc>([
      { $match: buildPortalPatientAccessMatch(caller) },
      { $lookup: { as: "pii", foreignField: "patientId", from: COLLECTIONS.UsersPII, localField: "_id" } },
      { $project: { pii: { $arrayElemAt: ["$pii", 0] }, stage: 1 } },
    ]).toArray();
    const scopedPatients = patients.filter((patient) => {
      const parsedDob = patient.pii?.dateOfBirth ? new Date(patient.pii.dateOfBirth) : null;
      const dob = parsedDob && !Number.isNaN(parsedDob.getTime()) ? parsedDob.toISOString().slice(0, 10) : "";
      const text = `${displayName(patient)} ${patient.pii?.email ?? ""}`.toLowerCase();
      return (!query || text.includes(query)) && (!stage || patient.stage === stage) && (!dateOfBirth || dob === dateOfBirth);
    });
    const patientIds = scopedPatients.map((patient) => patient._id);
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 86400000);
    const previousStart = new Date(now.getTime() - days * 2 * 86400000);

    const [measurements, symptoms, nutrition] = await Promise.all([
      metrics.some((metric) => ["weight", "bloodPressure", "steps"].includes(metric))
        ? db.collection(COLLECTIONS.MeasurementsLedger).find({
            patientId: { $in: patientIds },
            measuredAt: { $gte: previousStart, $lte: now },
            kind: { $in: metrics.flatMap((metric) => metric === "bloodPressure" ? ["blood_pressure"] : [metric]) },
          }).toArray()
        : [],
      metrics.includes("symptoms")
        ? db.collection(COLLECTIONS.SymptomsLedger).find({ patientId: { $in: patientIds }, createdAt: { $gte: previousStart, $lte: now } }).toArray()
        : [],
      metrics.includes("nutrition")
        ? db.collection(COLLECTIONS.NutritionLedger).find({ patientId: { $in: patientIds }, $or: [
            { eatenAt: { $gte: previousStart, $lte: now } },
            { eatenAt: { $exists: false }, createdAt: { $gte: previousStart, $lte: now } },
            { eatenAt: null, createdAt: { $gte: previousStart, $lte: now } },
          ] }).toArray()
        : [],
    ]);

    const results = scopedPatients.flatMap((patient) => {
      const id = patient._id.toHexString();
      const matches = metrics.flatMap((metric) => {
        const values: Array<{ at: Date; value: number }> = [];
        if (metric === "symptoms") {
          for (const doc of symptoms) if (String(doc.patientId) === id) {
            const at = dateValue(doc.createdAt);
            const value = numeric((doc.after as Record<string, unknown> | undefined)?.severity);
            if (at && value !== null) values.push({ at, value });
          }
        } else if (metric === "nutrition") {
          for (const doc of nutrition) if (String(doc.patientId) === id) {
            const at = dateValue(doc.eatenAt ?? doc.createdAt);
            const value = numeric((doc.totals as Record<string, unknown> | undefined)?.caloriesKcal);
            if (at && value !== null) values.push({ at, value });
          }
        } else {
          const kind = metric === "bloodPressure" ? "blood_pressure" : metric;
          for (const doc of measurements) if (String(doc.patientId) === id && doc.kind === kind) {
            const at = dateValue(doc.measuredAt);
            const value = numeric(metric === "weight" ? doc.valueKg : metric === "steps" ? doc.count : doc.systolicMmHg);
            if (at && value !== null) values.push({ at, value });
          }
        }
        const previous = mean(values.filter((point) => point.at < currentStart).map((point) => point.value));
        const current = mean(values.filter((point) => point.at >= currentStart).map((point) => point.value));
        if (previous === null || current === null || current === previous) return [];
        const direction: Direction = current > previous ? "increase" : "decrease";
        if (!directions.includes(direction)) return [];
        const labels: Record<Metric, [string, string]> = {
          weight: ["Weight", "kg"], bloodPressure: ["Blood pressure (systolic)", "mmHg"],
          symptoms: ["Symptom severity", ""], steps: ["Steps", "per reading"], nutrition: ["Recorded calories", "kcal per entry"],
        };
        return [{ metric, direction, label: labels[metric][0], unit: labels[metric][1], current: Math.round(current * 10) / 10, previous: Math.round(previous * 10) / 10 }];
      });
      const matched = matchMode === "all" ? matches.length === metrics.length : matches.length > 0;
      return matched ? [{ id, name: displayName(patient), email: patient.pii?.email ?? null, stage: patient.stage ?? null, matches }] : [];
    });

    return ok({ days, directions, matchMode, matchedPatients: results.length, metrics, patients: results, totalPatients: scopedPatients.length });
  } catch (error: any) {
    return bad(error?.message || "Unable to search patient trends", undefined, error?.status || 500);
  }
}
