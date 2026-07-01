import path from "node:path";
import * as dotenv from "dotenv";

import { type Document, type Filter, MongoClient, ObjectId } from "mongodb";

import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

type CliArgs = {
  apply: boolean;
  dbName: string;
  patientId: string;
};

type DeletePlan = {
  collection: string;
  count: number;
  filter: Filter<Document>;
  kind: "deleteMany" | "deleteOne" | "updateMany";
  update?: Document;
};

type PatientDoc = {
  _id: ObjectId;
  principalId?: string;
};

type PiiDoc = {
  email?: string;
  patientId: ObjectId;
  principalId?: string;
};

const OBJECT_ID_PATIENT_COLLECTIONS = [
  COLLECTIONS.AuthTokens,
  COLLECTIONS.CarePlans,
  COLLECTIONS.FitPlans,
  COLLECTIONS.HealthConnectEventLogs,
  COLLECTIONS.HealthConnectSyncState,
  COLLECTIONS.LabsCurrent,
  COLLECTIONS.LabsLedger,
  COLLECTIONS.MeasurementsLedger,
  COLLECTIONS.MedicationsCurrent,
  COLLECTIONS.MedicationsLedger,
  COLLECTIONS.NutritionFavourites,
  COLLECTIONS.NutritionLedger,
  COLLECTIONS.PatientEngagementLedger,
  COLLECTIONS.PatientGoalsCurrent,
  COLLECTIONS.PatientGoalsLedger,
  COLLECTIONS.TargetsCurrent,
  COLLECTIONS.TargetsLedger,
  COLLECTIONS.UsersClinical,
  COLLECTIONS.UsersPII,
  COLLECTIONS.WeeklyNutritionInsights,
  COLLECTIONS.WorseningTrendCheckIns,
  COLLECTIONS.WorseningTrendStates,
] as const;

const STRING_PATIENT_COLLECTIONS = [
  COLLECTIONS.WeeklyNutritionInsights,
] as const;

function printHelp() {
  console.log(`Delete a patient and linked records by patientId.

Usage:
  pnpm db:delete:user --patientId <24-hex-id>
  pnpm db:delete:user --patientId <24-hex-id> --apply

Options:
  --patientId <id>  Required Mongo ObjectId string for patients._id
  --apply           Execute deletes. Omit for dry run
  --db <name>       Override database name (default: MONGODB_DB | DB_NAME | ckd-copilot)
  --help            Show this message
`);
}

function parseArgs(argv: string[]): CliArgs {
  const dbName = process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
  let patientId: string | null = null;
  let apply = false;
  let shouldExit = false;
  let resolvedDbName = dbName;

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      apply = true;
    } else if (arg === "--patientId") {
      patientId = argv[i + 1] ?? null;
      i += 1;
    } else if (arg === "--db") {
      resolvedDbName = argv[i + 1] ?? dbName;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      shouldExit = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (shouldExit) {
    process.exit(0);
  }

  if (!patientId) {
    throw new Error("Missing required --patientId");
  }

  if (!ObjectId.isValid(patientId)) {
    throw new Error(`Invalid --patientId: ${patientId}`);
  }

  return {
    apply,
    dbName: resolvedDbName,
    patientId,
  };
}

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

async function countDocuments(
  client: MongoClient,
  dbName: string,
  collectionName: string,
  filter: Filter<Document>,
) {
  return client.db(dbName).collection(collectionName).countDocuments(filter);
}

async function buildDeletePlan(
  client: MongoClient,
  args: CliArgs,
  patientObjectId: ObjectId,
): Promise<{
  credentialIds: string[];
  email: string | null;
  plans: DeletePlan[];
  principalId: string | null;
}> {
  const db = client.db(args.dbName);
  const patients = db.collection<PatientDoc>(COLLECTIONS.Patients);
  const usersPii = db.collection<PiiDoc>(COLLECTIONS.UsersPII);

  const patientDoc = await patients.findOne(
    { _id: patientObjectId },
    { projection: { _id: 1, principalId: 1 } },
  );
  const piiDoc = await usersPii.findOne(
    { patientId: patientObjectId },
    { projection: { email: 1, patientId: 1, principalId: 1 } },
  );

  const principalId =
    patientDoc?.principalId ??
    piiDoc?.principalId ??
    (await db
      .collection(COLLECTIONS.AuthTokens)
      .distinct("principalId", {
        patientId: patientObjectId,
        principalId: { $type: "string" },
      })
      .then(
        (values) =>
          values.find((value): value is string => typeof value === "string") ??
          null,
      ));

  const credentialIds = principalId
    ? (
        await db.collection(COLLECTIONS.AuthLinks).distinct("credentialId", {
          credentialId: { $type: "string" },
          principalId,
        })
      ).filter((value): value is string => typeof value === "string")
    : [];

  const plans: DeletePlan[] = [];

  for (const collection of OBJECT_ID_PATIENT_COLLECTIONS) {
    const filter = { patientId: patientObjectId };
    plans.push({
      collection,
      count: await countDocuments(client, args.dbName, collection, filter),
      filter,
      kind: "deleteMany",
    });
  }

  for (const collection of STRING_PATIENT_COLLECTIONS) {
    const filter = { patientId: patientObjectId.toString() };
    plans.push({
      collection,
      count: await countDocuments(client, args.dbName, collection, filter),
      filter,
      kind: "deleteMany",
    });
  }

  const accountAccessFilter = {
    allowedPatientIds: patientObjectId.toString(),
    ...(principalId ? { principalId: { $ne: principalId } } : {}),
  };
  plans.push({
    collection: COLLECTIONS.UsersAccounts,
    count: await countDocuments(
      client,
      args.dbName,
      COLLECTIONS.UsersAccounts,
      accountAccessFilter,
    ),
    filter: accountAccessFilter,
    kind: "updateMany",
    update: { $pull: { allowedPatientIds: patientObjectId.toString() } },
  });

  if (principalId) {
    const principalFilter = { principalId };
    plans.push({
      collection: COLLECTIONS.AuthLinks,
      count: await countDocuments(
        client,
        args.dbName,
        COLLECTIONS.AuthLinks,
        principalFilter,
      ),
      filter: principalFilter,
      kind: "deleteMany",
    });
    plans.push({
      collection: COLLECTIONS.UsersAccounts,
      count: await countDocuments(
        client,
        args.dbName,
        COLLECTIONS.UsersAccounts,
        principalFilter,
      ),
      filter: principalFilter,
      kind: "deleteMany",
    });
  }

  if (credentialIds.length > 0) {
    const authCredentialObjectIds = credentialIds
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    if (authCredentialObjectIds.length > 0) {
      const filter = { _id: { $in: authCredentialObjectIds } };
      plans.push({
        collection: COLLECTIONS.AuthCredentials,
        count: await countDocuments(
          client,
          args.dbName,
          COLLECTIONS.AuthCredentials,
          filter,
        ),
        filter,
        kind: "deleteMany",
      });
    }
  }

  const patientDeleteFilter = { _id: patientObjectId };
  plans.push({
    collection: COLLECTIONS.Patients,
    count: await countDocuments(
      client,
      args.dbName,
      COLLECTIONS.Patients,
      patientDeleteFilter,
    ),
    filter: patientDeleteFilter,
    kind: "deleteOne",
  });

  return {
    credentialIds,
    email: piiDoc?.email ?? null,
    plans,
    principalId,
  };
}

async function applyPlan(
  client: MongoClient,
  dbName: string,
  plans: DeletePlan[],
) {
  const db = client.db(dbName);
  const results: Array<{
    affected: number;
    collection: string;
    kind: DeletePlan["kind"];
  }> = [];

  for (const plan of plans) {
    const collection = db.collection(plan.collection);

    if (plan.kind === "deleteMany") {
      const result = await collection.deleteMany(plan.filter);
      results.push({
        affected: result.deletedCount ?? 0,
        collection: plan.collection,
        kind: plan.kind,
      });
      continue;
    }

    if (plan.kind === "deleteOne") {
      const result = await collection.deleteOne(plan.filter);
      results.push({
        affected: result.deletedCount ?? 0,
        collection: plan.collection,
        kind: plan.kind,
      });
      continue;
    }

    const result = await collection.updateMany(plan.filter, plan.update ?? {});
    results.push({
      affected: result.modifiedCount ?? 0,
      collection: plan.collection,
      kind: plan.kind,
    });
  }

  return results;
}

async function run() {
  const args = parseArgs(process.argv);
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("Missing MONGODB_URI_MIGRATIONS or MONGODB_URI_APP");
  }

  const patientObjectId = new ObjectId(args.patientId);
  const client = new MongoClient(uri);
  await client.connect();

  try {
    const { credentialIds, email, plans, principalId } = await buildDeletePlan(
      client,
      args,
      patientObjectId,
    );

    console.log(
      `${args.apply ? "Applying" : "Dry run"} user deletion in ${args.dbName}`,
    );
    console.log(`patientId: ${patientObjectId.toString()}`);
    console.log(`principalId: ${principalId ?? "(not found)"}`);
    console.log(`email: ${email ?? "(not found)"}`);
    console.log(
      `credentialIds: ${credentialIds.length > 0 ? credentialIds.join(", ") : "(none found)"}`,
    );

    let plannedDeletes = 0;
    let plannedUpdates = 0;

    for (const plan of plans) {
      if (plan.count === 0) {
        continue;
      }

      if (plan.kind === "updateMany") {
        plannedUpdates += plan.count;
      } else {
        plannedDeletes += plan.count;
      }

      console.log(
        `${plan.kind} ${plan.collection} matched=${plan.count} filter=${JSON.stringify(plan.filter)}`,
      );
    }

    console.log(`planned deletes: ${plannedDeletes}`);
    console.log(`planned related account updates: ${plannedUpdates}`);

    if (!args.apply) {
      console.log("Dry run only. Re-run with --apply to execute.");
      return;
    }

    const results = await applyPlan(client, args.dbName, plans);
    for (const result of results) {
      if (result.affected === 0) {
        continue;
      }
      console.log(
        `${result.kind} ${result.collection} affected=${result.affected}`,
      );
    }
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
