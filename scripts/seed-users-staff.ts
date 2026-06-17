import path from "node:path";

import * as dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

type StaffSeedDoc = {
  _id: ObjectId;
  createdAt: Date;
  createdBy: string;
  displayName?: string;
  firstName: string;
  isActive: boolean;
  jobTitle?: string;
  lastName: string;
  orgId: string;
  principalId: string;
  title?: string;
  updatedAt: Date;
  updatedBy: string;
};

const NOW = new Date();
const DEMO_ORG_ID = "org_ckd_portal_demo";

const STAFF_SEED: StaffSeedDoc[] = [
  {
    _id: new ObjectId("68515a3d8c0f78dbecb1a001"),
    createdAt: NOW,
    createdBy: "pr_portal_demo_admin",
    displayName: "Dr Louise Anthony",
    firstName: "Louise",
    isActive: true,
    jobTitle: "Consultant Nephrologist",
    lastName: "Anthony",
    orgId: DEMO_ORG_ID,
    principalId: "pr_portal_demo_clinician",
    title: "Dr",
    updatedAt: NOW,
    updatedBy: "pr_portal_demo_admin",
  },
  {
    _id: new ObjectId("68515a3d8c0f78dbecb1a002"),
    createdAt: NOW,
    createdBy: "pr_portal_demo_admin",
    displayName: "Beth Rollins",
    firstName: "Beth",
    isActive: true,
    jobTitle: "Portal Administrator",
    lastName: "Rollins",
    orgId: DEMO_ORG_ID,
    principalId: "pr_portal_demo_admin",
    title: "Ms",
    updatedAt: NOW,
    updatedBy: "pr_portal_demo_admin",
  },
  {
    _id: new ObjectId("68515a3d8c0f78dbecb1a003"),
    createdAt: NOW,
    createdBy: "pr_portal_demo_admin",
    displayName: "Roy Adams",
    firstName: "Roy",
    isActive: true,
    jobTitle: "Clinical Portal Pilot Lead",
    lastName: "Adams",
    orgId: DEMO_ORG_ID,
    principalId: "acc_adamsroy2211_portal",
    title: "Mr",
    updatedAt: NOW,
    updatedBy: "pr_portal_demo_admin",
  },
  {
    _id: new ObjectId("68515a3d8c0f78dbecb1a004"),
    createdAt: NOW,
    createdBy: "pr_portal_demo_admin",
    displayName: "Nurse L Anthony",
    firstName: "Louise",
    isActive: true,
    jobTitle: "Renal Nurse Specialist",
    lastName: "Anthony",
    orgId: DEMO_ORG_ID,
    principalId: "pr_portal_demo_nurse_l_anthony",
    title: "Nurse",
    updatedAt: NOW,
    updatedBy: "pr_portal_demo_admin",
  },
  {
    _id: new ObjectId("68515a3d8c0f78dbecb1a005"),
    createdAt: NOW,
    createdBy: "pr_portal_demo_admin",
    displayName: "Nurse B Rollins",
    firstName: "Beth",
    isActive: true,
    jobTitle: "Renal Nurse Specialist",
    lastName: "Rollins",
    orgId: DEMO_ORG_ID,
    principalId: "pr_portal_demo_nurse_b_rollins",
    title: "Nurse",
    updatedAt: NOW,
    updatedBy: "pr_portal_demo_admin",
  },
];

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

function getDbName() {
  return process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
}

async function main() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("Missing MONGODB_URI_MIGRATIONS or MONGODB_URI_APP");
  }

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(getDbName());
    const collection = db.collection<StaffSeedDoc>(COLLECTIONS.UsersStaff);

    for (const doc of STAFF_SEED) {
      await collection.updateOne(
        { principalId: doc.principalId },
        {
          $set: {
            displayName: doc.displayName,
            firstName: doc.firstName,
            isActive: doc.isActive,
            jobTitle: doc.jobTitle,
            lastName: doc.lastName,
            orgId: doc.orgId,
            title: doc.title,
            updatedAt: doc.updatedAt,
            updatedBy: doc.updatedBy,
          },
          $setOnInsert: {
            _id: doc._id,
            createdAt: doc.createdAt,
            createdBy: doc.createdBy,
            principalId: doc.principalId,
          },
        },
        { upsert: true },
      );
    }

    console.log(
      `[seed-users-staff] upserted ${STAFF_SEED.length} staff profiles into ${COLLECTIONS.UsersStaff}`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[seed-users-staff] failed");
  console.error(error);
  process.exit(1);
});
