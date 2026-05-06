import { NextRequest } from "next/server";

import { getDb } from "@/apps/api/lib/db/mongodb";

const COLLECTION_NAME = "auth_rate_limits";

type RateLimitRule = {
  bucket: string;
  key: string;
  limit: number;
  windowMs: number;
};

type RateLimitDoc = {
  bucket: string;
  count: number;
  createdAt: Date;
  expiresAt: Date;
  key: string;
  updatedAt: Date;
  windowStart: Date;
};

export function getClientIp(req: NextRequest) {
  const forwardedFor = req.headers.get("x-forwarded-for")?.trim();
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function enforceRateLimit(rules: RateLimitRule[]) {
  if (!rules.length) return;

  const now = Date.now();
  const db = await getDb();
  const collection = db.collection<RateLimitDoc>(COLLECTION_NAME);

  for (const rule of rules) {
    const windowStartMs = Math.floor(now / rule.windowMs) * rule.windowMs;
    const windowStart = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + rule.windowMs * 2);
    const updatedAt = new Date(now);

    const doc = await collection.findOneAndUpdate(
      {
        bucket: rule.bucket,
        key: rule.key,
        windowStart,
      },
      {
        $inc: { count: 1 },
        $set: {
          updatedAt,
        },
        $setOnInsert: {
          createdAt: updatedAt,
          expiresAt,
        },
      },
      {
        returnDocument: "after",
        upsert: true,
      },
    );

    if ((doc?.count ?? 0) > rule.limit) {
      throw Object.assign(new Error("Too many requests"), { status: 429 });
    }
  }
}
