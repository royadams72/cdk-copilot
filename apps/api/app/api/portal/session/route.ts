import { NextRequest } from "next/server";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { COLLECTIONS } from "@ckd/core/server";
import type { Db } from "mongodb";
import { ObjectId } from "mongodb";

type UserStaffDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
};

type PortalReferenceDoc = {
  _id?: ObjectId;
  code?: string;
  facilityId?: string;
  name?: string;
  slug?: string;
};

function formatActorName(parts: Array<string | null | undefined>) {
  const value = parts
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return value || null;
}

function formatStaffDisplayName(doc: UserStaffDoc) {
  return (
    doc.displayName?.trim() ||
    formatActorName([doc.title, doc.firstName, doc.lastName]) ||
    formatActorName([doc.firstName, doc.lastName]) ||
    null
  );
}

function candidateReferenceKeys(doc: PortalReferenceDoc) {
  return [
    doc._id?.toHexString(),
    doc.code,
    doc.slug,
    doc.facilityId,
  ].filter((value): value is string => Boolean(value?.trim()));
}

async function resolvePortalOptions(args: {
  collectionName: string;
  db: Db;
  ids: string[];
  orgId: string | null | undefined;
}) {
  const ids = args.ids.filter((value) => value.trim());
  if (!args.orgId) {
    return ids.map((id) => ({ id, label: id }));
  }

  const docs = await args.db
    .collection<PortalReferenceDoc>(args.collectionName)
    .find(
      { orgId: args.orgId },
      {
        projection: {
          _id: 1,
          code: 1,
          facilityId: 1,
          name: 1,
          slug: 1,
        },
      },
    )
    .toArray();

  if (!ids.length) {
    return docs
      .map((doc) => ({
        id:
          doc.code?.trim() ||
          doc.slug?.trim() ||
          doc.facilityId?.trim() ||
          doc._id?.toHexString() ||
          "",
        label: doc.name?.trim() || "",
      }))
      .filter((item) => item.id && item.label);
  }

  const labelById = new Map<string, string>();
  for (const doc of docs) {
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

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req);
    const db = await getDb();
    const staffDoc = await db.collection<UserStaffDoc>(COLLECTIONS.UsersStaff).findOne(
      { principalId: user.principalId },
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
    );
    const displayName = staffDoc ? formatStaffDisplayName(staffDoc) : null;
    const [careTeams, facilities] = await Promise.all([
      resolvePortalOptions({
        collectionName: COLLECTIONS.CareTeams,
        db,
        ids: user.careTeamIds ?? [],
        orgId: user.orgId,
      }),
      resolvePortalOptions({
        collectionName: COLLECTIONS.Facilities,
        db,
        ids: user.facilityIds ?? [],
        orgId: user.orgId,
      }),
    ]);

    return ok({
      user: {
        allowedPatientIds: user.allowedPatientIds ?? [],
        careTeamIds: user.careTeamIds ?? [],
        careTeams,
        displayName,
        facilities,
        facilityIds: user.facilityIds ?? [],
        orgId: user.orgId ?? null,
        principalId: user.principalId,
        role: user.role,
        scopes: user.scopes,
      },
    });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 401;
    const message =
      error instanceof Error ? error.message : "Unable to validate portal session";
    return bad(message, { code: "portal_session_invalid" }, status);
  }
}
