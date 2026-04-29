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

type HeartRateDoc = WithId<{
  bpm?: number;
  externalRecordId?: string;
  kind: "heart_rate";
  measuredAt: Date;
  orgId: string;
  patientId: ObjectId;
  provider?: {
    displayName?: string;
    packageName?: string;
  };
  receivedAt?: Date;
  source?: string;
  updatedAt?: Date;
}>;

type DuplicateBucket = {
  _id: {
    signature: string;
  };
  docs: HeartRateDoc[];
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

function isProviderHeartRateDoc(doc: HeartRateDoc) {
  return (
    doc.source === "provider" &&
    typeof doc.provider?.packageName === "string" &&
    doc.provider.packageName.length > 0 &&
    typeof doc.bpm === "number"
  );
}

function compareDocsForCanonical(left: HeartRateDoc, right: HeartRateDoc) {
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
    const collection = db.collection<HeartRateDoc>("measurements_ledger");
    const duplicateBuckets = await collection
      .aggregate<DuplicateBucket>([
        {
          $match: {
            ...patientMatch(args.patientId),
            kind: "heart_rate",
            source: "provider",
          },
        },
        {
          $addFields: {
            dedupeSignature: {
              $concat: [
                "sample:",
                { $ifNull: ["$provider.packageName", ""] },
                ":",
                {
                  $dateToString: {
                    date: "$measuredAt",
                    format: "%Y-%m-%dT%H:%M:%S.%LZ",
                    timezone: "UTC",
                  },
                },
                ":",
                { $toString: "$bpm" },
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              signature: "$dedupeSignature",
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

    console.log(
      `${args.apply ? "Applying" : "Dry run"} heart-rate ledger cleanup in ${args.dbName}`,
    );
    console.log(`patient filter: ${args.patientId ?? "all"}`);
    console.log(`duplicate buckets: ${duplicateBuckets.length}`);

    for (const bucket of duplicateBuckets) {
      const docs = bucket.docs
        .filter(isProviderHeartRateDoc)
        .sort(compareDocsForCanonical);
      if (docs.length < 2) {
        continue;
      }

      duplicateDocCount += docs.length;
      const canonical = docs[0];
      const duplicates = docs.slice(1);

      console.log(
        `bucket signature=${bucket._id.signature} keep=${canonical._id.toString()} drop=${duplicates
          .map((doc) => doc._id.toString())
          .join(",")}`,
      );

      if (!args.apply) {
        bucketsChanged += 1;
        docsDeleted += duplicates.length;
        continue;
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

    console.log(`provider heart_rate docs scanned in duplicate buckets: ${duplicateDocCount}`);
    console.log(`buckets changed: ${bucketsChanged}`);
    console.log(`docs deleted: ${docsDeleted}`);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
