export const runtime = "nodejs";

import { createHash, randomBytes, timingSafeEqual } from "crypto";

import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";

import { COLLECTION_TYPE } from "@/apps/api/lib/auth/collectionType";
import { AuthTokenDoc, b64url, setToken } from "@/apps/api/lib/auth/auth_token";
import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { enforceRateLimit, getClientIp } from "@/apps/api/lib/auth/rateLimit";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ensurePatientTargetsSeeded } from "@/apps/api/lib/utils/targets";
import {
  DEFAULT_SCOPES,
  ROLES,
  TPatientAssignment,
  TPatientInvite,
} from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";

const Body = z.object({
  activationCode: z
    .string()
    .trim()
    .min(6, "Enter activation code")
    .max(32, "Enter activation code"),
  deviceId: z.string().trim().min(16).max(128),
});

type PatientDoc = {
  _id: ObjectId;
  assignments?: TPatientAssignment[];
  createdAt?: Date;
  flags?: string[];
  principalId?: string;
  summary?: Record<string, unknown>;
  updatedAt?: Date;
};

type PatientInviteDoc = Omit<
  TPatientInvite,
  | "_id"
  | "activatedAt"
  | "activationExpiresAt"
  | "createdAt"
  | "dateOfBirth"
  | "invitedAt"
  | "reviewedAt"
  | "updatedAt"
  | "patientId"
> & {
  _id: ObjectId;
  activatedAt?: Date | null;
  activationExpiresAt: Date;
  createdAt: Date;
  dateOfBirth: Date;
  invitedAt?: Date | null;
  patientId: ObjectId;
  reviewedAt?: Date | null;
  updatedAt: Date;
};

type UserPiiDoc = {
  _id?: ObjectId;
  createdAt?: Date;
  createdBy?: string;
  dateOfBirth?: Date;
  email?: string;
  emailVerifiedAt?: Date;
  firstName?: string;
  lastActiveAt?: Date;
  lastName?: string;
  notificationPrefs?: { email: boolean; push: boolean; sms: boolean };
  onboardingCompleted?: boolean;
  onboardingSteps?: string[];
  orgId?: string;
  patientId?: ObjectId;
  principalId?: string;
  pseudonymId?: string;
  status?: "active" | "inactive";
  updatedAt?: Date;
  updatedBy?: string;
};

type UserAccountDoc = {
  _id?: ObjectId;
  createdAt?: Date;
  createdBy?: string;
  email?: string;
  isActive?: boolean;
  orgId?: string;
  principalId?: string;
  role?: string;
  scopes?: string[];
  updatedAt?: Date;
  updatedBy?: string;
};

function normalizeActivationCode(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function hashActivationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function addMonths(from: Date, months: number) {
  const next = new Date(from);
  next.setMonth(next.getMonth() + months);
  return next;
}

function buildInitialAssignment(args: {
  careTeamId: string;
  endsAt: Date;
  facilityId: string;
  now: Date;
  orgId: string;
}) {
  const nowIso = args.now.toISOString();

  return {
    assignmentId: `asg_${new ObjectId().toHexString()}`,
    careTeamId: args.careTeamId,
    consentStatus: "accepted",
    createdAt: nowIso,
    endsAt: args.endsAt.toISOString(),
    facilityId: args.facilityId,
    orgId: args.orgId,
    startsAt: nowIso,
    status: "active",
    updatedAt: nowIso,
  } satisfies TPatientAssignment;
}

function selectInviteError(invite: PatientInviteDoc, now: Date) {
  if (invite.status === "activated") {
    return { message: "This activation code has already been used.", status: 409 };
  }

  const expiresAt =
    invite.activationExpiresAt instanceof Date
      ? invite.activationExpiresAt
      : new Date(invite.activationExpiresAt);
  if (Number.isNaN(expiresAt.getTime()) || expiresAt <= now) {
    return { message: "This activation code has expired.", status: 410 };
  }

  if (invite.status !== "invited") {
    return {
      message: "This activation code is not ready to use.",
      status: 409,
    };
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    await requireUser(req, DEFAULT_SCOPES, {
      allowBootstrap: true,
    });

    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid activation code", ok: false },
        { status: 400 },
      );
    }

    const activationCode = normalizeActivationCode(parsed.data.activationCode);
    const activationCodeHash = hashActivationCode(activationCode);
    const now = new Date();

    await enforceRateLimit([
      {
        bucket: "activate_code_ip",
        key: getClientIp(req),
        limit: 15,
        windowMs: 15 * 60 * 1000,
      },
      {
        bucket: "activate_code_hash",
        key: activationCodeHash,
        limit: 10,
        windowMs: 15 * 60 * 1000,
      },
    ]);

    const db = await getDb();
    const invites = db.collection<PatientInviteDoc>(COLLECTIONS.PatientInvites);
    const invite = await invites.findOne(
      { activationCodeHash },
      { sort: { createdAt: -1 } },
    );

    if (!invite) {
      return NextResponse.json(
        { error: "Invalid activation code", ok: false },
        { status: 400 },
      );
    }

    const storedMasked = Buffer.from(invite.activationCodeHash, "utf8");
    const presentedMasked = Buffer.from(activationCodeHash, "utf8");
    if (
      storedMasked.length !== presentedMasked.length ||
      !timingSafeEqual(storedMasked, presentedMasked)
    ) {
      return NextResponse.json(
        { error: "Invalid activation code", ok: false },
        { status: 400 },
      );
    }

    const inviteError = selectInviteError(invite, now);
    if (inviteError) {
      if (inviteError.status === 410 && invite.status !== "expired") {
        await invites.updateOne(
          { _id: invite._id },
          {
            $set: {
              status: "expired",
              updatedAt: now,
              updatedBy: invite.createdBy,
            },
          },
        );
      }

      return NextResponse.json(
        { error: inviteError.message, ok: false },
        { status: inviteError.status },
      );
    }

    const patientId =
      invite.patientId instanceof ObjectId
        ? invite.patientId
        : new ObjectId(invite.patientId);
    const orgId = invite.orgId ?? "org_demo";
    const durationMonths = Number(invite.durationMonths);
    const accessEndsAt = addMonths(now, durationMonths);

    const patients = db.collection<PatientDoc>(COLLECTIONS.Patients);
    const usersPii = db.collection<UserPiiDoc>(COLLECTIONS.UsersPII);
    const usersAccounts = db.collection<UserAccountDoc>(COLLECTIONS.UsersAccounts);
    const authTokens = db.collection<AuthTokenDoc>(COLLECTIONS.AuthTokens);

    const existingPatient = await patients.findOne(
      { _id: patientId },
      { projection: { _id: 1, assignments: 1 } },
    );

    const matchingAssignment = existingPatient?.assignments?.find(
      (assignment) =>
        assignment.orgId === orgId &&
        assignment.facilityId === invite.facilityId &&
        assignment.careTeamId === invite.careTeamId,
    );

    if (!existingPatient) {
      await patients.insertOne({
        _id: patientId,
        assignments: [
          buildInitialAssignment({
            careTeamId: invite.careTeamId,
            endsAt: accessEndsAt,
            facilityId: invite.facilityId,
            now,
            orgId,
          }),
        ],
        createdAt: now,
        flags: [],
        principalId: invite.principalId,
        summary: {
          membershipEndsAt: accessEndsAt.toISOString(),
          membershipStartedAt: now.toISOString(),
        },
        updatedAt: now,
      });
    } else if (matchingAssignment) {
      await patients.updateOne(
        {
          _id: patientId,
          "assignments.assignmentId": matchingAssignment.assignmentId,
        },
        {
          $set: {
            "assignments.$.consentStatus": "accepted",
            "assignments.$.endsAt": accessEndsAt.toISOString(),
            "assignments.$.startsAt": matchingAssignment.startsAt ?? now.toISOString(),
            "assignments.$.status": "active",
            "assignments.$.updatedAt": now.toISOString(),
            "summary.membershipEndsAt": accessEndsAt.toISOString(),
            "summary.membershipStartedAt":
              matchingAssignment.startsAt ?? now.toISOString(),
            principalId: invite.principalId,
            updatedAt: now,
          },
        },
      );
    } else {
      await patients.updateOne(
        { _id: patientId },
        {
          $push: {
            assignments: buildInitialAssignment({
              careTeamId: invite.careTeamId,
              endsAt: accessEndsAt,
              facilityId: invite.facilityId,
              now,
              orgId,
            }),
          },
          $set: {
            "summary.membershipEndsAt": accessEndsAt.toISOString(),
            "summary.membershipStartedAt": now.toISOString(),
            principalId: invite.principalId,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
            flags: [],
            summary: {},
          },
        },
        { upsert: true },
      );
    }

    await usersPii.updateOne(
      { email: invite.email },
      {
        $set: {
          dateOfBirth: new Date(invite.dateOfBirth),
          email: invite.email,
          emailVerifiedAt: now,
          firstName: invite.firstName,
          lastActiveAt: now,
          lastName: invite.lastName,
          notificationPrefs: { email: true, push: true, sms: false },
          onboardingCompleted: false,
          onboardingSteps: [],
          orgId,
          patientId,
          principalId: invite.principalId,
          status: "active",
          updatedAt: now,
          updatedBy: invite.createdBy,
        },
        $setOnInsert: {
          createdAt: now,
          createdBy: invite.createdBy,
          pseudonymId: `ps_${randomBytes(12).toString("hex")}`,
        },
      },
      {
        collation: { locale: "en", strength: 2 },
        upsert: true,
      },
    );

    await usersAccounts.updateOne(
      { principalId: invite.principalId },
      {
        $set: {
          email: invite.email,
          isActive: true,
          orgId,
          role: ROLES.Patient,
          scopes: [...DEFAULT_SCOPES],
          updatedAt: now,
          updatedBy: invite.createdBy,
        },
        $setOnInsert: {
          createdAt: now,
          createdBy: invite.createdBy,
          principalId: invite.principalId,
        },
      },
      { upsert: true },
    );

    await ensurePatientTargetsSeeded(db, {
      orgId,
      patientId,
      seedPrincipalId: invite.principalId,
    });

    await invites.updateOne(
      { _id: invite._id, status: "invited" },
      {
        $set: {
          activatedAt: now,
          status: "activated",
          updatedAt: now,
          updatedBy: invite.principalId,
        },
      },
    );

    await authTokens.updateMany(
      {
        type: COLLECTION_TYPE.OauthCode,
        email: invite.email,
        usedAt: null,
      },
      { $set: { usedAt: now } },
    );

    const { id, token, secretHash } = setToken();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    await authTokens.insertOne({
      _id: new ObjectId(),
      createdAt: now,
      deviceId: parsed.data.deviceId,
      email: invite.email,
      expiresAt,
      id: b64url(id),
      orgId,
      patientId,
      principalId: invite.principalId,
      redirectUri: process.env.REDIRECT_URI ?? null,
      role: ROLES.Patient,
      scopes: [...DEFAULT_SCOPES],
      secretHash: secretHash.toString("base64"),
      type: COLLECTION_TYPE.OauthCode,
      usedAt: null,
    });

    return NextResponse.json({
      activation: {
        accessEndsAt: accessEndsAt.toISOString(),
        patientId: patientId.toHexString(),
      },
      ok: true,
      token,
    });
  } catch (error: any) {
    if (error?.status === 429) {
      return NextResponse.json(
        { error: "Too many requests", ok: false },
        { status: 429 },
      );
    }

    console.error(error);
    return NextResponse.json(
      { error: error?.message ?? "Unable to activate code", ok: false },
      { status: error?.status || 400 },
    );
  }
}
