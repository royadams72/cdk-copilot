// app/api/patients/route.ts
import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { requireUser } from "@/apps/api/lib/auth/requireUser";

function buildScopeFilter(user: Awaited<ReturnType<typeof requireUser>>) {
  const ors = [];
  if (user.facilityIds?.length)
    ors.push({ facilityId: { $in: user.facilityIds } });
  if (user.careTeamIds?.length)
    ors.push({ careTeamId: { $in: user.careTeamIds } });
  if (user.allowedPatientIds?.length) {
    ors.push({
      _id: { $in: user.allowedPatientIds.map((id) => new ObjectId(id)) },
    });
  }
  return { orgId: user.orgId, ...(ors.length ? { $or: ors } : {}) };
}

export async function GET(req: Request) {
  const user = await requireUser(req, ["patients.read"]);
  if (
    user.role !== "clinician" &&
    user.role !== "dietitian" &&
    user.role !== "admin"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = await getDb();
  const filter = buildScopeFilter(user);

  const patients = await db
    .collection("patients")
    .find(filter, {
      // Never ship PII from this route
      projection: { summary: 1, stage: 1, flags: 1, updatedAt: 1 },
    })
    .limit(100)
    .toArray();

  return NextResponse.json({ data: patients });
}
