import { createHash, randomBytes } from "node:crypto";

import { Resend } from "resend";

const RESEND_KEY = process.env.RESEND_API_KEY || "";
const EMAIL_FROM = process.env.EMAIL_FROM || null;
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

export type PatientInviteDeliveryResult = {
  activationCode: string | null;
  errorMessage?: string;
  ok: boolean;
};

export function makeActivationCode() {
  return randomBytes(5).toString("hex").toUpperCase();
}

export function hashActivationCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

function isLocalDev() {
  return process.env.NODE_ENV !== "production";
}

function buildInviteEmailHtml(args: {
  activationCode: string;
  expiresAt: Date;
}) {
  return `
    <p>You have been invited to join CKD Copilot.</p>
    <p>Download CKD Copilot from the App Store or Google Play.</p>
    <p>Your activation code is:</p>
    <p style="font-size:24px;font-weight:700;letter-spacing:0.08em;">${args.activationCode}</p>
    <p>This code expires on ${args.expiresAt.toISOString().slice(0, 10)}.</p>
  `;
}

export async function sendPatientInviteEmail(args: {
  activationCode: string;
  email: string;
  expiresAt: Date;
}): Promise<PatientInviteDeliveryResult> {
  const emailHtml = buildInviteEmailHtml(args);

  if (!resend || !EMAIL_FROM) {
    if (!isLocalDev()) {
      return {
        activationCode: null,
        errorMessage: "Invite email delivery is not configured",
        ok: false,
      };
    }

    console.log("[DEV] Patient invite activation code", {
      activationCode: args.activationCode,
      email: args.email,
    });
    return {
      activationCode: args.activationCode,
      ok: true,
    };
  }

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      html: emailHtml,
      subject: "Your CKD Copilot activation code",
      to: args.email,
    });

    if (isLocalDev()) {
      console.log("[DEV] Patient invite activation code", {
        activationCode: args.activationCode,
        email: args.email,
      });
    }

    return {
      activationCode: isLocalDev() ? args.activationCode : null,
      ok: true,
    };
  } catch (error: any) {
    if (isLocalDev()) {
      console.log("[DEV] Patient invite activation code", {
        activationCode: args.activationCode,
        email: args.email,
      });
      return {
        activationCode: args.activationCode,
        ok: true,
      };
    }

    return {
      activationCode: null,
      errorMessage: error?.message || "Email send failed",
      ok: false,
    };
  }
}

export async function sendPendingConsentReminderEmail(args: {
  email: string;
}): Promise<PatientInviteDeliveryResult> {
  const html = `
    <p>Your CKD Copilot account has been activated, but your care-team access request is still waiting for your decision.</p>
    <p>Open CKD Copilot and sign in with ${args.email} to review the request.</p>
    <p>If you were not expecting this request, contact the care organisation that invited you.</p>
  `;

  if (!resend || !EMAIL_FROM) {
    if (!isLocalDev()) {
      return { activationCode: null, errorMessage: "Consent reminder email delivery is not configured", ok: false };
    }
    console.log("[DEV] Patient consent reminder", { email: args.email });
    return { activationCode: null, ok: true };
  }

  try {
    await resend.emails.send({
      from: EMAIL_FROM,
      html,
      subject: "Review your CKD Copilot care-team access request",
      to: args.email,
    });
    return { activationCode: null, ok: true };
  } catch (error: any) {
    return { activationCode: null, errorMessage: error?.message || "Email send failed", ok: false };
  }
}
