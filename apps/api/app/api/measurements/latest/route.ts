// app/api/measurements/latest/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const caller = await requireUser(req, ["measurements:read"]);
  const userId =
    new URL(req.url).searchParams.get("userId") ||
    caller.patientId ||
    caller.authId;

  const db = await getDb();
  const docs = await db
    .collection("measurement_ledger")
    .aggregate([
      { $match: { userId, superseded: { $ne: true } } },
      { $sort: { measuredAt: 1, createdAt: 1 } },
      { $group: { _id: { type: "$type" }, latest: { $last: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$latest" } },
      { $sort: { type: 1 } },
    ])
    .toArray();

  return NextResponse.json({ ok: true, data: docs });
}
