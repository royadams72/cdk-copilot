import path from "node:path";
import * as dotenv from "dotenv";

import { MongoClient, ObjectId, type WithId } from "mongodb";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

type CliArgs = {
  apply: boolean;
  dbName: string;
  limit: number;
  patientId: string | null;
};

type StepDoc = WithId<{
  averageSpeedKph?: number;
  caloriesKcal?: number;
  count?: number;
  createdAt?: Date;
  distanceMeters?: number;
  externalRecordId?: string;
  kind: "steps";
  measuredAt: Date;
  orgId: string;
  patientId: ObjectId;
  provider?: {
    displayName?: string;
    packageName?: string;
  };
  receivedAt?: Date;
  source?: string;
  sync?: {
    dayKey?: string;
    finalizedAt?: Date;
    lastReconciledAt?: Date;
    provider?: "health_connect";
    status?: "provisional" | "finalized";
  };
  updatedAt?: Date;
}>;

type DuplicateBucket = {
  _id: {
    dayKey: string;
    orgId: string;
    patientId: ObjectId;
    providerPackageName?: string;
  };
  docs: StepDoc[];
};

function parseArgs(argv: string[]): CliArgs {
  const dbName = process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
  const out: CliArgs = {
    apply: false,
    dbName,
    limit: 500,
    patientId: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      out.apply = true;
    } else if (arg === "--patientId") {
      out.patientId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--limit") {
      out.limit = Number(argv[i + 1] ?? "500");
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

function utcDayKey(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isHealthConnectDoc(doc: StepDoc) {
  return (
    doc.source === "provider" &&
    typeof doc.provider?.packageName === "string" &&
    doc.provider.packageName.length > 0
  );
}

function metadataScore(doc: StepDoc) {
  let score = 0;
  if (typeof doc.distanceMeters === "number") score += 1;
  if (typeof doc.caloriesKcal === "number") score += 1;
  if (typeof doc.averageSpeedKph === "number") score += 1;
  if (doc.sync?.status === "finalized") score += 4;
  if (doc.sync?.status === "provisional") score += 2;
  if (typeof doc.count === "number") score += 1;
  return score;
}

function compareDocsForCanonical(left: StepDoc, right: StepDoc) {
  const metadataDiff = metadataScore(right) - metadataScore(left);
  if (metadataDiff !== 0) {
    return metadataDiff;
  }

  const updatedDiff =
    (right.updatedAt?.getTime() ?? 0) - (left.updatedAt?.getTime() ?? 0);
  if (updatedDiff !== 0) {
    return updatedDiff;
  }

  const receivedDiff =
    (right.receivedAt?.getTime() ?? 0) - (left.receivedAt?.getTime() ?? 0);
  if (receivedDiff !== 0) {
    return receivedDiff;
  }

  return right.measuredAt.getTime() - left.measuredAt.getTime();
}

function buildCanonicalSync(doc: StepDoc, dayKey: string) {
  const now = new Date();
  const status = doc.sync?.status === "finalized" ? "finalized" : "provisional";
  return {
    dayKey,
    finalizedAt:
      status === "finalized" ? doc.sync?.finalizedAt ?? now : undefined,
    lastReconciledAt: doc.sync?.lastReconciledAt ?? now,
    provider: "health_connect" as const,
    status,
  };
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
    const collection = db.collection<StepDoc>("measurements_ledger");
    const duplicateBuckets = await collection
      .aggregate<DuplicateBucket>([
        {
          $match: {
            ...patientMatch(args.patientId),
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
              dayKey: { $ifNull: ["$sync.dayKey", "$derivedDayKey"] },
              orgId: "$orgId",
              patientId: "$patientId",
              providerPackageName: "$provider.packageName",
            },
            docs: { $push: "$$ROOT" },
          },
        },
        {
          $match: {
            "docs.1": { $exists: true },
          },
        },
        { $limit: args.limit },
      ])
      .toArray();

    let duplicateDocCount = 0;
    let bucketsChanged = 0;
    let docsDeleted = 0;
    let docsUpdated = 0;

    console.log(
      `${args.apply ? "Applying" : "Dry run"} step ledger cleanup in ${args.dbName}`,
    );
    console.log(`patient filter: ${args.patientId ?? "all"}`);
    console.log(`duplicate buckets: ${duplicateBuckets.length}`);

    for (const bucket of duplicateBuckets) {
      const docs = bucket.docs
        .filter(isHealthConnectDoc)
        .sort(compareDocsForCanonical);
      if (docs.length < 2) {
        continue;
      }

      duplicateDocCount += docs.length;
      const canonical = docs[0];
      const duplicates = docs.slice(1);
      const dayKey = bucket._id.dayKey || utcDayKey(canonical.measuredAt);

      console.log(
        `bucket day=${dayKey} patient=${bucket._id.patientId.toString()} provider=${bucket._id.providerPackageName ?? "-"} keep=${canonical._id.toString()} drop=${duplicates
          .map((doc) => doc._id.toString())
          .join(",")}`,
      );

      if (!args.apply) {
        bucketsChanged += 1;
        docsDeleted += duplicates.length;
        if (!canonical.sync) {
          docsUpdated += 1;
        }
        continue;
      }

      const sync = buildCanonicalSync(canonical, dayKey);
      try {
        const updateResult = await collection.updateOne(
          { _id: canonical._id },
          {
            $set: {
              sync,
            },
          },
        );
        if (updateResult.modifiedCount > 0) {
          docsUpdated += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `warning: could not stamp sync metadata on ${canonical._id.toString()} for ${dayKey}: ${message}`,
        );
      }

      const deleteResult = await collection.deleteMany({
        _id: {
          $in: duplicates.map((doc) => doc._id),
        },
      });
      if (deleteResult.deletedCount > 0) {
        bucketsChanged += 1;
        docsDeleted += deleteResult.deletedCount;
      }
    }

    console.log(`provider step docs scanned in duplicate buckets: ${duplicateDocCount}`);
    console.log(`buckets changed: ${bucketsChanged}`);
    console.log(`docs deleted: ${docsDeleted}`);
    console.log(`canonical docs updated with sync metadata: ${docsUpdated}`);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
