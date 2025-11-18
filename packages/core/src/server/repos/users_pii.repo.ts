// packages/core/src/server/repos/users_pii.repo.ts
import { ObjectId } from "mongodb";
import { UserPII_Create } from "../../isomorphic/schemas/users_pii";

export async function insertUserPII(db: any, input: unknown) {
  const parsed = UserPII_Create.parse(input);
  const doc = {
    ...parsed,
    patientId: new ObjectId(parsed.patientId), // conversion HERE
  };
  await db.collection("users_pii").insertOne(doc);
}
