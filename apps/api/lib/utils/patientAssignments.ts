import { TPatientAssignment } from "../../../../packages/core/src/isomorphic";

type AssignmentStateSummary = {
  activeAssignmentCount: number;
  hasActiveAssignments: boolean;
};

export function summarizeAssignmentState(
  assignments: TPatientAssignment[] | null | undefined,
): AssignmentStateSummary {
  const activeAssignmentCount =
    assignments?.filter((assignment) => assignment.status === "active").length ?? 0;

  return {
    activeAssignmentCount,
    hasActiveAssignments: activeAssignmentCount > 0,
  };
}
