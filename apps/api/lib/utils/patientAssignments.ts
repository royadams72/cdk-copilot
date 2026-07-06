import { TPatientAssignment } from "../../../../packages/core/src/isomorphic";

type AssignmentStateSummary = {
  activeAssignmentCount: number;
  hasActiveAssignments: boolean;
};

export function isAssignmentCurrentlyActive(
  assignment: Pick<TPatientAssignment, "endsAt" | "status"> | null | undefined,
) {
  if (!assignment || assignment.status !== "active") {
    return false;
  }

  if (!assignment.endsAt) {
    return true;
  }

  return new Date(assignment.endsAt).getTime() > Date.now();
}

export function summarizeAssignmentState(
  assignments: TPatientAssignment[] | null | undefined,
): AssignmentStateSummary {
  const activeAssignmentCount =
    assignments?.filter((assignment) => isAssignmentCurrentlyActive(assignment))
      .length ?? 0;

  return {
    activeAssignmentCount,
    hasActiveAssignments: activeAssignmentCount > 0,
  };
}
