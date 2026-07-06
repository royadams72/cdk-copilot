export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  loadMembershipEvents,
  loadPortalPatientMembershipContext,
  mapMembershipSnapshot,
  type PortalPatientMembershipResponse,
} from "@/apps/api/lib/portal/patientMembership";
import { COLLECTIONS } from "core/server/constants/collections";
import type { TPatientMembershipEventDoc } from "core/server/schemas/patientMembership";
import type { TPatientMembershipAction } from "core/isomorphic/schemas/patient_membership_events";

const Body = z
  .object({
    action: z.enum(["extend", "suspend", "end", "reactivate"]),
    months: z.enum(["3", "6", "12"]).optional(),
    note: z.string().trim().min(3, "Enter a short note"),
  })
  .superRefine((value, ctx) => {
    if ((value.action === "extend" || value.action === "reactivate") && !value.months) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select an extension duration",
        path: ["months"],
      });
    }
  });

function addMonths(from: Date, months: number) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  return next;
}

function normalizeAssignmentStatus(
  value: string | null | undefined,
): TPatientMembershipEventDoc["previousStatus"] {
  switch (value) {
    case "pending":
    case "active":
    case "inactive":
    case "ended":
      return value;
    default:
      return "ended";
  }
}

function actionToEvent(action: z.infer<typeof Body>["action"]): TPatientMembershipAction {
  switch (action) {
    case "extend":
      return "extended";
    case "suspend":
      return "suspended";
    case "end":
      return "ended";
    case "reactivate":
      return "reactivated";
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const db = await getDb();
    const membershipContext = await loadPortalPatientMembershipContext({
      db,
      patientId,
      user: caller,
    });
    const events = await loadMembershipEvents({
      db,
      patientId: membershipContext.patientDoc._id,
    });

    return ok<PortalPatientMembershipResponse>({
      events,
      membership: mapMembershipSnapshot(membershipContext.primaryAssignment),
      patient: membershipContext.patient,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load patient membership",
      undefined,
      error?.status || 500,
    );
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad(parsed.error.issues[0]?.message ?? "Invalid membership action", undefined, 400);
    }

    const db = await getDb();
    const membershipContext = await loadPortalPatientMembershipContext({
      db,
      patientId,
      user: caller,
    });
    const assignment = membershipContext.primaryAssignment;

    if (!assignment?.assignmentId) {
      return bad("No assignment found for this patient", { code: "assignment_not_found" }, 404);
    }

    const now = new Date();
    const previousStatus = normalizeAssignmentStatus(assignment.status);
    const previousEndsAt =
      assignment.endsAt instanceof Date
        ? assignment.endsAt
        : assignment.endsAt
          ? new Date(assignment.endsAt)
          : null;

    let nextStatus: "pending" | "active" | "inactive" | "ended";
    let nextEndsAt: Date | null = previousEndsAt;
    let nextStartsAt =
      assignment.startsAt instanceof Date
        ? assignment.startsAt.toISOString()
        : assignment.startsAt
          ? new Date(assignment.startsAt).toISOString()
          : now.toISOString();

    if (parsed.data.action === "extend") {
      const months = Number(parsed.data.months);
      const base =
        previousEndsAt && previousEndsAt.getTime() > now.getTime() ? previousEndsAt : now;
      nextEndsAt = addMonths(base, months);
      nextStatus = previousStatus === "ended" ? "active" : (previousStatus as typeof nextStatus);
    } else if (parsed.data.action === "suspend") {
      nextStatus = "inactive";
    } else if (parsed.data.action === "end") {
      nextStatus = "ended";
      nextEndsAt = now;
    } else {
      const months = Number(parsed.data.months);
      nextStatus = "active";
      nextEndsAt = addMonths(now, months);
      nextStartsAt = now.toISOString();
    }

    await db.collection(COLLECTIONS.Patients).updateOne(
      {
        _id: membershipContext.patientDoc._id,
        "assignments.assignmentId": assignment.assignmentId,
      },
      {
        $set: {
          "assignments.$.consentStatus":
            nextStatus === "active"
              ? "accepted"
              : (assignment.consentStatus ?? "accepted"),
          "assignments.$.endsAt": nextEndsAt ? nextEndsAt.toISOString() : null,
          "assignments.$.startsAt": nextStartsAt,
          "assignments.$.status": nextStatus,
          "assignments.$.updatedAt": now.toISOString(),
          "summary.membershipEndsAt": nextEndsAt ? nextEndsAt.toISOString() : null,
          "summary.membershipStartedAt": nextStartsAt,
          updatedAt: now,
        },
      },
    );

    await db
      .collection<TPatientMembershipEventDoc>(COLLECTIONS.PatientMembershipEvents)
      .insertOne({
        action: actionToEvent(parsed.data.action),
        actorPrincipalId: caller.principalId,
        actorRole: caller.role,
        assignmentId: assignment.assignmentId,
        careTeamId: assignment.careTeamId ?? "",
        createdAt: now,
        facilityId: assignment.facilityId ?? "",
        nextEndsAt,
        nextStatus,
        note: parsed.data.note,
        orgId: assignment.orgId ?? caller.orgId ?? "org_demo",
        patientId: membershipContext.patientDoc._id,
        previousEndsAt,
        previousStatus,
      });

    const updatedContext = await loadPortalPatientMembershipContext({
      db,
      patientId,
      user: caller,
    });
    const events = await loadMembershipEvents({
      db,
      patientId: updatedContext.patientDoc._id,
    });

    return ok<PortalPatientMembershipResponse>({
      events,
      membership: mapMembershipSnapshot(updatedContext.primaryAssignment),
      patient: updatedContext.patient,
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to update patient membership",
      undefined,
      error?.status || 500,
    );
  }
}
