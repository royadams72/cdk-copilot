// app/api/users/pii/[userId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb"; // or your getDb()
import { requireUser } from "@/apps/api/lib/auth/auth";
import { makeRequestId } from "@/apps/api/lib/http/request";
import { z } from "zod";

export const runtime = "nodejs";

const PiiPatchSchema = z
  .object({
    name: z
      .object({
        given: z.string().min(1).optional(),
        family: z.string().min(1).optional(),
      })
      .optional(),
    dob: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    sexAtBirth: z.enum(["male", "female", "intersex", "unknown"]).optional(),
    phone: z.string().optional(),
    email: z.string().email().optional(),
    address: z
      .object({
        line1: z.string().optional(),
        city: z.string().optional(),
        postcode: z.string().optional(),
        country: z.string().optional(),
      })
      .optional(),
  })
  .refine((obj) => Object.keys(obj).length > 0, "Empty patch");

export async function PATCH(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const requestId = makeRequestId();
  try {
    const caller = await requireUser(req, ["users:pii:write"]);
    const body = await req.json();
    const parsed = PiiPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          ok: false,
          message: "Validation failed",
          errors: parsed.error.flatten(),
          requestId,
        },
        { status: 400 }
      );
    }

    const database = await getDb();
    const res = await database.collection("users_pii").updateOne(
      { userId: params.userId },
      {
        $set: {
          ...parsed.data,
          updatedAt: new Date(),
          updatedBy: caller.authId,
          requestId,
        },
      },
      { upsert: false }
    );

    if (res.matchedCount === 0) {
      return NextResponse.json(
        { ok: false, message: "Not found", requestId },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { ok: true, modified: res.modifiedCount, requestId },
      { status: 200, headers: { "x-request-id": requestId } }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, message: err?.message || "Server error", requestId },
      { status: err?.status || 500 }
    );
  }
}
