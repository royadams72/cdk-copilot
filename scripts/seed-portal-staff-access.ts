import path from "node:path";

import * as dotenv from "dotenv";
import { MongoClient } from "mongodb";

import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const NOW = new Date();
const ORG_ID = "org_ckd_portal_demo";
const FACILITY_ID = "facility_newham_renal";
const CARE_TEAM_ID = "careteam_ckd_pilot";
const FACILITY_CODE = "NEWHAM-RENAL";
const FACILITY_NAME = "Newham Hospital Renal Service";
const CARE_TEAM_NAME = "CKD Pilot Care Team";
const CARE_TEAM_ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ACCOUNT_ACTOR_ID = "portal_demo_seed";

const STAFF_ACCESS = [
  {
    email: "roy.adams+portal@ckdcopilot.app",
    principalId: "acc_adamsroy2211_portal",
    role: "admin",
  },
  {
    email: "portal-demo-clinician@ckdcopilot.app",
    principalId: "pr_portal_demo_clinician",
    role: "clinician",
  },
  {
    email: "portal-demo-admin@ckdcopilot.app",
    principalId: "pr_portal_demo_admin",
    role: "admin",
  },
  {
    email: "portal-demo-nurse-l-anthony@ckdcopilot.app",
    principalId: "pr_portal_demo_nurse_l_anthony",
    role: "clinician",
  },
  {
    email: "portal-demo-nurse-b-rollins@ckdcopilot.app",
    principalId: "pr_portal_demo_nurse_b_rollins",
    role: "clinician",
  },
] as const;

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

    await db.collection(COLLECTIONS.Facilities).updateOne(
      { orgId: ORG_ID, code: FACILITY_CODE },
      {
        $set: {
          code: FACILITY_CODE,
          facilityId: FACILITY_ID,
          name: FACILITY_NAME,
          orgId: ORG_ID,
          updatedAt: NOW,
          updatedBy: ACCOUNT_ACTOR_ID,
        },
        $setOnInsert: {
          createdAt: NOW,
          createdBy: ACCOUNT_ACTOR_ID,
        },
      },
      { upsert: true },
    );

    await db.collection(COLLECTIONS.CareTeams).updateOne(
      { orgId: ORG_ID, name: CARE_TEAM_NAME },
      {
        $set: {
          facilityId: FACILITY_ID,
          memberUserIds: STAFF_ACCESS.map((item) => item.principalId),
          name: CARE_TEAM_NAME,
          orgId: ORG_ID,
          slug: CARE_TEAM_ID,
          updatedAt: NOW,
          updatedBy: CARE_TEAM_ACTOR_ID,
        },
        $setOnInsert: {
          createdAt: NOW,
          createdBy: CARE_TEAM_ACTOR_ID,
        },
      },
      { upsert: true },
    );

    for (const staff of STAFF_ACCESS) {
      await db.collection(COLLECTIONS.UsersAccounts).updateOne(
        { principalId: staff.principalId },
        {
          $set: {
            careTeamIds: [CARE_TEAM_ID],
            email: staff.email,
            facilityIds: [FACILITY_ID],
            isActive: true,
            orgId: ORG_ID,
            role: staff.role,
            updatedAt: NOW,
            updatedBy: ACCOUNT_ACTOR_ID,
          },
          $setOnInsert: {
            createdAt: NOW,
            createdBy: ACCOUNT_ACTOR_ID,
            grants: [],
            principalId: staff.principalId,
            scopes: [],
          },
        },
        { upsert: true },
      );
    }

    console.log(
      `[seed-portal-staff-access] updated ${STAFF_ACCESS.length} staff accounts with careTeamIds/facilityIds`,
    );
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error("[seed-portal-staff-access] failed");
  console.error(error);
  process.exit(1);
});
