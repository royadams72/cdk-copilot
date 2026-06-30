import { ObjectId, type Db } from "mongodb";

import {
  buildPortalWorseningHref,
  mapTrendKeyToPortalKind,
  type PortalWorseningSnapshotKey,
  type PortalPatientWorseningItem,
} from "@/apps/api/lib/portal/patient-shared";
import { COLLECTIONS, type TWorseningTrendSnapshotDoc } from "@ckd/core/server";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type UserStaffActorDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
};

type UserPiiActorDoc = {
  firstName?: string;
  lastName?: string;
  principalId: string;
};

type UserAccountActorDoc = {
  email?: string;
  principalId: string;
};

export type PortalWorseningSnapshotAlert = {
  body: string;
  checkInResponseCode?: string | null;
  checkInResponseLabel?: string | null;
  checkInSubmittedAt?: string | null;
  detail: string | null;
  detectedAt: string;
  firstDetectedAt: string;
  id: string;
  key: PortalWorseningSnapshotKey;
  lastDetectedAt: string;
  level: TWorseningTrendSnapshotDoc["level"];
  portalEscalationEligible: boolean;
  repeatAtLocalTime?: string | null;
  repeatUntil?: string | null;
  screen: string;
  title: string;
  viewedAt?: string | null;
};

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function formatStaffDisplayName(doc: UserStaffActorDoc) {
  return (
    doc.displayName?.trim() ||
    formatActorName([doc.title, doc.firstName, doc.lastName]) ||
    formatActorName([doc.firstName, doc.lastName]) ||
    null
  );
}

function prettifyActorToken(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutPrefix = trimmed.replace(/^(pr|acc)_/i, "");
  const emailLocalPart = withoutPrefix.includes("@")
    ? withoutPrefix.split("@")[0]
    : withoutPrefix;
  const prettified = emailLocalPart
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!prettified) return null;

  return prettified
    .split(" ")
    .map((part) =>
      /^[a-z]+$/i.test(part)
        ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
        : part,
    )
    .join(" ");
}

function toPortalWorseningItem(
  patientId: string,
  doc: TWorseningTrendSnapshotDoc,
  reviewerName: string | null = null,
): PortalPatientWorseningItem {
  const firstDetectedAt =
    doc.firstDetectedAt instanceof Date ? doc.firstDetectedAt : null;
  const daysActive =
    firstDetectedAt && !Number.isNaN(firstDetectedAt.getTime())
      ? Math.max(
          1,
          Math.floor((Date.now() - firstDetectedAt.getTime()) / MS_PER_DAY) + 1,
        )
      : 1;

  return {
    daysActive,
    detail: doc.detail ?? doc.body,
    episodeId: doc.episodeId,
    firstDetectedAt: doc.firstDetectedAt?.toISOString() ?? null,
    href:
      doc.href ??
      buildPortalWorseningHref(patientId, doc.key),
    kind: mapTrendKeyToPortalKind(doc.key),
    label: doc.title,
    level: doc.level,
    patientResponseLabel: doc.checkInResponseLabel ?? null,
    portalEscalationEligible: doc.portalEscalationEligible,
    reviewedAt: doc.reviewedAt?.toISOString() ?? null,
    reviewedByName: reviewerName,
    reviewedByPrincipalId: doc.reviewedByPrincipalId ?? null,
    reviewedByRole: doc.reviewedByRole ?? null,
    viewedAt: doc.viewedAt?.toISOString() ?? null,
  };
}

async function loadActorNames(
  db: Db,
  actorPrincipalIds: string[],
) {
  if (!actorPrincipalIds.length) {
    return new Map<string, string>();
  }

  const [actorStaffDocs, actorPiiDocs, actorAccountDocs] = await Promise.all([
    db
      .collection<UserStaffActorDoc>(COLLECTIONS.UsersStaff)
      .find(
        { principalId: { $in: actorPrincipalIds } },
        {
          projection: {
            _id: 0,
            displayName: 1,
            firstName: 1,
            lastName: 1,
            principalId: 1,
            title: 1,
          },
        },
      )
      .toArray(),
    db
      .collection<UserPiiActorDoc>(COLLECTIONS.UsersPII)
      .find(
        { principalId: { $in: actorPrincipalIds } },
        {
          projection: {
            _id: 0,
            firstName: 1,
            lastName: 1,
            principalId: 1,
          },
        },
      )
      .toArray(),
    db
      .collection<UserAccountActorDoc>(COLLECTIONS.UsersAccounts)
      .find(
        { principalId: { $in: actorPrincipalIds } },
        {
          projection: {
            _id: 0,
            email: 1,
            principalId: 1,
          },
        },
      )
      .toArray(),
  ]);

  const actorNames = new Map<string, string>();
  for (const doc of actorStaffDocs) {
    const name = formatStaffDisplayName(doc);
    if (name) actorNames.set(doc.principalId, name);
  }
  for (const doc of actorPiiDocs) {
    if (actorNames.has(doc.principalId)) continue;
    const name = formatActorName([doc.firstName, doc.lastName]);
    if (name) actorNames.set(doc.principalId, name);
  }
  for (const doc of actorAccountDocs) {
    if (actorNames.has(doc.principalId)) continue;
    const fallback =
      prettifyActorToken(doc.principalId) ?? prettifyActorToken(doc.email);
    if (fallback) actorNames.set(doc.principalId, fallback);
  }

  return actorNames;
}

export async function syncPatientWorseningTrendSnapshots(
  db: Db,
  input: {
    alerts: PortalWorseningSnapshotAlert[];
    patientId: ObjectId;
  },
) {
  const collection = db.collection<TWorseningTrendSnapshotDoc>(
    COLLECTIONS.WorseningTrendSnapshots,
  );
  const now = new Date();
  const activeAlerts = input.alerts.filter((alert) => alert.portalEscalationEligible);
  const activeEpisodeIds = new Set(activeAlerts.map((alert) => alert.id));

  console.log("[worsening:snapshots] syncing", {
    activeAlerts: activeAlerts.map((alert) => ({
      id: alert.id,
      key: alert.key,
      level: alert.level,
      title: alert.title,
    })),
    patientId: input.patientId.toHexString(),
  });

  await Promise.all(
    activeAlerts.map((alert) =>
      collection
        .updateOne(
          { episodeId: alert.id, patientId: input.patientId },
          {
            $set: {
              body: alert.body,
              checkInResponseCode: alert.checkInResponseCode ?? null,
              checkInResponseLabel: alert.checkInResponseLabel ?? null,
              checkInSubmittedAt: alert.checkInSubmittedAt
                ? new Date(alert.checkInSubmittedAt)
                : null,
              detail: alert.detail ?? null,
              firstDetectedAt: new Date(alert.firstDetectedAt),
              href: buildPortalWorseningHref(
                input.patientId.toHexString(),
                alert.key,
              ),
              key: alert.key,
              lastDetectedAt: new Date(alert.lastDetectedAt),
              level: alert.level,
              portalEscalationEligible: alert.portalEscalationEligible,
              resolvedAt: null,
              screen: alert.screen,
              status: "active",
              title: alert.title,
              updatedAt: now,
              viewedAt: alert.viewedAt ? new Date(alert.viewedAt) : null,
            },
            $setOnInsert: {
              patientId: input.patientId,
              reviewedAt: null,
              reviewedByPrincipalId: null,
              reviewedByRole: null,
            },
          },
          { upsert: true },
        )
        .then((result) => {
          console.log("[worsening:snapshots] upsert result", {
            id: alert.id,
            key: alert.key,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId ?? null,
          });
          return result;
        }),
    ),
  );

  const resolveResult = await collection.updateMany(
    {
      patientId: input.patientId,
      reviewedAt: null,
      status: "active",
      ...(activeEpisodeIds.size
        ? { episodeId: { $nin: Array.from(activeEpisodeIds) } }
        : {}),
    },
    {
      $set: {
        resolvedAt: now,
        status: "resolved",
        updatedAt: now,
      },
    },
  );

  console.log("[worsening:snapshots] resolve result", {
    matchedCount: resolveResult.matchedCount,
    modifiedCount: resolveResult.modifiedCount,
    patientId: input.patientId.toHexString(),
    retainedEpisodeIds: Array.from(activeEpisodeIds),
  });
}

export async function loadActivePortalWorseningItemsByPatientId(
  db: Db,
  patientIds: ObjectId[],
) {
  if (!patientIds.length) {
    return new Map<string, PortalPatientWorseningItem[]>();
  }

  const docs = await db
    .collection<TWorseningTrendSnapshotDoc>(COLLECTIONS.WorseningTrendSnapshots)
    .find({
      patientId: { $in: patientIds },
      reviewedAt: null,
      status: "active",
    })
    .sort({ updatedAt: -1 })
    .toArray();

  const byPatientId = new Map<string, PortalPatientWorseningItem[]>();
  for (const doc of docs) {
    const patientId =
      doc.patientId instanceof ObjectId
        ? doc.patientId.toHexString()
        : String(doc.patientId);
    const items = byPatientId.get(patientId) ?? [];
    items.push(toPortalWorseningItem(patientId, doc));
    byPatientId.set(patientId, items);
  }

  return byPatientId;
}

export async function loadReviewedPortalWorseningItems(
  db: Db,
  patientId: ObjectId,
) {
  const docs = await db
    .collection<TWorseningTrendSnapshotDoc>(COLLECTIONS.WorseningTrendSnapshots)
    .find({
      patientId,
      reviewedAt: { $ne: null },
    })
    .sort({ reviewedAt: -1, updatedAt: -1 })
    .toArray();

  const reviewerPrincipalIds = Array.from(
    new Set(
      docs
        .map((doc) => doc.reviewedByPrincipalId?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const actorNames = await loadActorNames(db, reviewerPrincipalIds);

  return docs.map((doc) =>
    toPortalWorseningItem(
      patientId.toHexString(),
      doc,
      doc.reviewedByPrincipalId ? actorNames.get(doc.reviewedByPrincipalId) ?? null : null,
    ),
  );
}

export async function markPortalWorseningSnapshotsReviewed(
  db: Db,
  input: {
    episodeIds?: string[];
    patientIds?: ObjectId[];
    reviewedByPrincipalId: string;
    reviewedByRole: string;
  },
) {
  const filter: Record<string, unknown> = {
    reviewedAt: null,
    status: "active",
  };

  if (input.episodeIds?.length) {
    filter.episodeId = { $in: input.episodeIds };
  }

  if (input.patientIds?.length) {
    filter.patientId = { $in: input.patientIds };
  }

  if (!filter.episodeId && !filter.patientId) {
    return { modifiedCount: 0 };
  }

  const result = await db
    .collection<TWorseningTrendSnapshotDoc>(COLLECTIONS.WorseningTrendSnapshots)
    .updateMany(filter, {
      $set: {
        reviewedAt: new Date(),
        reviewedByPrincipalId: input.reviewedByPrincipalId,
        reviewedByRole: input.reviewedByRole,
      },
    });

  return { modifiedCount: result.modifiedCount };
}
