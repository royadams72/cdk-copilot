import { requireUser } from "@/apps/api/lib/auth/auth";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ok } from "assert";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const u = await requireUser(req, []); // just needs a valid JWT
  const db = await getDb();
  const col = db.collection("patients");

  const existing = await col.findOne({ authId: u.authId, isActive: true });
  if (existing) return ok({ patientId: existing.patientId });

  const now = new Date();
  const doc = {
    authId: u.authId,
    patientId: new ObjectId(),
    orgId: u.orgId || "org_demo",
    scopes: ["PATIENT_SELF_READ", "PATIENT_SELF_WRITE"],
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await col.insertOne(doc);
  return ok({ _id: insertedId, patientId: doc.patientId });
}
