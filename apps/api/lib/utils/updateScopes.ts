import { getCollection, COLLECTIONS } from "@/packages/core/dist/server";
import { SessionUser } from "../auth/auth_requireUser";
import { getDb } from "../db/mongodb";

import { Scope, TUsersAccount } from "@ckd/core";

export async function updateScopes(
  user: SessionUser,
  scopesToAdd: Scope | Scope[] = []
): Promise<string[]> {
  const database = await getDb();

  // Normalise to array
  const scopesToAddArray = Array.isArray(scopesToAdd)
    ? scopesToAdd
    : [scopesToAdd];

  // Combine existing + new scopes and de-duplicate
  const scopes = Array.from(
    new Set([...(user.scopes ?? []), ...scopesToAddArray])
  );

  // getCollection returns an object; unwrap the actual collection
  const user_rec = getCollection<TUsersAccount>(
    database,
    COLLECTIONS.UsersAccounts
  );

  // TODO add checks
  const result = await user_rec.findOneAndUpdate(
    {
      principalId: user.principalId,
    },
    { $set: { scopes } },
    { returnDocument: "after", upsert: false, includeResultMetadata: true }
  );

  return scopes;
}
