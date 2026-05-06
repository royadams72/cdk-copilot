import path from "node:path";
import * as dotenv from "dotenv";

import { MongoClient, ObjectId, type WithId } from "mongodb";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

type CliArgs = {
  apply: boolean;
  dbName: string;
  limit: number;
  principalId: string | null;
};

type AuthTokenDoc = WithId<{
  _id: ObjectId;
  createdAt: Date;
  credentialId?: string;
  email?: string;
  expiresAt: Date;
  principalId?: string;
  replacedById?: ObjectId | string | null;
  revokedAt?: Date | null;
  rotatedAt?: Date | null;
  sessionId?: string;
  type: "oauth_code" | "email_verify" | "password_reset" | "refresh";
  usedAt?: Date | null;
}>;

type DuplicateRefreshBucket = {
  _id: {
    credentialId: string;
    principalId: string;
  };
  docs: AuthTokenDoc[];
};

function parseArgs(argv: string[]): CliArgs {
  const dbName = process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
  const out: CliArgs = {
    apply: false,
    dbName,
    limit: 500,
    principalId: null,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      out.apply = true;
    } else if (arg === "--principalId") {
      out.principalId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--limit") {
      out.limit = Number(argv[i + 1] ?? "500");
      i += 1;
    } else if (arg === "--db") {
      out.dbName = argv[i + 1] ?? dbName;
      i += 1;
    }
  }

  return out;
}

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

function compareNewestFirst(left: AuthTokenDoc, right: AuthTokenDoc) {
  return right.createdAt.getTime() - left.createdAt.getTime();
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
    const now = new Date();
    const db = client.db(args.dbName);
    const collection = db.collection<AuthTokenDoc>("auth_tokens");

    const duplicateRefreshBuckets = await collection
      .aggregate<DuplicateRefreshBucket>([
        {
          $match: {
            type: "refresh",
            credentialId: { $exists: true, $type: "string" },
            principalId: { $exists: true, $type: "string" },
            expiresAt: { $gt: now },
            revokedAt: null,
            rotatedAt: null,
            ...(args.principalId ? { principalId: args.principalId } : {}),
          },
        },
        {
          $group: {
            _id: {
              credentialId: "$credentialId",
              principalId: "$principalId",
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

    const expiredButPresentCount = await collection.countDocuments({
      expiresAt: { $lte: now },
    });

    let duplicateBuckets = 0;
    let refreshesRevoked = 0;

    console.log(
      `${args.apply ? "Applying" : "Dry run"} auth token cleanup in ${args.dbName}`,
    );
    console.log(`principal filter: ${args.principalId ?? "all"}`);
    console.log(`expired tokens still present (TTL async): ${expiredButPresentCount}`);
    console.log(`duplicate active refresh buckets: ${duplicateRefreshBuckets.length}`);

    if (expiredButPresentCount > 0) {
      console.log(
        `${args.apply ? "deleting" : "would delete"} expired tokens older than now`,
      );
    }

    for (const bucket of duplicateRefreshBuckets) {
      const docs = bucket.docs.sort(compareNewestFirst);
      const keep = docs[0];
      const revoke = docs.slice(1);

      duplicateBuckets += 1;
      refreshesRevoked += revoke.length;

      console.log(
        `refresh principal=${bucket._id.principalId} credential=${bucket._id.credentialId} keep=${keep._id.toString()} revoke=${revoke
          .map((doc) => doc._id.toString())
          .join(",")}`,
      );

      if (!args.apply || revoke.length === 0) {
        continue;
      }

      await collection.updateMany(
        { _id: { $in: revoke.map((doc) => doc._id) } },
        {
          $set: {
            revokedAt: now,
          },
        },
      );
    }

    let expiredDeleted = 0;
    if (args.apply && expiredButPresentCount > 0) {
      const deleteExpiredResult = await collection.deleteMany({
        expiresAt: { $lte: now },
      });
      expiredDeleted = deleteExpiredResult.deletedCount ?? 0;
    }

    console.log(`duplicate refresh buckets processed: ${duplicateBuckets}`);
    console.log(`refresh tokens revoked: ${refreshesRevoked}`);
    console.log(`expired tokens deleted: ${expiredDeleted}`);
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
