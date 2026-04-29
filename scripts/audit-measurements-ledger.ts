import path from "node:path";
import * as dotenv from "dotenv";

import { MongoClient, ObjectId, type Document } from "mongodb";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

type CliArgs = {
  dbName: string;
  limit: number;
  patientId: string | null;
};

type DuplicateBucket = {
  _id: Document;
  count: number;
  ids: ObjectId[];
  latestMeasuredAt?: Date;
  latestUpdatedAt?: Date;
};

function parseArgs(argv: string[]): CliArgs {
  const dbName = process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
  const out: CliArgs = {
    dbName,
    limit: 20,
    patientId: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--patientId") {
      out.patientId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--limit") {
      out.limit = Number(argv[i + 1] ?? "20");
      i += 1;
    } else if (arg === "--db") {
      out.dbName = argv[i + 1] ?? dbName;
      i += 1;
    }
  }

  if (out.patientId && !ObjectId.isValid(out.patientId)) {
    throw new Error(`Invalid --patientId: ${out.patientId}`);
  }

  return out;
}

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

function patientMatch(patientId: string | null) {
  return patientId ? { patientId: new ObjectId(patientId) } : {};
}

function printBuckets(title: string, buckets: DuplicateBucket[]) {
  console.log(`\n${title}`);
  if (!buckets.length) {
    console.log("  none");
    return;
  }

  for (const bucket of buckets) {
    console.log(
      `  count=${bucket.count} key=${JSON.stringify(bucket._id)} latestMeasuredAt=${bucket.latestMeasuredAt?.toISOString() ?? "-"} latestUpdatedAt=${bucket.latestUpdatedAt?.toISOString() ?? "-"} ids=${bucket.ids
        .map((id) => id.toString())
        .join(",")}`,
    );
  }
}

async function run() {
  const args = parseArgs(process.argv);
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("Missing MONGODB_URI_MIGRATIONS or MONGODB_URI_APP");
  }

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(args.dbName);
    const collection = db.collection("measurements_ledger");
    const match = patientMatch(args.patientId);

    const [
      totalDocs,
      totalStepDocs,
      providerStepDocs,
      providerStepWithSyncDocs,
      duplicateByExternalRecordId,
      duplicateLegacyStepDays,
    ] = await Promise.all([
      collection.countDocuments(match),
      collection.countDocuments({ ...match, kind: "steps" }),
      collection.countDocuments({
        ...match,
        kind: "steps",
        source: "provider",
      }),
      collection.countDocuments({
        ...match,
        kind: "steps",
        source: "provider",
        "sync.provider": "health_connect",
      }),
      collection
        .aggregate<DuplicateBucket>([
          {
            $match: {
              ...match,
              kind: "steps",
              source: "provider",
              externalRecordId: { $exists: true, $type: "string" },
            },
          },
          {
            $group: {
              _id: {
                patientId: "$patientId",
                orgId: "$orgId",
                externalRecordId: "$externalRecordId",
                kind: "$kind",
                providerPackageName: "$provider.packageName",
              },
              count: { $sum: 1 },
              ids: { $push: "$_id" },
              latestMeasuredAt: { $max: "$measuredAt" },
              latestUpdatedAt: { $max: "$updatedAt" },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1, latestMeasuredAt: -1 } },
          { $limit: args.limit },
        ])
        .toArray(),
      collection
        .aggregate<DuplicateBucket>([
          {
            $match: {
              ...match,
              kind: "steps",
              source: "provider",
            },
          },
          {
            $addFields: {
              derivedDayKey: {
                $dateToString: {
                  date: "$measuredAt",
                  format: "%Y-%m-%d",
                  timezone: "UTC",
                },
              },
            },
          },
          {
            $group: {
              _id: {
                patientId: "$patientId",
                orgId: "$orgId",
                dayKey: {
                  $ifNull: ["$sync.dayKey", "$derivedDayKey"],
                },
                kind: "$kind",
                providerPackageName: "$provider.packageName",
                source: "$source",
              },
              count: { $sum: 1 },
              ids: { $push: "$_id" },
              latestMeasuredAt: { $max: "$measuredAt" },
              latestUpdatedAt: { $max: "$updatedAt" },
            },
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1, latestMeasuredAt: -1 } },
          { $limit: args.limit },
        ])
        .toArray(),
    ]);

    console.log("Measurements ledger audit");
    console.log(`db: ${args.dbName}`);
    console.log(`patient filter: ${args.patientId ?? "all"}`);
    console.log(`total docs: ${totalDocs}`);
    console.log(`total step docs: ${totalStepDocs}`);
    console.log(`provider step docs: ${providerStepDocs}`);
    console.log(`provider step docs with sync metadata: ${providerStepWithSyncDocs}`);

    printBuckets(
      "Duplicate provider step rows by externalRecordId",
      duplicateByExternalRecordId,
    );
    printBuckets(
      "Duplicate provider step rows by calendar day",
      duplicateLegacyStepDays,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
