import type { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { type Document, ObjectId } from "mongodb";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";
import type { PatientWorseningTrendAlert } from "@ckd/core";
import { formatDisplayDob, toIsoDate } from "@/apps/api/lib/format/date";
import {
  buildPortalWorseningHref,
  mapTrendKeyToPortalKind,
  normalizePortalPatientFilter,
  normalizePortalPatientMembershipStatusFilter,
  type PortalPatientAdvancedFilters,
  type PortalPatientDetail,
  type PortalPatientFilter,
  type PortalPatientListItem,
  type PortalPatientMembershipStatus,
  type PortalPatientMembershipStatusFilter,
  type PortalPatientStat,
  type PortalPatientWorseningItem,
} from "@/apps/api/lib/portal/patient-shared";
import {
  loadActivePortalWorseningItemsByPatientId,
  syncPatientWorseningTrendSnapshots,
} from "@/apps/api/lib/portal/worseningSnapshots";
import { getActivePatientWorseningTrendAlerts } from "@/apps/api/lib/utils/worseningTrends";

type PortalPatientSummary = {
  dietitianAssigned?: boolean;
  lastContactAt?: Date | string | null;
};

export type PortalPatientAssignment = {
  assignmentId?: string;
  careTeamId?: string;
  consentStatus?: string;
  endsAt?: Date | string | null;
  facilityId?: string;
  orgId?: string;
  startsAt?: Date | string | null;
  status?: string;
};

type PortalPatientPii = {
  dateOfBirth?: Date | string | null;
  email?: string;
  firstName?: string;
  lastName?: string;
};

export type RawPortalPatientDetailDoc = {
  _id: ObjectId;
  assignments?: PortalPatientAssignment[];
  flags?: string[];
  pii?: PortalPatientPii | null;
  stage?: string | null;
  summary?: PortalPatientSummary | null;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
function isAssignmentWithinAccessWindow(
  assignment: PortalPatientAssignment | null | undefined,
) {
  if (!assignment) {
    return false;
  }

  if (assignment.status !== "active") {
    return false;
  }

  if (!assignment.endsAt) {
    return true;
  }

  return new Date(assignment.endsAt).getTime() > Date.now();
}

export function getPortalPatientMembershipStatus(
  assignments: PortalPatientAssignment[] = [],
): PortalPatientMembershipStatus {
  if (!assignments.length) {
    return "unassigned";
  }

  const primaryAssignment = getPrimaryAssignment(assignments);

  if (!primaryAssignment?.status) {
    return "unassigned";
  }

  switch (primaryAssignment.status) {
    case "pending":
      return "pending";
    case "inactive":
      return "inactive";
    case "ended":
      return "ended";
    case "active":
    default:
      if (primaryAssignment.endsAt) {
        const endsAt = new Date(primaryAssignment.endsAt);
        if (!Number.isNaN(endsAt.getTime()) && endsAt.getTime() <= Date.now()) {
          return "expired";
        }
      }
      return "active";
  }
}

export function buildPortalPatientAccessMatch(user: SessionUser) {
  const clauses: Record<string, unknown>[] = [];
  const nowIso = new Date().toISOString();

  if (user.role === "admin" && !user.allowedPatientIds?.length) {
    return {};
  }

  if (user.orgId) {
    clauses.push({
      assignments: {
        $elemMatch: {
          orgId: user.orgId,
        },
      },
    });
  }

  const allowedPatientIds = (user.allowedPatientIds ?? [])
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  if (allowedPatientIds.length > 0) {
    clauses.push({ _id: { $in: allowedPatientIds } });
  } else {
    const assignmentMatch: Record<string, unknown> = {
      $or: [
        { status: "pending" },
        {
          $and: [
            { status: "active" },
            {
              $or: [
                { endsAt: null },
                { endsAt: { $exists: false } },
                { endsAt: { $gt: nowIso } },
              ],
            },
          ],
        },
      ],
    };

    if (user.orgId) {
      assignmentMatch.orgId = user.orgId;
    }
    if (user.facilityIds?.length) {
      assignmentMatch.facilityId = { $in: user.facilityIds };
    }
    if (user.careTeamIds?.length) {
      assignmentMatch.careTeamId = { $in: user.careTeamIds };
    }

    if (Object.keys(assignmentMatch).length > 1) {
      clauses.push({ assignments: { $elemMatch: assignmentMatch } });
    }
  }

  if (clauses.length === 0) {
    return {};
  }

  if (clauses.length === 1) {
    return clauses[0];
  }

  return { $and: clauses };
}

export function buildPortalPatientDetailPipeline(match: Document) {
  return [
    {
      $match: match,
    },
    {
      $lookup: {
        as: "pii",
        foreignField: "patientId",
        from: COLLECTIONS.UsersPII,
        localField: "_id",
        pipeline: [
          {
            $project: {
              _id: 0,
              dateOfBirth: 1,
              email: 1,
              firstName: 1,
              lastName: 1,
            },
          },
        ],
      },
    },
    {
      $project: {
        assignments: 1,
        flags: 1,
        pii: { $arrayElemAt: ["$pii", 0] },
        stage: 1,
        summary: 1,
      },
    },
  ];
}

export function getPrimaryAssignment(assignments: PortalPatientAssignment[] = []) {
  return (
    assignments.find((assignment) => isAssignmentWithinAccessWindow(assignment)) ??
    assignments.find((assignment) => assignment.status === "active") ??
    assignments[0] ??
    null
  );
}

function normalizeName(pii: PortalPatientPii) {
  const fullName = [pii.firstName, pii.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fullName || "Patient record";
}

function buildPortalPatientWorseningItems(raw: {
  activeAlerts?: PatientWorseningTrendAlert[];
  patientId: string;
}): PortalPatientWorseningItem[] {
  if (raw.activeAlerts?.length) {
    return raw.activeAlerts.map((alert) => {
      const firstDetectedAt = alert.firstDetectedAt
        ? new Date(alert.firstDetectedAt)
        : null;
      const daysActive =
        firstDetectedAt && !Number.isNaN(firstDetectedAt.getTime())
          ? Math.max(
              1,
              Math.floor(
                (Date.now() - firstDetectedAt.getTime()) / MS_PER_DAY,
              ) + 1,
            )
          : 1;

      return {
        daysActive,
        detail: alert.detail ?? alert.body,
        episodeId: alert.id,
        firstDetectedAt: alert.firstDetectedAt ?? null,
        href: buildPortalWorseningHref(raw.patientId, alert.key),
        kind: mapTrendKeyToPortalKind(alert.key),
        label: alert.title,
        level: alert.level,
        patientResponseLabel: alert.checkInResponseLabel ?? null,
        portalEscalationEligible: alert.portalEscalationEligible,
        reviewedAt: null,
        viewedAt: alert.viewedAt ?? null,
      };
    });
  }
  return [];
}

export function mapPortalPatientListItem(raw: {
  _id: ObjectId;
  activeAlerts?: PatientWorseningTrendAlert[];
  assignments?: PortalPatientAssignment[];
  flags?: string[];
  pii?: PortalPatientPii | null;
  stage?: string | null;
  summary?: PortalPatientSummary | null;
}): PortalPatientListItem {
  const primaryAssignment = getPrimaryAssignment(raw.assignments);

  return {
    id: raw._id.toHexString(),
    accessEndsAt: toIsoDate(primaryAssignment?.endsAt),
    careTeamId: primaryAssignment?.careTeamId ?? null,
    dateOfBirth: formatDisplayDob(raw.pii?.dateOfBirth),
    dateOfBirthIso: toIsoDate(raw.pii?.dateOfBirth),
    email: raw.pii?.email ?? null,
    facilityId: primaryAssignment?.facilityId ?? null,
    flags: raw.flags ?? [],
    lastContactAt: toIsoDate(raw.summary?.lastContactAt),
    membershipStatus: getPortalPatientMembershipStatus(raw.assignments ?? []),
    name: normalizeName(raw.pii ?? {}),
    stage: raw.stage ?? null,
    worseningItems: buildPortalPatientWorseningItems({
      activeAlerts: raw.activeAlerts ?? [],
      patientId: raw._id.toHexString(),
    }),
  };
}

export function mapPortalPatientDetail(raw: {
  _id: ObjectId;
  activeAlerts?: PatientWorseningTrendAlert[];
  assignments?: PortalPatientAssignment[];
  flags?: string[];
  pii?: PortalPatientPii | null;
  stage?: string | null;
  summary?: PortalPatientSummary | null;
}): PortalPatientDetail {
  const base = mapPortalPatientListItem(raw);

  return {
    ...base,
    assignments: (raw.assignments ?? []).map((assignment) => ({
      careTeamId: assignment.careTeamId ?? null,
      consentStatus: assignment.consentStatus ?? null,
      endsAt: toIsoDate(assignment.endsAt),
      facilityId: assignment.facilityId ?? null,
      orgId: assignment.orgId ?? null,
      startsAt: toIsoDate(assignment.startsAt),
      status: assignment.status ?? null,
    })),
  };
}

export async function mapPortalPatientListItemsWithWorsening(
  db: Db,
  raws: Array<{
    _id: ObjectId;
    assignments?: PortalPatientAssignment[];
    flags?: string[];
    pii?: PortalPatientPii | null;
    stage?: string | null;
    summary?: PortalPatientSummary | null;
  }>,
) {
  const activeAlertsByPatientId = new Map<
    string,
    PatientWorseningTrendAlert[]
  >();
  const patientIds = raws.map((raw) => raw._id);

  await Promise.all(
    raws.map(async (raw) => {
      const alerts = await getActivePatientWorseningTrendAlerts(db, {
        patientId: raw._id,
      });
      await syncPatientWorseningTrendSnapshots(db, {
        alerts,
        patientId: raw._id,
      });
      activeAlertsByPatientId.set(raw._id.toHexString(), alerts);
    }),
  );

  const activeItemsByPatientId =
    await loadActivePortalWorseningItemsByPatientId(db, patientIds);

  return raws.map((raw) => ({
    ...mapPortalPatientListItem({
      ...raw,
      activeAlerts:
        activeAlertsByPatientId
          .get(raw._id.toHexString())
          ?.filter((alert) => alert.portalEscalationEligible) ?? [],
    }),
    worseningItems: activeItemsByPatientId.get(raw._id.toHexString()) ?? [],
  }));
}

function hasFlag(item: PortalPatientListItem, terms: string[]) {
  const flags = item.flags.map((flag) => flag.toLowerCase());
  return terms.some((term) => flags.some((flag) => flag.includes(term)));
}

function isEndingSoon(item: PortalPatientListItem) {
  if (item.membershipStatus !== "active") {
    return false;
  }

  if (!item.accessEndsAt) {
    return false;
  }

  const endsAt = new Date(item.accessEndsAt);
  const diffMs = endsAt.getTime() - Date.now();
  return diffMs >= 0 && diffMs <= 30 * MS_PER_DAY;
}

function isDisengaged(item: PortalPatientListItem) {
  if (hasFlag(item, ["missing", "disengaged", "inactive"])) {
    return true;
  }

  if (!item.lastContactAt) {
    return false;
  }

  const lastContactAt = new Date(item.lastContactAt);
  const diffMs = Date.now() - lastContactAt.getTime();
  return diffMs >= 14 * MS_PER_DAY;
}

export function matchesPortalPatientFilter(
  item: PortalPatientListItem,
  filter: PortalPatientFilter,
) {
  switch (filter) {
    case "worsening":
      return item.worseningItems.length > 0;
    case "review":
      return hasFlag(item, ["care-plan-review", "review-due"]);
    case "disengaged":
      return isDisengaged(item);
    case "endingSoon":
      return isEndingSoon(item);
    case "all":
    default:
      return true;
  }
}

export function matchesPortalPatientQuery(
  item: PortalPatientListItem,
  query: string,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
    item.name,
    item.email ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

function matchesPortalPatientDateOfBirth(
  item: PortalPatientListItem,
  dateOfBirth: string,
) {
  const normalizedDateOfBirth = dateOfBirth.trim();
  if (!normalizedDateOfBirth) {
    return true;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDateOfBirth)) {
    return false;
  }

  return item.dateOfBirthIso?.slice(0, 10) === normalizedDateOfBirth;
}

function matchesPortalPatientStage(
  item: PortalPatientListItem,
  stage: string,
) {
  const normalizedStage = stage.trim().toLowerCase();
  if (!normalizedStage) {
    return true;
  }

  return (item.stage ?? "").trim().toLowerCase() === normalizedStage;
}

function matchesPortalPatientAssignmentValue(
  actual: string | null,
  expected: string,
) {
  const normalizedExpected = expected.trim().toLowerCase();
  if (!normalizedExpected) {
    return true;
  }

  return (actual ?? "").trim().toLowerCase() === normalizedExpected;
}

export function matchesPortalPatientAdvancedFilters(
  item: PortalPatientListItem,
  filters: PortalPatientAdvancedFilters,
) {
  return (
    matchesPortalPatientQuery(item, filters.query) &&
    matchesPortalPatientDateOfBirth(item, filters.dateOfBirth) &&
    matchesPortalPatientFilter(
      item,
      normalizePortalPatientFilter(filters.filter),
    ) &&
    matchesPortalPatientStage(item, filters.stage) &&
    matchesPortalPatientAssignmentValue(item.careTeamId, filters.careTeamId) &&
    matchesPortalPatientAssignmentValue(item.facilityId, filters.facilityId) &&
    (normalizePortalPatientMembershipStatusFilter(filters.membershipStatus) ===
      "all" ||
      item.membershipStatus ===
        normalizePortalPatientMembershipStatusFilter(filters.membershipStatus))
  );
}

export function sortPortalPatients(items: PortalPatientListItem[]) {
  return [...items].sort((a, b) => {
    return a.name.localeCompare(b.name, "en-GB");
  });
}

export function buildPortalPatientStats(items: PortalPatientListItem[]) {
  const statsByFilter: Record<
    Exclude<PortalPatientFilter, "all">,
    PortalPatientStat
  > = {
    disengaged: {
      count: items.filter((item) =>
        matchesPortalPatientFilter(item, "disengaged"),
      ).length,
      detail: "Not logging or syncing key data.",
      icon: "/portal/icons/trend icon2.png",
      label: "Missing data / disengaged",
      tone: "warning",
    },
    endingSoon: {
      count: items.filter((item) =>
        matchesPortalPatientFilter(item, "endingSoon"),
      ).length,
      detail: "Access will be ending in the next few weeks.",
      icon: "/portal/icons/user icon.png",
      label: "Access ending soon",
      tone: "accent",
    },
    review: {
      count: items.filter((item) => matchesPortalPatientFilter(item, "review"))
        .length,
      detail: "Need their care plans reviewed.",
      icon: "/portal/icons/review icon.png",
      label: "Care plan review due",
      tone: "warning",
    },
    worsening: {
      count: items.filter((item) =>
        matchesPortalPatientFilter(item, "worsening"),
      ).length,
      detail:
        "Repeated decline in nutrition, activity, weight or blood pressure.",
      icon: "/portal/icons/trend icon.png",
      label: "Worsening trends",
      tone: "warning",
    },
  };

  return statsByFilter;
}
