export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { syncExpiredPatientMemberships } from "@/apps/api/lib/portal/patientMembershipExpiry";
import { loadPortalStaffScope } from "@/apps/api/lib/portal/staffScope";
import { ROLES } from "@ckd/core";

function isCronRequest(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function runExpirySync(args: {
  assignmentScope?: {
    careTeamIds?: string[];
    facilityIds?: string[];
    orgId?: string | null;
  };
  patientId?: string | null;
}) {
  const db = await getDb();

  if (args.patientId && !ObjectId.isValid(args.patientId)) {
    return bad("Invalid patientId", undefined, 400);
  }

  const result = await syncExpiredPatientMemberships({
    assignmentScope: args.assignmentScope,
    db,
    patientId: args.patientId ? new ObjectId(args.patientId) : undefined,
  });

  return ok(result);
}

export async function GET(req: NextRequest) {
  if (!isCronRequest(req)) {
    return bad("Unauthorized", undefined, 401);
  }

  try {
    return await runExpirySync({
      patientId: req.nextUrl.searchParams.get("patientId"),
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to run membership expiry sync",
      undefined,
      error?.status || 500,
    );
  }
}

export async function POST(req: NextRequest) {
  if (isCronRequest(req)) {
    try {
      const body = (await req.json().catch(() => null)) as
        | { patientId?: string }
        | null;
      return await runExpirySync(body ?? {});
    } catch (error: any) {
      return bad(
        error?.message || "Unable to run membership expiry sync",
        undefined,
        error?.status || 500,
      );
    }
  }

  try {
    const caller = await requireUser(req);
    if (caller.role === ROLES.Patient) {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const db = await getDb();
    const scope = await loadPortalStaffScope(db, caller);
    const body = (await req.json().catch(() => null)) as
      | { patientId?: string }
      | null;
    return await runExpirySync({
      assignmentScope: body?.patientId
        ? undefined
        : {
            careTeamIds: scope.careTeamIds,
            facilityIds: scope.facilityIds,
            orgId: caller.orgId,
          },
      patientId: body?.patientId,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to run membership expiry sync",
      undefined,
      error?.status || 500,
    );
  }
}
