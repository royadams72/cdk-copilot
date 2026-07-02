import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

import type { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { COLLECTIONS } from "@ckd/core/server";

export type PortalSessionOption = {
  id: string;
  label: string;
};

export type PortalSessionCareTeamOption = PortalSessionOption & {
  facilityId: string | null;
};

type PortalReferenceDoc = {
  _id?: ObjectId;
  code?: string;
  facilityId?: string;
  name?: string;
  orgId?: string;
  slug?: string;
};

function candidateReferenceKeys(doc: PortalReferenceDoc) {
  return [
    doc._id?.toHexString(),
    doc.code,
    doc.slug,
    doc.facilityId,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function buildOptionLabel(doc: PortalReferenceDoc, fallback: string) {
  return doc.name?.trim() || fallback;
}

async function loadOrgReferenceDocs(args: {
  collectionName: string;
  db: Db;
  orgId: string | null | undefined;
}) {
  if (!args.orgId) {
    return [];
  }

  return args.db
    .collection<PortalReferenceDoc>(args.collectionName)
    .find(
      { orgId: args.orgId },
      {
        projection: {
          _id: 1,
          code: 1,
          facilityId: 1,
          name: 1,
          orgId: 1,
          slug: 1,
        },
      },
    )
    .toArray();
}

function mapScopedCareTeams(args: {
  docs: PortalReferenceDoc[];
  ids: string[];
}): PortalSessionCareTeamOption[] {
  if (!args.ids.length) {
    return [];
  }

  const scoped = new Map<string, PortalSessionCareTeamOption>();
  for (const doc of args.docs) {
    const facilityId = doc.facilityId?.trim() || null;
    const keys = candidateReferenceKeys(doc);
    for (const key of keys) {
      if (!args.ids.includes(key) || scoped.has(key)) {
        continue;
      }
      scoped.set(key, {
        facilityId,
        id: key,
        label: buildOptionLabel(doc, key),
      });
    }
  }

  return args.ids.map((id) => scoped.get(id) ?? {
    facilityId: null,
    id,
    label: id,
  });
}

function mapScopedFacilities(args: {
  careTeams: PortalSessionCareTeamOption[];
  docs: PortalReferenceDoc[];
}): PortalSessionOption[] {
  const ids = [
    ...new Set(
      args.careTeams
        .map((team) => team.facilityId)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  if (!ids.length) {
    return [];
  }

  const labelById = new Map<string, string>();
  for (const doc of args.docs) {
    const label = doc.name?.trim();
    if (!label) continue;
    for (const key of candidateReferenceKeys(doc)) {
      labelById.set(key, label);
    }
  }

  return ids.map((id) => ({
    id,
    label: labelById.get(id) ?? id,
  }));
}

export async function loadPortalStaffScope(db: Db, user: SessionUser) {
  const [careTeamDocs, facilityDocs] = await Promise.all([
    loadOrgReferenceDocs({
      collectionName: COLLECTIONS.CareTeams,
      db,
      orgId: user.orgId,
    }),
    loadOrgReferenceDocs({
      collectionName: COLLECTIONS.Facilities,
      db,
      orgId: user.orgId,
    }),
  ]);

  const careTeams = mapScopedCareTeams({
    docs: careTeamDocs,
    ids: user.careTeamIds ?? [],
  });
  const facilities = mapScopedFacilities({
    careTeams,
    docs: facilityDocs,
  });

  return {
    careTeamIds: careTeams.map((team) => team.id),
    careTeams,
    facilities,
    facilityIds: facilities.map((facility) => facility.id),
  };
}

export async function assertPortalCareTeamFacilityAccess(args: {
  careTeamId: string;
  caller: SessionUser;
  db: Db;
  facilityId: string;
}) {
  const scope = await loadPortalStaffScope(args.db, args.caller);
  const careTeam = scope.careTeams.find((item) => item.id === args.careTeamId);

  if (!careTeam) {
    throw Object.assign(
      new Error("Selected care team is not available to this staff account"),
      { status: 403 },
    );
  }

  if (!careTeam.facilityId || careTeam.facilityId !== args.facilityId) {
    throw Object.assign(
      new Error("Selected facility is not available for the chosen care team"),
      { status: 403 },
    );
  }

  return {
    careTeam,
    scope,
  };
}
