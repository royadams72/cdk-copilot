import { getCollection, COLLECTIONS } from "@ckd/core/server";
import { SessionUser } from "../auth/auth_requireUser";
import { getDb } from "../db/mongodb";
import { TUserPII } from "@ckd/core";

export async function updateStep(
  user: SessionUser,
  step: string
): Promise<string[]> {
  const database = await getDb();
  const user_rec = getCollection<TUserPII>(database, COLLECTIONS.UsersPII);

  const result = await user_rec.findOneAndUpdate(
    { principalId: user.principalId },
    {
      // add `step` to the array only if it isn't there already
      $addToSet: { onboardingSteps: step },
      // if you want to mark the boolean when a step is added:
      // $set: { onboardingCompleted: true },
    },
    {
      returnDocument: "after",
      projection: { onboardingSteps: 1, _id: 0 },
    }
  );

  // result.value is TUserPII | null; onboardingSteps is string[]
  return result?.onboardingSteps ?? [];
}
