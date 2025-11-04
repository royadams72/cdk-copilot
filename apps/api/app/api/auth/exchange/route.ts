// apps/api/app/api/auth/exchange/route.ts
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { SignJWT } from "jose";

export async function POST(req: NextRequest) {
  const db = await getDb();
  const { code } = await req.json().catch(() => ({}));
  console.log("code::exchange/route", code);

  if (!code)
    return NextResponse.json({ error: "missing code" }, { status: 400 });

  let _id: ObjectId;
  try {
    _id = new ObjectId(String(code));
  } catch {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  const rec = await db.collection("auth_codes").findOne({ _id });
  if (!rec || new Date() > rec.expiresAt) {
    return NextResponse.json({ error: "invalid_or_expired" }, { status: 400 });
  }

  // one-time use
  await db.collection("auth_codes").deleteOne({ _id });

  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const jwt = await new SignJWT({
    sub: rec.principalId,
    patientId: rec.patientId,
    orgId: rec.orgId,
    scopes: rec.scopes,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);

  return NextResponse.json({ jwt });
}
