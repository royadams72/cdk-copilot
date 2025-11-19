import { getCollection, COLLECTIONS } from "@/packages/core/dist/server";
import { SessionUser } from "../auth/auth_requireUser";
import { getDb } from "../db/mongodb";

import { Scope, TUsersAccount } from "@ckd/core";

export async function updateScopes(
  user: SessionUser,
  scopesToAdd: Scope | Scope[] = []
): Promise<string[]> {
  const database = await getDb();
  const scopes = [...(user.scopes ?? []), ...scopesToAdd];
  const user_rec = getCollection<TUsersAccount>(
    database,
    COLLECTIONS.UsersAccounts
  );
  // TODO add checks
  await user_rec.findOneAndUpdate(
    {
      principalId: user.principalId,
    },
    { $set: { scopes: scopes } }
  );

  return scopes;
}
