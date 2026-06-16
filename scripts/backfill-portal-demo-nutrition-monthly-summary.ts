import path from "node:path";

import * as dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

import { recomputeNutritionMonthlySummary } from "../apps/api/lib/utils/nutritionMonthlySummary";
import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DEMO_PATIENT_COUNT = 5;
const DEMO_ORG_ID = "org_ckd_portal_demo";
const SEED_PRINCIPAL_ID = "portal_demo_backfill";

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

function getDbName() {
  return process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
}

function toDemoPatientId(index: number) {
  return new ObjectId((index + 1).toString(16).padStart(24, "0"));
}

function resolveLedgerDate(entry: { createdAt?: Date | null; eatenAt?: Date | null }) {
  return entry.eatenAt ?? entry.createdAt ?? null;
}

function monthKey(date: Date) {
  return date.toISOString().slice(0, 7);
}

async function run() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("Missing MONGODB_URI_MIGRATIONS or MONGODB_URI_APP");
  }

  const dbName = getDbName();
  const client = new MongoClient(uri);

  try {
    await client.connect();

    const db = client.db(dbName);
    const ledger = db.collection<{
      createdAt?: Date | null;
      eatenAt?: Date | null;
      patientId: ObjectId;
    }>(COLLECTIONS.NutritionLedger);

    const patientIds = Array.from({ length: DEMO_PATIENT_COUNT }, (_, index) =>
      toDemoPatientId(index),
    );

    const entries = await ledger
      .find(
        { patientId: { $in: patientIds } },
        {
          projection: {
            createdAt: 1,
            eatenAt: 1,
            patientId: 1,
          },
        },
      )
      .toArray();

    const monthsByPatient = new Map<string, Set<string>>();

    for (const entry of entries) {
      const date = resolveLedgerDate(entry);
      if (!date) continue;

      const patientId = entry.patientId.toHexString();
      const months = monthsByPatient.get(patientId) ?? new Set<string>();
      months.add(monthKey(date));
      monthsByPatient.set(patientId, months);
    }

    let summariesWritten = 0;

    for (const patientId of patientIds) {
      const patientKey = patientId.toHexString();
      const months = Array.from(monthsByPatient.get(patientKey) ?? []).sort();

      if (months.length === 0) {
        console.log(`[portal:nutrition-summary] no ledger data for ${patientKey}`);
        continue;
      }

      for (const month of months) {
        await recomputeNutritionMonthlySummary(db, {
          month,
          orgId: DEMO_ORG_ID,
          patientId,
          seedPrincipalId: SEED_PRINCIPAL_ID,
        });
        summariesWritten += 1;
        console.log(
          `[portal:nutrition-summary] upserted ${patientKey} ${month}`,
        );
      }
    }

    console.log(
      `[portal:nutrition-summary] complete: ${summariesWritten} monthly summaries generated from nutrition_ledger`,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error("[portal:nutrition-summary] backfill failed");
  console.error(error);
  process.exit(1);
});
