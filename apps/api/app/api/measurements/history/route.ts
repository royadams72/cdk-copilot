export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type MeasurementDoc = {
  averageSpeedKph?: number;
  caloriesKcal?: number;
  distanceMeters?: number;
  kind:
    | "weight"
    | "blood_pressure"
    | "heart_rate"
    | "steps"
    | "exercise"
    | "sleep";
  measuredAt: Date;
  valueKg?: number;
  systolicMmHg?: number;
  diastolicMmHg?: number;
  bpm?: number;
  count?: number;
  durationMin?: number;
  sleepFromAt?: Date;
  sleepToAt?: Date;
  sync?: {
    dayKey?: string;
    finalizedAt?: Date;
    lastReconciledAt?: Date;
    provider?: "health_connect";
    status?: "provisional" | "finalized";
  };
  exercise?: {
    exerciseId?: string;
    title?: string;
    name?: string;
    category?: string;
    caloriesKcal?: number;
    durationMin?: number;
  };
  steps?: {
    averageSpeedKph?: number;
    caloriesKcal?: number;
    distanceMeters?: number;
  };
};

const MAX_DOCS = 5000;

type UserPiiDoc = {
  patientId?: ObjectId;
  timeZone?: string;
};

function dayKey(date: Date, timeZone: string) {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone,
      year: "numeric",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      day: "2-digit",
      month: "2-digit",
      timeZone: "Europe/London",
      year: "numeric",
    });
  }
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function firstNumber(...values: unknown[]) {
  for (const value of values) {
    const numeric = asNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (
      caller.role !== ROLES.Patient ||
      !caller.patientId ||
      !ObjectId.isValid(caller.patientId)
    ) {
      return bad("Patient context missing", undefined, 403);
    }

    const kind = req.nextUrl.searchParams.get("kind");
    if (
      kind !== "steps" &&
      kind !== "exercise" &&
      kind !== "sleep" &&
      kind !== "weight" &&
      kind !== "blood_pressure" &&
      kind !== "heart_rate"
    ) {
      return bad("Invalid kind", undefined, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const usersPii = db.collection<UserPiiDoc>(COLLECTIONS.UsersPII);
    const pii = await usersPii.findOne(
      { patientId },
      { projection: { _id: 0, timeZone: 1 } },
    );
    const timeZone = pii?.timeZone?.trim() || "Europe/London";
    const docs = await db
      .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
      .find(
        { patientId, kind },
        {
          projection: {
            _id: 0,
            averageSpeedKph: 1,
            bpm: 1,
            caloriesKcal: 1,
            count: 1,
            diastolicMmHg: 1,
            distanceMeters: 1,
            durationMin: 1,
            exercise: 1,
            kind: 1,
            measuredAt: 1,
            sleepFromAt: 1,
            sleepToAt: 1,
            sync: 1,
            steps: 1,
            systolicMmHg: 1,
            valueKg: 1,
          },
        },
      )
      .sort({ measuredAt: -1 })
      .limit(MAX_DOCS)
      .toArray();

    const entriesByDay = new Map<
      string,
      Array<{
        measuredAt: string;
        value: number | null;
        value2: number | null;
        averageSpeedKph?: number | null;
        caloriesKcal?: number | null;
        distanceMeters?: number | null;
        sleepFromAt?: string;
        sleepToAt?: string;
        sync?: {
          dayKey?: string;
          finalizedAt?: string;
          lastReconciledAt?: string;
          provider: "health_connect";
          status: "provisional" | "finalized";
        };
        exerciseId?: string;
        exerciseTitle?: string;
        exerciseName?: string;
      }>
    >();

    for (const doc of docs) {
      const key = dayKey(doc.measuredAt, timeZone);

      let value: number | null = null;
      let value2: number | null = null;
      if (kind === "steps") value = asNumber(doc.count);
      if (kind === "weight") value = asNumber(doc.valueKg);
      if (kind === "sleep") {
        const durationFromField = asNumber(doc.durationMin);
        if (durationFromField !== null) {
          value = durationFromField;
        } else if (doc.sleepFromAt && doc.sleepToAt) {
          value = Math.max(
            0,
            Math.round(
              (doc.sleepToAt.getTime() - doc.sleepFromAt.getTime()) / 60000,
            ),
          );
        }
      }
      if (kind === "exercise") {
        value = asNumber(doc.exercise?.caloriesKcal);
        value2 = asNumber(doc.exercise?.durationMin);
      }
      if (kind === "blood_pressure") {
        value = asNumber(doc.systolicMmHg);
        value2 = asNumber(doc.diastolicMmHg);
      }
      if (kind === "heart_rate") value = asNumber(doc.bpm);

      const dayEntries = entriesByDay.get(key) ?? [];
      dayEntries.push({
        averageSpeedKph:
          kind === "steps"
            ? firstNumber(doc.averageSpeedKph, doc.steps?.averageSpeedKph)
            : undefined,
        caloriesKcal:
          kind === "steps"
            ? firstNumber(doc.caloriesKcal, doc.steps?.caloriesKcal)
            : undefined,
        distanceMeters:
          kind === "steps"
            ? firstNumber(doc.distanceMeters, doc.steps?.distanceMeters)
            : undefined,
        measuredAt: doc.measuredAt.toISOString(),
        value,
        value2,
        sleepFromAt:
          kind === "sleep" && doc.sleepFromAt
            ? doc.sleepFromAt.toISOString()
            : undefined,
        sleepToAt:
          kind === "sleep" && doc.sleepToAt
            ? doc.sleepToAt.toISOString()
            : undefined,
        sync:
          kind === "steps" &&
          doc.sync?.provider === "health_connect" &&
          (doc.sync.status === "provisional" || doc.sync.status === "finalized")
            ? {
                dayKey:
                  typeof doc.sync.dayKey === "string" ? doc.sync.dayKey : undefined,
                finalizedAt: doc.sync.finalizedAt?.toISOString(),
                lastReconciledAt: doc.sync.lastReconciledAt?.toISOString(),
                provider: "health_connect",
                status: doc.sync.status,
              }
            : undefined,
        exerciseId:
          kind === "exercise" && typeof doc.exercise?.exerciseId === "string"
            ? doc.exercise.exerciseId
            : undefined,
        exerciseName:
          kind === "exercise" &&
          (typeof doc.exercise?.title === "string" ||
            typeof doc.exercise?.name === "string")
            ? (doc.exercise?.title ?? doc.exercise?.name)
            : undefined,
        exerciseTitle:
          kind === "exercise" && typeof doc.exercise?.title === "string"
            ? doc.exercise.title
            : undefined,
      });
      entriesByDay.set(key, dayEntries);
    }

    const entriesByDate = Array.from(entriesByDay.entries()).reduce<
      Record<
        string,
        Array<{
          measuredAt: string;
          value: number | null;
          value2: number | null;
          averageSpeedKph?: number | null;
          caloriesKcal?: number | null;
          distanceMeters?: number | null;
          sleepFromAt?: string;
          sleepToAt?: string;
          sync?: {
            dayKey?: string;
            finalizedAt?: string;
            lastReconciledAt?: string;
            provider: "health_connect";
            status: "provisional" | "finalized";
          };
          exerciseId?: string;
          exerciseTitle?: string;
          exerciseName?: string;
        }>
      >
    >((acc, [date, entries]) => {
      acc[date] = entries
        .slice()
        .sort((a, b) => (a.measuredAt < b.measuredAt ? -1 : 1));
      return acc;
    }, {});

    const points = Object.entries(entriesByDate)
      .map(([date, entries]) => {
        const numericValue = entries
          .map((entry) => entry.value)
          .filter((value): value is number => typeof value === "number");
        const numericValue2 = entries
          .map((entry) => entry.value2)
          .filter((value): value is number => typeof value === "number");
        const latestEntry = entries[entries.length - 1];

        let value: number | null = null;
        let value2: number | null = null;

        if (kind === "exercise") {
          value = numericValue.length
            ? numericValue.reduce((sum, item) => sum + item, 0)
            : null;
          value2 = numericValue2.length
            ? numericValue2.reduce((sum, item) => sum + item, 0)
            : null;
        } else if (kind === "heart_rate") {
          value = numericValue.length
            ? Math.round(
                numericValue.reduce((sum, item) => sum + item, 0) /
                  numericValue.length,
              )
            : null;
        } else if (kind === "sleep") {
          value = numericValue.length
            ? numericValue.reduce((sum, item) => sum + item, 0)
            : null;
        } else if (kind === "steps") {
          const preferredEntry =
            entries.find(
              (entry) =>
                typeof entry.distanceMeters === "number" ||
                typeof entry.caloriesKcal === "number" ||
                typeof entry.averageSpeedKph === "number",
            ) ?? latestEntry;
          value = preferredEntry?.value ?? null;
        } else {
          value = latestEntry?.value ?? null;
          value2 = latestEntry?.value2 ?? null;
        }

        return {
          date,
          measuredAt: latestEntry?.measuredAt ?? `${date}T00:00:00.000Z`,
          value,
          value2,
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));

    return ok({ entriesByDate, points });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
