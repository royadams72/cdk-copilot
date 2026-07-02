export const runtime = "nodejs";

import { randomBytes, createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { Resend } from "resend";

import { requireUser } from "@/apps/api/lib/auth/auth_requireUser";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { bad, ok } from "@/apps/api/lib/http/responses";
import {
  PortalInviteBatchBody,
  validatePortalInviteBatch,
} from "@/apps/api/lib/portal/patientInvites";
import { TPatientInviteCreate } from "@ckd/core";
import { COLLECTIONS } from "@ckd/core/server";
import { ObjectId } from "mongodb";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || null;
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

function makePrincipalId() {
  return `pr_${new ObjectId().toHexString()}`;
}

function makeActivationCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

function hashActivationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function isLocalDev() {
  return process.env.NODE_ENV !== "production";
}

export async function POST(req: NextRequest) {
  try {
    const caller = await requireUser(req);
    if (caller.role === "patient") {
      return bad("Portal staff session required", { code: "portal_staff_required" }, 403);
    }

    const parsed = PortalInviteBatchBody.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return bad(
        parsed.error.issues[0]?.message ?? "Invalid intake batch",
        { code: "invalid_invite_batch" },
        400,
      );
    }

    const db = await getDb();
    const validation = await validatePortalInviteBatch({
      body: parsed.data,
      caller,
      db,
    });

    if (validation.batch.invalidRows > 0) {
      return bad(
        "One or more rows are no longer valid. Revalidate before creating invites.",
        {
          code: "invite_batch_requires_revalidation",
          data: validation,
        },
        409,
      );
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 7);
    const batchId = `invb_${new ObjectId().toHexString()}`;

    const inviteRows = validation.rows.map((row) => {
      const activationCode = makeActivationCode();
      return {
        activationCode,
        doc: {
        activationCodeHash: hashActivationCode(activationCode),
        activationCodeMasked: activationCode.slice(-4),
        activationExpiresAt: expiresAt.toISOString(),
        activatedAt: null,
        batchId,
        careTeamId: parsed.data.careTeamId,
        createdAt: now.toISOString(),
        createdBy: caller.principalId,
        dateOfBirth: new Date(row.dateOfBirth).toISOString(),
        durationMonths: row.durationMonths,
        email: row.email,
        facilityId: parsed.data.facilityId,
        firstName: row.firstName,
        invitedAt: null,
        lastName: row.lastName,
        nhsNumber: row.nhsNumber ?? undefined,
        orgId: caller.orgId ?? "org_demo",
        patientId: new ObjectId().toHexString(),
        principalId: makePrincipalId(),
        reviewNote: undefined,
        reviewedAt: null,
        reviewedBy: undefined,
        source: "portal_batch",
        status: "pending_review",
        updatedAt: now.toISOString(),
        updatedBy: caller.principalId,
        } satisfies TPatientInviteCreate,
      };
    });

    await db.collection(COLLECTIONS.PatientInvites).insertMany(
      inviteRows.map(({ doc }) => ({
        ...doc,
        activationExpiresAt: new Date(doc.activationExpiresAt),
        activatedAt: null,
        createdAt: new Date(doc.createdAt),
        dateOfBirth: new Date(doc.dateOfBirth),
        invitedAt: null,
        patientId: new ObjectId(doc.patientId),
        reviewedAt: doc.reviewedAt ? new Date(doc.reviewedAt) : null,
        updatedAt: new Date(doc.updatedAt),
      })),
    );

    const sentInviteIds: string[] = [];
    const failedDeliveries: Array<{ email: string; message: string }> = [];
    const devInvites: Array<{ email: string; activationCode: string }> = [];
    const includeDevInvites = isLocalDev();

    for (const { activationCode, doc } of inviteRows) {
      if (includeDevInvites) {
        devInvites.push({ activationCode, email: doc.email });
      }

      const emailHtml = `
        <p>You have been invited to join CKD Copilot.</p>
        <p>Download CKD Copilot from the App Store or Google Play.</p>
        <p>Your activation code is:</p>
        <p style="font-size:24px;font-weight:700;letter-spacing:0.08em;">${activationCode}</p>
        <p>This code expires on ${expiresAt.toISOString().slice(0, 10)}.</p>
      `;

      if (resend && EMAIL_FROM) {
        try {
          await resend.emails.send({
            from: EMAIL_FROM,
            html: emailHtml,
            subject: "Your CKD Copilot activation code",
            to: doc.email,
          });
          sentInviteIds.push(doc.patientId);
          if (includeDevInvites) {
            console.log("[DEV] Patient invite activation code", {
              activationCode,
              email: doc.email,
            });
          }
        } catch (error: any) {
          if (isLocalDev()) {
            console.log("[DEV] Patient invite activation code", {
              activationCode,
              email: doc.email,
            });
            sentInviteIds.push(doc.patientId);
          } else {
            failedDeliveries.push({
              email: doc.email,
              message: error?.message || "Email send failed",
            });
          }
        }
      } else {
        console.log("[DEV] Patient invite activation code", {
          activationCode,
          email: doc.email,
        });
        sentInviteIds.push(doc.patientId);
      }
    }

    if (sentInviteIds.length > 0) {
      await db.collection(COLLECTIONS.PatientInvites).updateMany(
        {
          batchId,
          patientId: {
            $in: sentInviteIds.map((id) => new ObjectId(id)),
          },
        },
        {
          $set: {
            invitedAt: now,
            status: "invited",
            updatedAt: now,
            updatedBy: caller.principalId,
          },
        },
      );
    }

    return ok({
      batchId,
      createdCount: inviteRows.length,
      devInvites,
      failedCount: failedDeliveries.length,
      failedDeliveries,
      sentCount: sentInviteIds.length,
      status: failedDeliveries.length ? "partially_sent" : "invited",
    });
  } catch (error: any) {
    return bad(
      error?.message || "Unable to create patient invite batch",
      undefined,
      error?.status || 500,
    );
  }
}
