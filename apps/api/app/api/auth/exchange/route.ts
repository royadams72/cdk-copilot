import { NextRequest, NextResponse } from "next/server";
import { SignJWT } from "jose";

import { getDb } from "@/apps/api/lib/db/mongodb";

import { COLLECTIONS } from "@ckd/core/server";
import { COLLECTION_TYPE } from "@/apps/api/app/api/patients/signup-init/route";
import {
  AuthTokenDoc,
  consumeAuth,
  parseToken,
  validateAuth,
} from "@/apps/api/lib/auth/auth_token";
import { ObjectId } from "mongodb";
import { randomBytes } from "crypto";
import { updateScopes } from "@/apps/api/lib/utils/updateScopes";
import { SessionUser, requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { DEFAULT_SCOPES, SCOPES } from "@ckd/core";

export async function POST(req: NextRequest) {
  try {
    const user: SessionUser = await requireUser(req, DEFAULT_SCOPES);
    const db = await getDb();
    const { token } = await req.json().catch(() => ({}));

    const parsed = parseToken(token);

    if (!token || !parsed)
      return NextResponse.json({ error: "missing token" }, { status: 400 });

    const auth_tokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

    const res = await validateAuth(
      auth_tokens,
      COLLECTION_TYPE.OauthCode,
      parsed
    );

    if (!res.ok)
      return NextResponse.json(
        { ok: false, error: res.error },
        { status: 400 }
      );

    const patients = db.collection(COLLECTIONS.Patients);
    const patient = await patients.findOne<{ _id: ObjectId }>(
      {
        _id: res.doc.patientId,
      },
      { projection: { _id: 1 } }
    );

    if (!patient)
      return NextResponse.json(
        { ok: false, error: "There is no patient record" },
        { status: 400 }
      );

    const consumed = await consumeAuth(auth_tokens, res.doc._id);
    if (!consumed.ok)
      return NextResponse.json(
        { ok: false, error: consumed.error },
        { status: 400 }
      );

    const auth_links = db.collection(COLLECTIONS.AuthLinks);
    const provider = "password";
    const credentialId = `cred_${randomBytes(12).toString("hex")}`;
    const user_auth_link = {
      provider,
      credentialId,
      email: res.doc.email,
      principalId: String(res.doc.principalId),
      active: true,
      createdAt: new Date(),
    };
    await auth_links.insertOne(user_auth_link);

    const scopes = await updateScopes(user, [
      SCOPES.USERS_PII_READ,
      SCOPES.USERS_CLINICAL_WRITE,
    ]);

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const jwt = await new SignJWT({
      sub: credentialId,
      patientId: res.doc.patientId ?? null,
      orgId: res.doc.orgId,
      scopes,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(secret);

    return NextResponse.json({ jwt });
  } catch (e) {
    console.log(e);
    console.error(e);
    return NextResponse.json(
      { error: "Error in exchange", e },
      { status: 400 }
    );
  }
}
