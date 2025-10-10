import * as Sentry from "@sentry/nextjs";
import { getDb } from "@/apps/api/lib/db/mongodb";
import { randomUUID } from "crypto";

export async function GET(req: Request) {
  const requestId = randomUUID();
  try {
    // ... your logic ...
    throw new Error("DB_TIMEOUT"); // example
  } catch (err: any) {
    // 1) report to Sentry (primary)
    Sentry.withScope((scope: Sentry.Scope) => {
      scope.setTag("service", "api");
      scope.setTag("route", "/api/patients");
      scope.setTag("env", process.env.NODE_ENV || "dev");
      scope.setContext("request", { requestId });
      Sentry.captureException(err);
    });

    // 2) mirror key fields to Mongo (lightweight, no PII)
    try {
      const db = await getDb();
      await db.collection("app_error_logs").insertOne({
        at: new Date(),
        level: "error",
        service: "api",
        env: process.env.NODE_ENV || "dev",
        route: "/api/patients",
        code: err.code || "DB_TIMEOUT",
        message: String(err.message || err),
        context: { requestId },
      });
    } catch {
      // swallow logging failure – never crash because logging failed
    }

    return new Response(
      JSON.stringify({ error: "Internal Server Error", requestId }),
      { status: 500 }
    );
  }
}
