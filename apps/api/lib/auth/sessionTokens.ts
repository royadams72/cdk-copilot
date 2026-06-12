import { randomBytes } from "crypto";

import { SignJWT } from "jose";
import { Collection, ObjectId } from "mongodb";

import { ROLE_SCOPES, Role, Scope, TUsersAccount } from "@ckd/core";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { AuthTokenDoc, b64url, setToken } from "@/apps/api/lib/auth/auth_token";
import { getJwtSecretBytes } from "@/apps/api/lib/auth/jwt";

type IssueSessionTokensArgs = {
  authTokens: Collection<AuthTokenDoc>;
  credentialId: string;
  email: string | null;
  principalId: string;
  subjectId: ObjectId;
  userAccount: Pick<
    TUsersAccount,
    "grants" | "orgId" | "role" | "scopes"
  >;
};

export async function issueSessionTokens({
  authTokens,
  credentialId,
  email,
  principalId,
  subjectId,
  userAccount,
}: IssueSessionTokensArgs) {
  const role = userAccount.role as Role;
  const roleScopes = ROLE_SCOPES[role] ?? [];
  const grants = [...(userAccount.scopes ?? []), ...(userAccount.grants ?? [])];
  const scopes = Array.from(new Set([...roleScopes, ...grants])) as Scope[];

  const jwt = await new SignJWT({
    orgId: userAccount.orgId ?? null,
    principalId,
    scopes,
    sub: credentialId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getJwtSecretBytes());

  const refreshTokenData = setToken();
  const createdAt = new Date();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  const refreshDoc: AuthTokenDoc = {
    _id: new ObjectId(),
    createdAt,
    credentialId,
    email: email ?? undefined,
    expiresAt,
    id: b64url(refreshTokenData.id),
    orgId: userAccount.orgId ?? null,
    patientId: subjectId,
    principalId,
    replacedById: null,
    revokedAt: null,
    role,
    rotatedAt: null,
    scopes,
    secretHash: refreshTokenData.secretHash.toString("base64"),
    sessionId: `sess_${randomBytes(12).toString("hex")}`,
    type: COLLECTION_TYPE.Refresh,
    usedAt: null,
  };

  const insertResult = await authTokens.insertOne(refreshDoc);

  return {
    jwt,
    refreshToken: refreshTokenData.token,
    refreshTokenId: insertResult.insertedId,
  };
}
