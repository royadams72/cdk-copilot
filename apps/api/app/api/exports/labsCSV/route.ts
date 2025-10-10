// app/api/exports/labs.csv/route.ts
import { NextResponse } from "next/server";
import { getDb } from "@/apps/api/lib/db/mongodb";

// optional: require admin/clinician scope first
export async function GET() {
  const db = await getDb("analytics"); // <= uses svc_analytics_ro (no PII access)

  // Only analytics-safe collections & fields
  const cursor = db.collection("lab_results").find(
    {}, // you could add orgId/date filters
    {
      projection: {
        patientId: 1,
        eGFR: 1,
        creatinine: 1,
        takenAt: 1,
        orgId: 1,
      },
    }
  );

  // Build CSV
  let csv = "patientId,eGFR,creatinine,takenAt,orgId\n";
  for await (const d of cursor) {
    csv += `${d.patientId},${d.eGFR ?? ""},${d.creatinine ?? ""},${new Date(
      d.takenAt
    ).toISOString()},${d.orgId}\n`;
  }

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="labs_export.csv"`,
    },
  });
}
