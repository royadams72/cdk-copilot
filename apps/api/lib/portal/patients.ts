import type { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { ObjectId, type Document } from "mongodb";
import type { Db } from "mongodb";
import { COLLECTIONS } from "@ckd/core/server";
import type { PatientWorseningTrendAlert } from "@ckd/core";
import { formatDisplayDob, toIsoDate } from "@/apps/api/lib/format/date";
import {
  normalizePortalPatientFilter,
  type PortalPatientDetail,
  type PortalPatientFilter,
  type PortalPatientListItem,
  type PortalPatientStat,
  type PortalPatientWorseningItem,
} from "@/apps/api/lib/portal/patient-shared";
import { getActivePatientWorseningTrendAlerts } from "@/apps/api/lib/utils/worseningTrends";

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

function flagIncludes(flag: string, terms: string[]) {
  const normalized = flag.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function mapTrendKeyToPortalKind(
  key: PatientWorseningTrendAlert["key"],
): PortalPatientWorseningItem["kind"] {
  switch (key) {
    case "blood_pressure_up":
      return "bloodPressure";
    case "steps_decline":
      return "activity";
    case "symptoms_worsening":
      return "symptoms";
    case "nutrition_worsening":
      return "nutrition";
    case "weight_decrease":
      return "weightDecrease";
    case "weight_increase":
      return "weightIncrease";
  }
}

function buildPortalWorseningHref(
  patientId: string,
  key: PatientWorseningTrendAlert["key"],
) {
  switch (key) {
    case "blood_pressure_up":
      return `/portal/patients/${patientId}/health?metric=blood_pressure`;
    case "weight_decrease":
    case "weight_increase":
      return `/portal/patients/${patientId}/health?metric=weight`;
    case "symptoms_worsening":
      return `/portal/patients/${patientId}/health?metric=symptoms`;
    case "nutrition_worsening":
      return `/portal/patients/${patientId}/nutrition`;
    case "steps_decline":
      return `/portal/patients/${patientId}`;
  }
}

function buildPortalPatientWorseningItems(raw: {
  activeAlerts?: PatientWorseningTrendAlert[];
  flags?: string[];
  patientId: string;
  risk?: PortalPatientListItem["risk"];
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
              Math.floor((Date.now() - firstDetectedAt.getTime()) / MS_PER_DAY) + 1,
            )
          : 1;

      return {
        daysActive,
        detail: alert.detail ?? alert.body,
        firstDetectedAt: alert.firstDetectedAt ?? null,
        href: buildPortalWorseningHref(raw.patientId, alert.key),
        kind: mapTrendKeyToPortalKind(alert.key),
        label: alert.title,
        level: alert.level,
        patientResponseLabel: alert.checkInResponseLabel ?? null,
        portalEscalationEligible: alert.portalEscalationEligible,
        viewedAt: alert.viewedAt ?? null,
      };
    });
  }

  const flags = raw.flags ?? [];
  const items: PortalPatientWorseningItem[] = [];

  const definitions: Array<{
    detail: string;
    href: string;
    kind: Exclude<PortalPatientWorseningItem["kind"], "general">;
    label: string;
    terms: string[];
  }> = [
    {
      detail: "Recent blood pressure readings are above the patient's recent baseline.",
      href: "/health?metric=blood_pressure",
      kind: "bloodPressure",
      label: "Blood pressure up",
      terms: ["blood pressure", "blood-pressure", "blood_pressure", "bp", "hypertension"],
    },
    {
      detail: "Weight has increased over the current review window.",
      href: "/health?metric=weight",
      kind: "weightIncrease",
      label: "Weight increase",
      terms: ["weight increase", "weight-increase", "weight_increase", "weight gain", "weight-gain", "weight_gain", "weight up"],
    },
    {
      detail: "Weight has decreased over the current review window.",
      href: "/health?metric=weight",
      kind: "weightDecrease",
      label: "Weight decrease",
      terms: ["weight decrease", "weight-decrease", "weight_decrease", "weight loss", "weight-loss", "weight_loss", "weight down"],
    },
    {
      detail: "Symptom reporting has increased compared with the prior review window.",
      href: "/health?metric=symptoms",
      kind: "symptoms",
      label: "More symptoms reported",
      terms: ["symptom", "symptoms"],
    },
    {
      detail: "Activity levels have fallen compared with the prior review window.",
      href: "/health?metric=symptoms",
      kind: "activity",
      label: "Activity down",
      terms: ["activity", "inactive", "low activity", "low-activity", "activity-down"],
    },
    {
      detail: "Nutrition logging suggests more target breaches this month.",
      href: "/nutrition",
      kind: "nutrition",
      label: "Over nutrition targets",
      terms: ["nutrition", "meal target", "meal-target", "phosphorus", "sodium", "potassium", "protein target", "target breach", "target-breach"],
    },
  ];

  for (const definition of definitions) {
    if (flags.some((flag) => flagIncludes(flag, definition.terms))) {
      items.push({
        daysActive: 1,
        detail: definition.detail,
        firstDetectedAt: null,
        href: definition.href,
        kind: definition.kind,
        label: definition.label,
        level: "level_1_nudge",
        patientResponseLabel: null,
        portalEscalationEligible: false,
        viewedAt: null,
      });
    }
  }

  if (!items.length && raw.risk === "red") {
    items.push({
      daysActive: 1,
      detail: "The patient's overall risk status has escalated and needs review.",
      firstDetectedAt: null,
      href: "/health?metric=blood_pressure",
      kind: "general",
      label: "Clinical risk escalated",
      level: "level_3_escalate",
      patientResponseLabel: null,
      portalEscalationEligible: true,
      viewedAt: null,
    });
  }

  return items;
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
    worseningItems: buildPortalPatientWorseningItems({
      activeAlerts: raw.activeAlerts ?? [],
      flags: raw.flags ?? [],
      patientId: raw._id.toHexString(),
      risk,
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
  const activeAlertsByPatientId = new Map<string, PatientWorseningTrendAlert[]>();

  await Promise.all(
    raws.map(async (raw) => {
      const alerts = await getActivePatientWorseningTrendAlerts(db, {
        patientId: raw._id,
      });
      activeAlertsByPatientId.set(raw._id.toHexString(), alerts);
    }),
  );

  return raws.map((raw) =>
    mapPortalPatientListItem({
      ...raw,
      activeAlerts: activeAlertsByPatientId.get(raw._id.toHexString()) ?? [],
    }),
  );
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
