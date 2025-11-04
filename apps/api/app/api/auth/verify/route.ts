export const runtime = "nodejs";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { createHash, randomBytes } from "crypto";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  const db = await getDb();
  const sp = req.nextUrl.searchParams;
  const token = sp.get("token") ?? "";
  const rawRedirect = sp.get("redirectUri") ?? "";
  const redirectUri = rawRedirect.includes("%")
    ? decodeURIComponent(rawRedirect)
    : rawRedirect;

  // console.log("VERIFY params", {
  //   tokenLen: token.length,
  //   redirectUri,
  //   redirectLen: redirectUri.length,
  //   full: req.url,
  // });

  if (!token || !redirectUri) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_params",
        tokenLen: token.length,
        redirectLen: redirectUri.length,
      },
      { status: 400 }
    );
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  // console.log("VERIFY hash", tokenHash);

  const verifs = db.collection("email_verifications");
  const rec = await verifs.findOne({ tokenHash });
  // console.log("VERIFY rec?", !!rec, {
  //   usedAt: rec?.usedAt,
  //   exp: rec?.expiresAt,
  // });

  if (!rec)
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 400 }
    );
  if (rec.usedAt)
    return NextResponse.json(
      { ok: false, error: "already_used" },
      { status: 400 }
    );
  if (new Date() > rec.expiresAt)
    return NextResponse.json({ ok: false, error: "expired" }, { status: 400 });

  const patients = db.collection("patients");
  const patient = await patients.findOne({ _id: rec.patientId });
  if (!patient)
    return NextResponse.json(
      { ok: false, error: "patient_missing" },
      { status: 400 }
    );

  await verifs.updateOne({ _id: rec._id }, { $set: { usedAt: new Date() } });

  const authCode = new ObjectId(); // one-time code
  await db.collection("auth_codes").insertOne({
    _id: authCode,
    principalId: patient.principalId,
    patientId: patient._id, // keep as ObjectId in DB
    orgId: patient.orgId ?? null,
    scopes: patient.scopes,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    createdAt: new Date(),
  });

  console.log("authCode::", authCode.toString());

  const url = new URL(redirectUri);
  url.searchParams.set("code", authCode.toString());
  return NextResponse.redirect(url);
}
