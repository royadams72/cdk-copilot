export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { ObjectId, type Db } from "mongodb";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import {
  isCarePlanReviewDue,
  type CarePlanMongoDoc,
} from "@/apps/api/lib/care-plans/shared";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { toIsoDate } from "@/apps/api/lib/format/date";
import { bad, ok } from "@/apps/api/lib/http/responses";
import type { PortalPatientCarePlanData } from "@/apps/api/lib/portal/patient-shared";
import {
  buildPortalPatientDetailPipeline,
  buildPortalPatientAccessMatch,
  mapPortalPatientDetail,
  type RawPortalPatientDetailDoc,
} from "@/apps/api/lib/portal/patients";
import { COLLECTIONS } from "@ckd/core/server";

type UserPiiActorDoc = {
  firstName?: string;
  lastName?: string;
  principalId: string;
};

type UserStaffActorDoc = {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  principalId: string;
  title?: string;
};

type UserAccountActorDoc = {
  email?: string;
  principalId: string;
};

function statusWeight(status: CarePlanMongoDoc["status"]) {
  switch (status) {
    case "active":
      return 0;
    case "draft":
      return 1;
    case "completed":
      return 2;
    case "archived":
      return 3;
    default:
      return 9;
  }
}

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
    formatActorName([doc.firstName, doc.lastName])
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

async function loadActorNames(db: Db, actorPrincipalIds: string[]) {
  const [actorStaffDocs, actorPiiDocs, actorAccountDocs] = await Promise.all([
    actorPrincipalIds.length === 0
      ? Promise.resolve([])
      : db
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
    actorPrincipalIds.length === 0
      ? Promise.resolve([])
      : db
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
    actorPrincipalIds.length === 0
      ? Promise.resolve([])
      : db
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
    if (!actorNames.has(doc.principalId)) {
      const fallback =
        prettifyActorToken(doc.principalId) ?? prettifyActorToken(doc.email);
      if (fallback) actorNames.set(doc.principalId, fallback);
    }
  }

  return actorNames;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ patientId: string }> },
) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const { patientId } = await context.params;
    if (!ObjectId.isValid(patientId)) {
      return bad("Invalid patient id", { code: "invalid_patient_id" }, 400);
    }

    const db = await getDb();
    const patientObjectId = new ObjectId(patientId);
    const patient = await db
      .collection(COLLECTIONS.Patients)
      .aggregate<RawPortalPatientDetailDoc>(
        buildPortalPatientDetailPipeline({
          ...buildPortalPatientAccessMatch(caller),
          _id: patientObjectId,
        }),
      )
      .next();

    if (!patient) {
      return bad("Patient not found", { code: "patient_not_found" }, 404);
    }

    const carePlans = await db
      .collection<CarePlanMongoDoc>(COLLECTIONS.CarePlans)
      .find(
        { patientId: patientObjectId },
        {
          projection: {
            _id: 1,
            activatedAt: 1,
            completedAt: 1,
            createdAt: 1,
            goals: 1,
            notes: 1,
            reviewLabel: 1,
            reviewedAt: 1,
            activity: 1,
            sources: 1,
            status: 1,
            tasks: 1,
            title: 1,
            updatedAt: 1,
          },
        },
      )
      .toArray();

    const reviewerPrincipalIds = Array.from(
      new Set(
        carePlans.flatMap((plan) =>
          (plan.activity ?? [])
            .filter(
              (event) =>
                event.type === "reviewed" || event.type === "patient_reviewed",
            )
            .map((event) => event.by),
        ),
      ),
    );
    const actorNames = await loadActorNames(db, reviewerPrincipalIds);

    const rows = carePlans
      .slice()
      .sort((left, right) => {
        const byStatus = statusWeight(left.status) - statusWeight(right.status);
        if (byStatus !== 0) return byStatus;
        return right.updatedAt.getTime() - left.updatedAt.getTime();
      })
      .map((plan) => {
        const latestReviewActivity = (plan.activity ?? [])
          .filter(
            (event) =>
              event.type === "reviewed" || event.type === "patient_reviewed",
          )
          .sort((left, right) => right.at.getTime() - left.at.getTime())[0];

        return {
          activatedAt: toIsoDate(plan.activatedAt),
          completedAt: toIsoDate(plan.completedAt),
          goalsCount: plan.goals?.length ?? 0,
          id: plan._id.toHexString(),
          notes: plan.notes?.trim() || null,
          openTasksCount:
            plan.tasks?.filter((task) => task.status === "open").length ?? 0,
          reviewedAt: toIsoDate(latestReviewActivity?.at),
          reviewedBy: latestReviewActivity
            ? actorNames.get(latestReviewActivity.by) ?? latestReviewActivity.by
            : null,
          sources: plan.sources ?? [],
          status: plan.status,
          tasksCount: plan.tasks?.length ?? 0,
          title: plan.title,
          updatedAt: plan.updatedAt.toISOString(),
        };
      });

    const mappedPatient = mapPortalPatientDetail(patient);
    const reviewDueCount = carePlans.filter(isCarePlanReviewDue).length;

    const data: PortalPatientCarePlanData = {
      headline: `Care Plans ${mappedPatient.name}`,
      patient: mappedPatient,
      rows,
      summary: {
        activeCount: carePlans.filter((plan) => plan.status === "active").length,
        completedCount: carePlans.filter((plan) => plan.status === "completed")
          .length,
        draftCount: carePlans.filter((plan) => plan.status === "draft").length,
        reviewDueCount,
        totalCount: carePlans.length,
      },
    };

    return ok(data);
  } catch (error: any) {
    return bad(
      error?.message || "Unable to load care plans",
      undefined,
      error?.status || 500,
    );
  }
}
