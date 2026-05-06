import { NextRequest, NextResponse } from "next/server";
import { makeRandomId } from "@/apps/api/lib/http/request";
import { requireUser, SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { bad } from "@/apps/api/lib/http/responses";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { COLLECTIONS } from "@/packages/core/dist/server";
import { TUsersAccount } from "@/packages/core/dist/isomorphic";
import { ONBOARDING_STEPS, TUserPII } from "@ckd/core";

function resolveOnboardingRoute(
  onboardingCompleted?: boolean,
  onboardingSteps?: string[],
) {
  if (onboardingCompleted) return null;
  if (onboardingSteps?.includes(ONBOARDING_STEPS.Pii)) {
    return "/(auth)/onboarding/clinical-form";
  }
  return "/(auth)/onboarding/pii-form";
}

export async function GET(req: NextRequest) {
  const requestId = makeRandomId();

  try {
    const user: SessionUser = await requireUser(req, [], {
      allowAccountRecovery: true,
    });
    if (!user.patientId) {
      return bad("Patient context missing", { requestId }, 403);
    }

    const database = await getDb();
    const usersAccounts = database.collection<TUsersAccount>(
      COLLECTIONS.UsersAccounts,
    );
    const usersPii = database.collection<TUserPII>(COLLECTIONS.UsersPII);
    const activeUser = await usersAccounts.findOne({
      isActive: true,
      principalId: user.principalId,
    });
    const pii = await usersPii.findOne(
      { principalId: user.principalId },
      {
        projection: {
          onboardingCompleted: 1,
          onboardingSteps: 1,
        },
      },
    );

    if (!activeUser) {
      return bad("Not found", { requestId }, 404);
    }

    await usersAccounts.updateOne(
      { principalId: activeUser.principalId },
      { $set: { lastActiveAt: new Date() } },
    );
    return NextResponse.json(
      {
        ok: true,
        onboardingCompleted: !!pii?.onboardingCompleted,
        onboardingSteps: pii?.onboardingSteps ?? [],
        nextOnboardingRoute: resolveOnboardingRoute(
          pii?.onboardingCompleted,
          pii?.onboardingSteps,
        ),
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("GET /api/users/get-user failed", {
      requestId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack }
          : error,
    });
    const status = error?.status || 500;
    return bad(error?.message || "Server error", { requestId }, status);
  }
}
