export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type MeasurementDoc = {
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
  exercise?: {
    exerciseId?: string;
    title?: string;
    name?: string;
    category?: string;
    caloriesKcal?: number;
    durationMin?: number;
  };
};

const MAX_DOCS = 5000;

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
      kind !== "blood_pressure"
    ) {
      return bad("Invalid kind", undefined, 400);
    }

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const docs = await db
      .collection<MeasurementDoc>(COLLECTIONS.MeasurementsLedger)
      .find(
        { patientId, kind },
        {
          projection: {
            _id: 0,
            bpm: 1,
            count: 1,
            diastolicMmHg: 1,
            durationMin: 1,
            exercise: 1,
            kind: 1,
            measuredAt: 1,
            sleepFromAt: 1,
            sleepToAt: 1,
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
        sleepFromAt?: string;
        sleepToAt?: string;
        exerciseId?: string;
        exerciseTitle?: string;
        exerciseName?: string;
      }>
    >();

    for (const doc of docs) {
      const key = dayKey(doc.measuredAt);

      let value: number | null = null;
      let value2: number | null = null;
      if (kind === "steps") value = asNumber(doc.count);
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

      const dayEntries = entriesByDay.get(key) ?? [];
      dayEntries.push({
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
          sleepFromAt?: string;
          sleepToAt?: string;
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
        } else if (kind === "sleep") {
          value = numericValue.length
            ? numericValue.reduce((sum, item) => sum + item, 0)
            : null;
        } else if (kind === "steps") {
          value = numericValue.length ? Math.max(...numericValue) : null;
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
