export const runtime = "nodejs";

import { randomBytes } from "crypto";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import { assertPortalCareTeamFacilityAccess } from "@/apps/api/lib/portal/staffScope";
import { queueCareTeamConsent } from "@/apps/api/lib/utils/patientConsents";
import { COLLECTIONS } from "@ckd/core/server";

const Body = z.object({
  careTeamId: z.string().trim().min(1, "Select a care team"),
  dateOfBirth: z
    .string()
    .trim()
    .min(1, "Enter date of birth")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), {
      message: "Enter a valid date of birth",
    }),
  email: z.email("Enter a valid email address").transform((value) => value.toLowerCase()),
  facilityId: z.string().trim().min(1, "Select a facility"),
  firstName: z.string().trim().min(1, "Enter first name"),
  lastName: z.string().trim().min(1, "Enter last name"),
  stage: z.enum(["1", "2", "3a", "3b", "4", "5"]).optional().nullable(),
});

type PatientDoc = {
  _id: ObjectId;
  assignments: unknown[];
  createdAt: Date;
  flags: string[];
  principalId: string;
  stage?: string;
  summary: Record<string, never>;
  updatedAt: Date;
};

type UserPiiDoc = {
  createdAt: Date;
  createdBy: string;
  dateOfBirth: Date;
  email: string;
  firstName: string;
  lastName: string;
  notificationPrefs: { email: true; push: true; sms: false };
  onboardingCompleted: false;
  onboardingSteps: [];
  orgId?: string;
  patientId: ObjectId;
  principalId: string;
  pseudonymId: string;
  status: "active";
  updatedAt: Date;
  updatedBy: string;
};

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);

    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad(
        parsed.error.issues[0]?.message ?? "Invalid patient details",
        { code: "invalid_patient_details" },
        400,
      );
    }

    const { careTeamId, dateOfBirth, email, facilityId, firstName, lastName, stage } =
      parsed.data;

    if (!caller.orgId) {
      return bad("Staff organisation context missing", undefined, 400);
    }

    const db = await getDb();
    await assertPortalCareTeamFacilityAccess({
      careTeamId,
      caller,
      db,
      facilityId,
    });
    const usersPii = db.collection<UserPiiDoc>(COLLECTIONS.UsersPII);
    const patients = db.collection<PatientDoc>(COLLECTIONS.Patients);

    const existingPii = await usersPii.findOne(
      { email },
      {
        collation: { locale: "en", strength: 2 },
        projection: { _id: 1, patientId: 1 },
      },
    );

    if (existingPii) {
      return bad("A patient with this email already exists", { code: "patient_exists" }, 409);
    }

    const now = new Date();
    const patientId = new ObjectId();
    const principalId = `pr_${randomBytes(12).toString("hex")}`;
    const pseudonymId = `ps_${randomBytes(12).toString("hex")}`;

    await patients.insertOne({
      _id: patientId,
      assignments: [],
      createdAt: now,
      flags: [],
      principalId,
      ...(stage ? { stage } : {}),
      summary: {},
      updatedAt: now,
    });

    await usersPii.insertOne({
      createdAt: now,
      createdBy: caller.principalId,
      dateOfBirth: new Date(dateOfBirth),
      email,
      firstName,
      lastName,
      notificationPrefs: { email: true, push: true, sms: false },
      onboardingCompleted: false,
      onboardingSteps: [],
      orgId: caller.orgId,
      patientId,
      principalId,
      pseudonymId,
      status: "active",
      updatedAt: now,
      updatedBy: caller.principalId,
    });

    const consent = await queueCareTeamConsent(db, {
      actorPrincipalId: caller.principalId,
      careTeamId,
      clinicianPrincipalId: caller.principalId,
      facilityId,
      orgId: caller.orgId,
      patientId,
      patientPrincipalId: principalId,
    });

    return ok({
      assignmentId: consent.assignmentId,
      consentId: consent.consentId,
      patient: {
        email,
        id: patientId.toHexString(),
        name: `${firstName} ${lastName}`.trim(),
        principalId,
        stage: stage ?? null,
      },
    });
  } catch (error: any) {
    return bad(error?.message || "Unable to add patient", undefined, error?.status || 500);
  }
}
