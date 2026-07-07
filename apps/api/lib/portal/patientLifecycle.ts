import type { PortalPatientMembershipStatus } from "@/apps/api/lib/portal/patient-shared";

const DAY_MS = 24 * 60 * 60 * 1000;

type AssignmentLike = {
  endsAt?: Date | string | null;
  status?: string | null;
};

export type PortalPatientLifecycleStatus =
  | "active"
  | "endingSoon"
  | "expired"
  | "inactive"
  | "ended"
  | "pending"
  | "unassigned";

export type PortalPatientLifecycleSnapshot = {
  computedStatus: PortalPatientLifecycleStatus;
  daysRemaining: number | null;
  endsAt: string | null;
  status: string | null;
};

export function getPrimaryAssignment<T extends AssignmentLike>(
  assignments: T[] = [],
  now = new Date(),
) {
  return (
    assignments.find((assignment) =>
      isAssignmentWithinAccessWindow(assignment, now),
    ) ??
    assignments.find((assignment) => assignment.status === "active") ??
    assignments[0] ??
    null
  );
}

export function isAssignmentWithinAccessWindow(
  assignment: AssignmentLike | null | undefined,
  now = new Date(),
) {
  if (!assignment || assignment.status !== "active") {
    return false;
  }

  if (!assignment.endsAt) {
    return true;
  }

  return new Date(assignment.endsAt).getTime() > now.getTime();
}

export function derivePatientLifecycleStatus(args: {
  assignment?: AssignmentLike | null;
  assignments?: AssignmentLike[];
  endingSoonWindowDays?: number;
  now?: Date;
}): PortalPatientLifecycleStatus {
  const now = args.now ?? new Date();
  const endingSoonWindowMs =
    (args.endingSoonWindowDays ?? 30) * DAY_MS;
  const assignment =
    args.assignment ??
    getPrimaryAssignment(args.assignments ?? [], now);

  if (!assignment?.status) {
    return "unassigned";
  }

  if (assignment.status === "pending") return "pending";
  if (assignment.status === "inactive") return "inactive";
  if (assignment.status === "ended") return "ended";
  if (assignment.status !== "active") return "unassigned";

  if (!assignment.endsAt) {
    return "active";
  }

  const endsAtMs = new Date(assignment.endsAt).getTime();
  if (Number.isNaN(endsAtMs)) {
    return "active";
  }

  const diffMs = endsAtMs - now.getTime();
  if (diffMs <= 0) {
    return "expired";
  }
  if (diffMs <= endingSoonWindowMs) {
    return "endingSoon";
  }
  return "active";
}

export function normalizeLifecycleStatusToMembershipStatus(
  status: PortalPatientLifecycleStatus,
): PortalPatientMembershipStatus {
  return status === "endingSoon" ? "active" : status;
}

export function getPatientLifecycleSnapshot(args: {
  assignment?: AssignmentLike | null;
  assignments?: AssignmentLike[];
  endingSoonWindowDays?: number;
  now?: Date;
}): PortalPatientLifecycleSnapshot {
  const now = args.now ?? new Date();
  const assignment =
    args.assignment ??
    getPrimaryAssignment(args.assignments ?? [], now);
  const endsAtDate =
    assignment?.endsAt instanceof Date
      ? assignment.endsAt
      : assignment?.endsAt
        ? new Date(assignment.endsAt)
        : null;
  const computedStatus = derivePatientLifecycleStatus({
    assignment,
    assignments: args.assignments,
    endingSoonWindowDays: args.endingSoonWindowDays,
    now,
  });
  const endsAt =
    endsAtDate && !Number.isNaN(endsAtDate.getTime())
      ? endsAtDate.toISOString()
      : null;
  const daysRemaining =
    endsAt && computedStatus !== "expired"
      ? Math.max(
          0,
          Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY_MS),
        )
      : computedStatus === "expired"
        ? 0
        : null;

  return {
    computedStatus,
    daysRemaining,
    endsAt,
    status: assignment?.status ?? null,
  };
}

export function formatPatientLifecycleStatusLabel(
  status: PortalPatientLifecycleStatus,
) {
  switch (status) {
    case "endingSoon":
      return "Ending soon";
    case "inactive":
      return "Suspended";
    case "expired":
      return "Expired";
    case "ended":
      return "Ended";
    case "pending":
      return "Pending";
    case "unassigned":
      return "Unassigned";
    case "active":
    default:
      return "Active";
  }
}
