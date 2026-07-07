import { Filter, ObjectId } from "mongodb";

import { buildActiveAssignmentEndsAtFilter } from "@/apps/api/lib/utils/patientAssignmentDateFilters";

type AssignmentAccessUser = {
  allowedPatientIds?: string[];
  careTeamIds?: string[];
  facilityIds?: string[];
  orgId?: string;
};

type PatientAssignmentFilterDoc = {
  _id?: ObjectId;
  assignments?: Array<{
    careTeamId?: string;
    facilityId?: string;
    orgId?: string;
    status?: string;
  }>;
};

export function buildPatientAccessFilter(
  user: AssignmentAccessUser,
): Filter<PatientAssignmentFilterDoc> {
  const ors: Filter<PatientAssignmentFilterDoc>[] = [];
  const now = new Date();

  const allowedPatientIds = (user.allowedPatientIds ?? [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  if (allowedPatientIds.length) {
    ors.push({ _id: { $in: allowedPatientIds } });
  }

  const facilityIds = (user.facilityIds ?? []).filter(Boolean);
  const careTeamIds = (user.careTeamIds ?? []).filter(Boolean);

  if (user.orgId && (facilityIds.length || careTeamIds.length)) {
    const assignmentOrs: NonNullable<
      Filter<PatientAssignmentFilterDoc>["$or"]
    > = [];

    if (facilityIds.length) {
      assignmentOrs.push({ facilityId: { $in: facilityIds } });
    }

    if (careTeamIds.length) {
      assignmentOrs.push({ careTeamId: { $in: careTeamIds } });
    }

    ors.push({
      assignments: {
        $elemMatch: {
          $and: [
            buildActiveAssignmentEndsAtFilter(now),
          ],
          orgId: user.orgId,
          status: "active",
          $or: assignmentOrs,
        },
      },
    });
  }

  if (!ors.length) {
    return { _id: { $in: [] } };
  }

  return ors.length === 1 ? ors[0] : { $or: ors };
}
