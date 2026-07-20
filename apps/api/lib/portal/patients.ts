import type { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import {
  type CarePlanMongoDoc,
  getCarePlanNextReviewAt,
  isCarePlanReviewDue,
} from "@/apps/api/lib/care-plans/shared";
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
  derivePatientLifecycleStatus,
  getPrimaryAssignment,
  normalizeLifecycleStatusToMembershipStatus,
} from "@/apps/api/lib/portal/patientLifecycle";
import type { HealthProfilesCurrentDoc } from "@/apps/api/lib/health-profiles/shared";

type PortalHealthProfilesCurrentDoc = HealthProfilesCurrentDoc & {
  reviewDueDate?: Date | null;
};

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

export function getPortalPatientMembershipStatus(
  assignments: PortalPatientAssignment[] = [],
): PortalPatientMembershipStatus {
  return normalizeLifecycleStatusToMembershipStatus(
    derivePatientLifecycleStatus({ assignments }),
  );
}

export function buildPortalPatientAccessMatch(user: SessionUser) {
  const clauses: Record<string, unknown>[] = [];

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
    const assignmentMatch: Record<string, unknown> = {};

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
  renalGuidanceReviewDueCount?: number;
  reviewCarePlanHref?: string | null;
  reviewDueCount?: number;
  reviewRenalGuidanceHref?: string | null;
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
    renalGuidanceReviewDueCount: raw.renalGuidanceReviewDueCount ?? 0,
    reviewCarePlanHref: raw.reviewCarePlanHref ?? null,
    reviewDueCount: raw.reviewDueCount ?? 0,
    reviewRenalGuidanceHref: raw.reviewRenalGuidanceHref ?? null,
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

export async function mapPortalPatientListItems(
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
  const reviewCarePlanHrefByPatientId = new Map<string, string>();
  const reviewRenalGuidanceHrefByPatientId = new Map<string, string>();
  const reviewDueCountByPatientId = new Map<string, number>();
  const renalGuidanceReviewDueCountByPatientId = new Map<string, number>();
  const patientIds = raws.map((raw) => raw._id);

  const carePlans = patientIds.length
    ? await db
        .collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans)
        .find(
          { patientId: { $in: patientIds } },
          {
            projection: {
              _id: 1,
              activatedAt: 1,
              patientId: 1,
              reviewedAt: 1,
              reviewLabel: 1,
              status: 1,
              updatedAt: 1,
            },
          },
        )
        .toArray()
    : [];
  const renalNutritionProfiles = patientIds.length
    ? await db
        .collection<PortalHealthProfilesCurrentDoc>(
          COLLECTIONS.HealthProfilesCurrent,
        )
        .find(
          {
            patientId: { $in: patientIds },
            reviewDueDate: { $ne: null, $lte: new Date() },
          },
          {
            projection: {
              patientId: 1,
              reviewDueDate: 1,
            },
          },
        )
        .toArray()
    : [];

  for (const plan of carePlans) {
    if (!isCarePlanReviewDue(plan)) {
      continue;
    }

    const patientId = plan.patientId.toHexString();
    reviewDueCountByPatientId.set(
      patientId,
      (reviewDueCountByPatientId.get(patientId) ?? 0) + 1,
    );

    const currentHref = reviewCarePlanHrefByPatientId.get(patientId);
    const currentPlan = currentHref
      ? carePlans.find(
          (candidate) =>
            candidate.patientId.toHexString() === patientId &&
            `/portal/patients/${patientId}/care-plans/${candidate._id.toHexString()}` ===
              currentHref,
        )
      : null;
    const currentNextReviewAt =
      currentPlan && isCarePlanReviewDue(currentPlan)
        ? (getCarePlanNextReviewAt(currentPlan)?.getTime() ??
          Number.POSITIVE_INFINITY)
        : Number.POSITIVE_INFINITY;
    const nextReviewAt =
      getCarePlanNextReviewAt(plan)?.getTime() ?? Number.POSITIVE_INFINITY;

    if (!currentHref || nextReviewAt < currentNextReviewAt) {
      reviewCarePlanHrefByPatientId.set(
        patientId,
        `/portal/patients/${patientId}/care-plans/${plan._id.toHexString()}`,
      );
    }
  }

  for (const profile of renalNutritionProfiles) {
    const patientId = profile.patientId.toHexString();
    renalGuidanceReviewDueCountByPatientId.set(
      patientId,
      (renalGuidanceReviewDueCountByPatientId.get(patientId) ?? 0) + 1,
    );
    reviewRenalGuidanceHrefByPatientId.set(
      patientId,
      `/portal/patients/${patientId}/nutrition-profile`,
    );
  }

  return raws.map((raw) => ({
    ...mapPortalPatientListItem({
      ...raw,
      renalGuidanceReviewDueCount:
        renalGuidanceReviewDueCountByPatientId.get(raw._id.toHexString()) ?? 0,
      reviewCarePlanHref:
        reviewCarePlanHrefByPatientId.get(raw._id.toHexString()) ?? null,
      reviewDueCount: reviewDueCountByPatientId.get(raw._id.toHexString()) ?? 0,
      reviewRenalGuidanceHref:
        reviewRenalGuidanceHrefByPatientId.get(raw._id.toHexString()) ?? null,
    }),
    worseningItems: [],
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
    case "search":
      return true;
    case "review":
      return item.reviewDueCount > 0 || item.renalGuidanceReviewDueCount > 0;
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

  const haystack = [item.name, item.email ?? ""].join(" ").toLowerCase();

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

function matchesPortalPatientStage(item: PortalPatientListItem, stage: string) {
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
  const reviewDuePatients = items.filter((item) =>
    matchesPortalPatientFilter(item, "review"),
  );
  const carePlanReviewDueCount = reviewDuePatients.reduce(
    (sum, item) => sum + item.reviewDueCount,
    0,
  );
  const renalGuidanceReviewDueCount = reviewDuePatients.reduce(
    (sum, item) => sum + item.renalGuidanceReviewDueCount,
    0,
  );

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
      actionLabel: "View reviews",
      count: carePlanReviewDueCount + renalGuidanceReviewDueCount,
      detail: `${carePlanReviewDueCount} care plan${carePlanReviewDueCount === 1 ? "" : "s"} · ${renalGuidanceReviewDueCount} renal guidance`,
      icon: "/portal/icons/review icon.png",
      label: "Reviews due",
      tone: "warning",
      valueLabelPlural: " items due",
      valueLabelSingular: " item due",
    },
    search: {
      actionLabel: "Open search",
      count: 0,
      detail: "Clinician-selected comparison of recorded data.",
      icon: "/portal/icons/trend icon.png",
      label: "Advanced search",
      tone: "accent",
    },
  };

  return statsByFilter;
}
