import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { Resend } from "resend"; // or Nodemailer if you prefer
export const runtime = "nodejs";
const Body = z.object({ email: z.email() });

const DEFAULT_SCOPES = ["patients.read", "patients.flags.write"] as const;
const RESEND_KEY = process.env.RESEND_API_KEY || "";
const resend = RESEND_KEY ? new Resend(RESEND_KEY) : null;

if (!process.env.APP_ORIGIN && process.env.NODE_ENV !== "development") {
  console.warn("APP_ORIGIN not set; falling back to req.nextUrl.origin");
}
export async function POST(req: NextRequest) {
  try {
    const db = await getDb();
    const body = await req.json().catch(() => null);
    const parsed = Body.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    const { email } = parsed.data;

    // Create patient record
    const patients = db.collection("patients");
    const emailVerifs = db.collection("email_verifications");

    // Generate identifiers
    const patientId = new ObjectId();
    const principalId = `pr_${randomBytes(12).toString("hex")}`;

    const now = new Date();

    const patientDoc = {
      _id: patientId, // Primary Key
      principalId, // app generated
      scopes: [...DEFAULT_SCOPES], // minimal scopes at signup
      orgId: "org_demo", // or null/undefined if unknown
      summary: {}, // empty at this stage
      flags: [],
      createdAt: now,
      updatedAt: now,
    };

    // Insert patient

    await patients.insertOne(patientDoc);

    // Issue verification token
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes

    const verifyDoc = {
      _id: new ObjectId(),
      email, // PII stored here
      principalId,
      patientId,
      tokenHash,
      expiresAt,
      usedAt: null as Date | null,
      createdAt: now,
    };
    await emailVerifs.insertOne(verifyDoc);
    // ?? `${req.nextUrl.protocol}//${req.nextUrl.host}`
    const base = process.env.APP_ORIGIN;
    const verifyUrl = new URL("/api/auth/verify", base);
    verifyUrl.searchParams.set("token", rawToken);
    verifyUrl.searchParams.set("redirectUri", "ckdapp://verify");

    // Resend example. Replace with your sender and template as needed.
    if (resend) {
      await resend.emails.send({
        from: "CKD Copilot <no-reply@yourdomain>",
        to: email,
        subject: "Confirm your email",
        html: `
        <p>Confirm your email to continue.</p>
        <p><a href="${verifyUrl.toString()}">Verify email</a></p>
        <p>This link expires at ${expiresAt.toISOString()}.</p>
      `,
      });
    } else {
      console.log(
        "[DEV] Email disabled. Verification link:",
        verifyUrl.toString()
      );
    }

    return NextResponse.json({ status: "ok" });
  } catch (e: any) {
    console.error(
      "There was an error",
      JSON.stringify(e?.errInfo ?? e, null, 2)
    );
    return NextResponse.json(
      { error: "validation_failed", info: e?.errInfo },
      { status: 400 }
    );
  }
}
