import { z } from "zod";
import { Db, ObjectId } from "mongodb";

import { SessionUser } from "@/apps/api/lib/auth/auth_requireUser";
import { assertPortalCareTeamFacilityAccess } from "@/apps/api/lib/portal/staffScope";
import { COLLECTIONS } from "@ckd/core/server";
import {
  PatientInviteDurationMonths,
  PatientInviteNhsNumber,
} from "@ckd/core";

export const PortalInviteIntakeRow = z.object({
  dateOfBirth: z.string().trim().min(1, "Enter date of birth"),
  durationMonths: PatientInviteDurationMonths,
  email: z.string().trim().min(1, "Enter email"),
  firstName: z.string().trim().min(1, "Enter first name"),
  lastName: z.string().trim().min(1, "Enter last name"),
  nhsNumber: z.string().trim().optional(),
});

export const PortalInviteBatchBody = z.object({
  careTeamId: z.string().trim().min(1, "Select a care team"),
  facilityId: z.string().trim().min(1, "Select a facility"),
  rows: z.array(PortalInviteIntakeRow).min(1).max(50),
});

export type PortalInviteBatchBody = z.infer<typeof PortalInviteBatchBody>;

export type ValidationIssueCode =
  | "missing_email"
  | "invalid_email"
  | "missing_first_name"
  | "missing_last_name"
  | "missing_date_of_birth"
  | "invalid_date_of_birth"
  | "missing_duration"
  | "invalid_duration"
  | "invalid_nhs_number"
  | "duplicate_email_in_batch"
  | "duplicate_patient_in_batch"
  | "patient_record_exists"
  | "patient_already_active"
  | "pending_invite_exists";

export type ValidationIssue = {
  code: ValidationIssueCode;
  message: string;
};

export type ValidatedInviteRow = {
  rowIndex: number;
  firstName: string;
  lastName: string;
  email: string;
  dateOfBirth: string;
  durationMonths: "3" | "6" | "12";
  nhsNumber: string | null;
  issues: ValidationIssue[];
  isValid: boolean;
};

type ExistingPiiDoc = {
  email: string;
  patientId: ObjectId;
};

type ExistingPatientDoc = {
  _id: ObjectId;
  assignments?: Array<{
    orgId?: string;
    status?: string;
  }>;
};

type ExistingInviteDoc = {
  email: string;
  status: string;
};

export type PortalInviteBatchValidationResult = {
  batch: {
    careTeamId: string;
    facilityId: string;
    rowCount: number;
    validRows: number;
    invalidRows: number;
  };
  rows: ValidatedInviteRow[];
};

export type PortalPatientInviteStatus =
  | "pending_review"
  | "invited"
  | "activated"
  | "expired"
  | "revoked"
  | "cancelled";

export type PortalPatientInviteDoc = {
  _id: ObjectId;
  activatedAt?: Date | null;
  activationCodeMasked: string;
  activationExpiresAt: Date;
  careTeamId: string;
  createdAt: Date;
  createdBy: string;
  dateOfBirth: Date;
  durationMonths: "3" | "6" | "12";
  email: string;
  facilityId: string;
  firstName: string;
  invitedAt?: Date | null;
  lastName: string;
  nhsNumber?: string | null;
  orgId: string;
  patientId: ObjectId;
  principalId: string;
  status: PortalPatientInviteStatus;
  updatedAt: Date;
  updatedBy: string;
 };

export async function syncExpiredPatientInvites(db: Db) {
  const now = new Date();

  await db.collection<PortalPatientInviteDoc>(COLLECTIONS.PatientInvites).updateMany(
    {
      activationExpiresAt: { $lte: now },
      status: { $in: ["pending_review", "invited"] },
    },
    {
      $set: {
        status: "expired",
        updatedAt: now,
      },
    },
  );
}

export function normalizeInviteEmail(value: string) {
  return value.trim().toLowerCase();
}

function normalizeText(value: string) {
  return value.trim();
}

function isValidEmail(value: string) {
  return z.email().safeParse(value).success;
}

function isValidIsoDate(value: string) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeDateOnly(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function isValidNhsNumber(value: string) {
  const digits = value.replace(/\s+/g, "");
  if (!PatientInviteNhsNumber.safeParse(digits).success) {
    return false;
  }

  const numbers = digits.split("").map(Number);
  const checksum =
    numbers
      .slice(0, 9)
      .reduce((sum, digit, index) => sum + digit * (10 - index), 0) % 11;
  const checkDigit = 11 - checksum;
  const expected = checkDigit === 11 ? 0 : checkDigit;

  return checkDigit !== 10 && expected === numbers[9];
}

function buildPatientDuplicateKey(row: {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
}) {
  return [
    normalizeText(row.firstName).toLowerCase(),
    normalizeText(row.lastName).toLowerCase(),
    normalizeDateOnly(row.dateOfBirth),
  ].join("|");
}

export async function validatePortalInviteBatch(args: {
  body: PortalInviteBatchBody;
  caller: SessionUser;
  db: Db;
}): Promise<PortalInviteBatchValidationResult> {
  const { body, caller, db } = args;
  const { careTeamId, facilityId, rows } = body;

  await assertPortalCareTeamFacilityAccess({
    careTeamId,
    caller,
    db,
    facilityId,
  });

  const validatedRows: ValidatedInviteRow[] = rows.map((row, rowIndex) => {
    const issues: ValidationIssue[] = [];
    const firstName = normalizeText(row.firstName);
    const lastName = normalizeText(row.lastName);
    const email = normalizeInviteEmail(row.email);
    const dateOfBirth = normalizeText(row.dateOfBirth);
    const nhsNumber = normalizeText(row.nhsNumber ?? "").replace(/\s+/g, "");

    if (!firstName) {
      issues.push({ code: "missing_first_name", message: "First name is required." });
    }
    if (!lastName) {
      issues.push({ code: "missing_last_name", message: "Last name is required." });
    }
    if (!email) {
      issues.push({ code: "missing_email", message: "Email is required." });
    } else if (!isValidEmail(email)) {
      issues.push({ code: "invalid_email", message: "Email format is invalid." });
    }
    if (!dateOfBirth) {
      issues.push({
        code: "missing_date_of_birth",
        message: "Date of birth is required.",
      });
    } else if (!isValidIsoDate(dateOfBirth)) {
      issues.push({
        code: "invalid_date_of_birth",
        message: "Date of birth is invalid.",
      });
    }
    if (!row.durationMonths) {
      issues.push({
        code: "missing_duration",
        message: "Access duration is required.",
      });
    } else if (!PatientInviteDurationMonths.safeParse(row.durationMonths).success) {
      issues.push({
        code: "invalid_duration",
        message: "Access duration must be 3, 6, or 12 months.",
      });
    }
    if (nhsNumber && !isValidNhsNumber(nhsNumber)) {
      issues.push({
        code: "invalid_nhs_number",
        message: "NHS number is invalid.",
      });
    }

    return {
      rowIndex,
      firstName,
      lastName,
      email,
      dateOfBirth: normalizeDateOnly(dateOfBirth),
      durationMonths: row.durationMonths,
      nhsNumber: nhsNumber || null,
      issues,
      isValid: issues.length === 0,
    };
  });

  const emailCounts = new Map<string, number>();
  const patientKeyCounts = new Map<string, number>();

  for (const row of validatedRows) {
    if (row.email) {
      emailCounts.set(row.email, (emailCounts.get(row.email) ?? 0) + 1);
    }
    const patientKey = buildPatientDuplicateKey(row);
    if (patientKey && !patientKey.endsWith("|")) {
      patientKeyCounts.set(patientKey, (patientKeyCounts.get(patientKey) ?? 0) + 1);
    }
  }

  for (const row of validatedRows) {
    if (row.email && (emailCounts.get(row.email) ?? 0) > 1) {
      row.issues.push({
        code: "duplicate_email_in_batch",
        message: "This email appears more than once in the batch.",
      });
    }
    const patientKey = buildPatientDuplicateKey(row);
    if (
      patientKey &&
      !patientKey.endsWith("|") &&
      (patientKeyCounts.get(patientKey) ?? 0) > 1
    ) {
      row.issues.push({
        code: "duplicate_patient_in_batch",
        message: "This patient appears more than once in the batch.",
      });
    }
    row.isValid = row.issues.length === 0;
  }

  const candidateEmails = [...new Set(validatedRows.map((row) => row.email).filter(Boolean))];

  const existingPii = candidateEmails.length
    ? await db
        .collection<ExistingPiiDoc>(COLLECTIONS.UsersPII)
        .find(
          { email: { $in: candidateEmails } },
          {
            collation: { locale: "en", strength: 2 },
            projection: { _id: 0, email: 1, patientId: 1 },
          },
        )
        .toArray()
    : [];

  const existingPiiByEmail = new Map(
    existingPii.map((item) => [normalizeInviteEmail(item.email), item]),
  );

  const existingPatients = existingPii.length
    ? await db
        .collection<ExistingPatientDoc>(COLLECTIONS.Patients)
        .find(
          { _id: { $in: existingPii.map((item) => item.patientId) } },
          { projection: { _id: 1, assignments: 1 } },
        )
        .toArray()
    : [];

  const existingPatientsById = new Map(
    existingPatients.map((item) => [item._id.toHexString(), item]),
  );

  const existingInvites = candidateEmails.length
    ? await db
        .collection<ExistingInviteDoc>(COLLECTIONS.PatientInvites)
        .find(
          {
            email: { $in: candidateEmails },
            status: { $in: ["pending_review", "invited"] },
          },
          { projection: { _id: 0, email: 1, status: 1 } },
        )
        .toArray()
    : [];

  const existingInviteByEmail = new Map(
    existingInvites.map((item) => [normalizeInviteEmail(item.email), item]),
  );

  for (const row of validatedRows) {
    const piiDoc = existingPiiByEmail.get(row.email);
    if (piiDoc) {
      row.issues.push({
        code: "patient_record_exists",
        message: "A patient record with this email already exists.",
      });

      const patientDoc = existingPatientsById.get(piiDoc.patientId.toHexString());
      const isActive = patientDoc?.assignments?.some(
        (assignment) =>
          assignment.orgId === caller.orgId &&
          (assignment.status === "active" || assignment.status === "pending"),
      );
      if (isActive) {
        row.issues.push({
          code: "patient_already_active",
          message: "This patient is already active or pending in the service.",
        });
      }
    }

    if (existingInviteByEmail.has(row.email)) {
      row.issues.push({
        code: "pending_invite_exists",
        message: "A pending invite already exists for this email.",
      });
    }

    row.isValid = row.issues.length === 0;
  }

  const validRows = validatedRows.filter((row) => row.isValid).length;
  const invalidRows = validatedRows.length - validRows;

  return {
    batch: {
      careTeamId,
      facilityId,
      rowCount: validatedRows.length,
      validRows,
      invalidRows,
    },
    rows: validatedRows,
  };
}
