import type { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { ObjectId, type Document } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";
import { formatDisplayDob, toIsoDate } from "@/apps/api/lib/format/date";
import {
  normalizePortalPatientFilter,
  type PortalPatientDetail,
  type PortalPatientFilter,
  type PortalPatientListItem,
  type PortalPatientStat,
} from "@/apps/api/lib/portal/patient-shared";

type PortalPatientSummary = {
  dietitianAssigned?: boolean;
  lastContactAt?: Date | string | null;
  risk?: "green" | "amber" | "red" | null;
};

type PortalPatientAssignment = {
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

export function buildPortalPatientAccessMatch(user: SessionUser) {
  const clauses: Record<string, unknown>[] = [];

  if (user.role === "admin" && !(user.allowedPatientIds?.length)) {
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
      status: { $in: ["active", "pending"] },
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
        localField: "_id",
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

function getPrimaryAssignment(assignments: PortalPatientAssignment[] = []) {
  return (
    assignments.find((assignment) => assignment.status === "active") ??
    assignments[0] ??
    null
  );
}

function normalizeName(pii: PortalPatientPii) {
  const fullName = [pii.firstName, pii.lastName].filter(Boolean).join(" ").trim();
  return fullName || "Patient record";
}

export function mapPortalPatientListItem(raw: {
  _id: ObjectId;
  assignments?: PortalPatientAssignment[];
  flags?: string[];
  pii?: PortalPatientPii | null;
  stage?: string | null;
  summary?: PortalPatientSummary | null;
}): PortalPatientListItem {
  const primaryAssignment = getPrimaryAssignment(raw.assignments);
  const risk = raw.summary?.risk ?? "unknown";

  return {
    accessEndsAt: toIsoDate(primaryAssignment?.endsAt),
    careTeamId: primaryAssignment?.careTeamId ?? null,
    dateOfBirth: formatDisplayDob(raw.pii?.dateOfBirth),
    email: raw.pii?.email ?? null,
    facilityId: primaryAssignment?.facilityId ?? null,
    flags: raw.flags ?? [],
    id: raw._id.toHexString(),
    lastContactAt: toIsoDate(raw.summary?.lastContactAt),
    name: normalizeName(raw.pii ?? {}),
    risk,
    stage: raw.stage ?? null,
  };
}

export function mapPortalPatientDetail(raw: {
  _id: ObjectId;
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

function hasFlag(item: PortalPatientListItem, terms: string[]) {
  const flags = item.flags.map((flag) => flag.toLowerCase());
  return terms.some((term) => flags.some((flag) => flag.includes(term)));
}

function isEndingSoon(item: PortalPatientListItem) {
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
      return item.risk === "red" || hasFlag(item, ["worsening", "trend"]);
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
    item.dateOfBirth ?? "",
    item.stage ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(normalized);
}

export function sortPortalPatients(items: PortalPatientListItem[]) {
  const riskWeight = {
    red: 0,
    amber: 1,
    green: 2,
    unknown: 3,
  } as const;

  return [...items].sort((a, b) => {
    const riskCompare = riskWeight[a.risk] - riskWeight[b.risk];
    if (riskCompare !== 0) {
      return riskCompare;
    }

    return a.name.localeCompare(b.name, "en-GB");
  });
}

export function buildPortalPatientStats(items: PortalPatientListItem[]) {
  const statsByFilter: Record<
    Exclude<PortalPatientFilter, "all">,
    PortalPatientStat
  > = {
    worsening: {
      count: items.filter((item) => matchesPortalPatientFilter(item, "worsening"))
        .length,
      detail:
        "Repeated decline in nutrition, activity, weight or blood pressure.",
      icon: "/portal/icons/trend icon.png",
      label: "Worsening trends this month",
      tone: "warning",
    },
    review: {
      count: items.filter((item) => matchesPortalPatientFilter(item, "review"))
        .length,
      detail: "Need their care plans reviewed.",
      icon: "/portal/icons/review icon.png",
      label: "Care plan review due",
      tone: "warning",
    },
    disengaged: {
      count: items.filter((item) => matchesPortalPatientFilter(item, "disengaged"))
        .length,
      detail: "Not logging or syncing key data.",
      icon: "/portal/icons/trend icon2.png",
      label: "Missing data / disengaged",
      tone: "warning",
    },
    endingSoon: {
      count: items.filter((item) => matchesPortalPatientFilter(item, "endingSoon"))
        .length,
      detail: "Access will be ending in the next few weeks.",
      icon: "/portal/icons/user icon.png",
      label: "Access ending soon",
      tone: "accent",
    },
  };

  return statsByFilter;
}
