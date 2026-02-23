export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { ROLES } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

type LabCurrentDoc = {
  _id: ObjectId;
  code: string;
  name: string;
  unit?: string | null;
  value: number | string;
  takenAt: Date;
};

type LabLedgerDoc = {
  _id: ObjectId;
  code: string;
  name: string;
  unit?: string | null;
  value: number | string;
  takenAt: Date;
};

function toUtcDayRange(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const start = new Date(
    Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { end, start };
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

    const db = await getDb();
    const patientId = new ObjectId(caller.patientId);
    const code = req.nextUrl.searchParams.get("code")?.trim() ?? "";
    const unit = req.nextUrl.searchParams.get("unit")?.trim() ?? "";
    const view = req.nextUrl.searchParams.get("view")?.trim() ?? "";
    const takenDate = req.nextUrl.searchParams.get("takenDate")?.trim() ?? "";

    if (!code) {
      if (takenDate) {
        const dayRange = toUtcDayRange(takenDate);
        if (!dayRange) return bad("Invalid takenDate", undefined, 400);

        const rows = await db
          .collection<LabLedgerDoc>(COLLECTIONS.LabsLedger)
          .find(
            {
              patientId,
              takenAt: { $gte: dayRange.start, $lt: dayRange.end },
            },
            {
              projection: {
                _id: 1,
                code: 1,
                name: 1,
                takenAt: 1,
                unit: 1,
                value: 1,
              },
            },
          )
          .sort({ takenAt: -1, _id: -1 })
          .limit(500)
          .toArray();

        const byCodeAndUnit = new Map<string, LabLedgerDoc>();
        for (const row of rows) {
          const key = `${row.code}::${row.unit ?? ""}`;
          if (!byCodeAndUnit.has(key)) byCodeAndUnit.set(key, row);
        }
        const items = Array.from(byCodeAndUnit.values()).sort((a, b) =>
          a.name.localeCompare(b.name),
        );

        return ok({
          items: items.map((row) => ({
            code: row.code,
            id: row._id.toString(),
            name: row.name,
            takenAt: row.takenAt?.toISOString() ?? null,
            unit: row.unit ?? null,
            value: row.value,
          })),
        });
      }

      if (view === "dates") {
        const rows = await db
          .collection<LabLedgerDoc>(COLLECTIONS.LabsLedger)
          .find(
            { patientId },
            {
              projection: {
                _id: 1,
                code: 1,
                name: 1,
                takenAt: 1,
                unit: 1,
                value: 1,
              },
            },
          )
          .sort({ takenAt: -1, _id: -1 })
          .limit(3000)
          .toArray();

        const groups = new Map<
          string,
          {
            items: Array<{
              code: string;
              id: string;
              name: string;
              takenAt: string | null;
              unit: string | null;
              value: number | string;
            }>;
            seen: Set<string>;
            takenAt: string | null;
          }
        >();

        for (const row of rows) {
          const dateKey = row.takenAt?.toISOString().slice(0, 10) ?? "unknown";
          const codeAndUnit = `${row.code}::${row.unit ?? ""}`;
          const group = groups.get(dateKey) ?? {
            items: [],
            seen: new Set<string>(),
            takenAt: dateKey === "unknown" ? null : `${dateKey}T00:00:00.000Z`,
          };
          if (!group.seen.has(codeAndUnit)) {
            group.seen.add(codeAndUnit);
            group.items.push({
              code: row.code,
              id: row._id.toString(),
              name: row.name,
              takenAt: row.takenAt?.toISOString() ?? null,
              unit: row.unit ?? null,
              value: row.value,
            });
          }
          groups.set(dateKey, group);
        }

        const dates = Array.from(groups.entries())
          .sort(([a], [b]) => (a < b ? 1 : -1))
          .map(([date, group]) => ({
            date,
            itemCount: group.items.length,
            items: group.items.sort((a, b) => a.name.localeCompare(b.name)),
            takenAt: group.takenAt,
          }));

        return ok({ dates });
      }

      const rows = await db
        .collection<LabCurrentDoc>(COLLECTIONS.LabsCurrent)
        .find(
          { patientId },
          { projection: { _id: 1, code: 1, name: 1, takenAt: 1, unit: 1, value: 1 } },
        )
        .sort({ name: 1, takenAt: -1 })
        .toArray();

      return ok({
        items: rows.map((row) => ({
          code: row.code,
          id: row._id.toString(),
          name: row.name,
          takenAt: row.takenAt?.toISOString() ?? null,
          unit: row.unit ?? null,
          value: row.value,
        })),
      });
    }

    const query: any = { code, patientId };
    if (unit) query.unit = unit;

    const points = await db
      .collection<LabLedgerDoc>(COLLECTIONS.LabsLedger)
      .find(query, { projection: { _id: 0, code: 1, name: 1, takenAt: 1, unit: 1, value: 1 } })
      .sort({ takenAt: 1 })
      .limit(500)
      .toArray();

    return ok({
      points: points.map((point) => ({
        code: point.code,
        name: point.name,
        takenAt: point.takenAt?.toISOString() ?? null,
        unit: point.unit ?? null,
        value: point.value,
      })),
    });
  } catch (err: any) {
    const status = err?.status || 500;
    return bad(err?.message || "Server error", undefined, status);
  }
}
