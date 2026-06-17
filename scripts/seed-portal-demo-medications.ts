import path from "node:path";

import * as dotenv from "dotenv";
import { MongoClient, ObjectId, type Db } from "mongodb";

import {
  rebuildAndUpsertMedicationCurrent,
  type MedicationEventDoc,
  type MedicationEventType,
} from "../apps/api/lib/utils/medicationsProjection";
import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DEMO_ORG_ID = "org_ckd_portal_demo";

type DemoMedicationTimelinePoint = {
  at: string;
  by?: "patient" | "clinician";
  data?: Record<string, unknown>;
  eventType: MedicationEventType;
  reason?: string;
};

type DemoMedicationTimeline = {
  seedId: string;
  timeline: DemoMedicationTimelinePoint[];
};

type DemoPatientSeed = {
  patientId: ObjectId;
  timelines: DemoMedicationTimeline[];
};

type PatientActorDoc = {
  firstName?: string;
  lastName?: string;
  patientId: ObjectId;
  principalId?: string;
};

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

function getDbName() {
  return process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
}

function toDemoPatientId(index: number) {
  return new ObjectId((index + 1).toString(16).padStart(24, "0"));
}

function toObjectId(seed: string) {
  const hex = Buffer.from(seed).toString("hex").slice(0, 24).padEnd(24, "0");
  return new ObjectId(hex);
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function findChangedFields(timeline: DemoMedicationTimelinePoint[]) {
  const fields = new Set<string>();
  for (const point of timeline) {
    for (const key of Object.keys(point.data ?? {})) {
      fields.add(key);
    }
  }
  return fields;
}

const DEMO_SEED: DemoPatientSeed[] = [
  {
    patientId: toDemoPatientId(0),
    timelines: [
      {
        seedId: "aisha_ramipril",
        timeline: [
          {
            at: "2026-04-15T08:30:00.000Z",
            data: {
              dose: "10 mg",
              form: "tablet",
              frequency: "once daily",
              instructions: "Take in the morning.",
              name: "Ramipril",
              route: "oral",
              startAt: "2026-04-15T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-05-30T10:20:00.000Z",
            by: "clinician",
            data: { from: "10 mg", to: "12.5 mg" },
            eventType: "dose_changed",
            reason: "Titrated after sustained high home blood pressure.",
          },
        ],
      },
      {
        seedId: "aisha_furosemide",
        timeline: [
          {
            at: "2026-04-18T09:15:00.000Z",
            data: {
              dose: "40 mg",
              form: "tablet",
              frequency: "twice daily",
              instructions: "Take morning and late afternoon.",
              name: "Furosemide",
              route: "oral",
              startAt: "2026-04-18T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-06-12T11:05:00.000Z",
            by: "clinician",
            data: { from: "twice daily", to: "three times daily" },
            eventType: "frequency_changed",
            reason: "Extra fluid control while ankle swelling is active.",
          },
        ],
      },
    ],
  },
  {
    patientId: toDemoPatientId(1),
    timelines: [
      {
        seedId: "michael_amlodipine",
        timeline: [
          {
            at: "2026-04-08T12:00:00.000Z",
            data: {
              dose: "5 mg",
              form: "tablet",
              frequency: "once daily",
              instructions: "Take at night.",
              name: "Amlodipine",
              route: "oral",
              startAt: "2026-04-08T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-06-02T16:10:00.000Z",
            data: { from: "active", to: "paused" },
            eventType: "status_changed",
            reason: "Paused temporarily while reviewing dizziness symptoms.",
          },
          {
            at: "2026-06-09T09:00:00.000Z",
            by: "clinician",
            data: { from: "paused", to: "active" },
            eventType: "status_changed",
            reason: "Restarted after dizziness settled.",
          },
        ],
      },
    ],
  },
  {
    patientId: toDemoPatientId(2),
    timelines: [
      {
        seedId: "leanne_metformin",
        timeline: [
          {
            at: "2026-03-22T08:00:00.000Z",
            data: {
              dose: "500 mg",
              form: "tablet",
              frequency: "twice daily",
              instructions: "Take with breakfast and evening meal.",
              name: "Metformin",
              route: "oral",
              startAt: "2026-03-22T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-05-18T14:20:00.000Z",
            by: "clinician",
            data: { from: "Take with breakfast and evening meal.", to: "Take with meals and monitor stomach upset." },
            eventType: "instructions_changed",
            reason: "Updated counselling note after GI side effects review.",
          },
        ],
      },
    ],
  },
  {
    patientId: toDemoPatientId(3),
    timelines: [
      {
        seedId: "graham_sevelamer",
        timeline: [
          {
            at: "2026-04-05T13:15:00.000Z",
            data: {
              dose: "800 mg",
              form: "tablet",
              frequency: "three times daily",
              instructions: "Take with meals.",
              name: "Sevelamer",
              route: "oral",
              startAt: "2026-04-05T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-06-03T15:45:00.000Z",
            by: "clinician",
            data: { from: "three times daily", to: "four times daily" },
            eventType: "frequency_changed",
            reason: "Phosphate remains high despite good adherence.",
          },
        ],
      },
      {
        seedId: "graham_alfacalcidol",
        timeline: [
          {
            at: "2026-04-09T10:05:00.000Z",
            data: {
              dose: "5 mcg",
              form: "capsule",
              frequency: "once daily",
              instructions: "Take after breakfast.",
              name: "Alfacalcidol",
              route: "oral",
              startAt: "2026-04-09T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-05-28T11:30:00.000Z",
            by: "clinician",
            data: { from: "active", to: "completed" },
            eventType: "status_changed",
            reason: "Completed course following specialist review.",
          },
        ],
      },
    ],
  },
  {
    patientId: toDemoPatientId(4),
    timelines: [
      {
        seedId: "priya_tacrolimus",
        timeline: [
          {
            at: "2026-04-11T09:00:00.000Z",
            data: {
              dose: "1 mg",
              form: "capsule",
              frequency: "twice daily",
              instructions: "Take 12 hours apart.",
              name: "Tacrolimus",
              route: "oral",
              startAt: "2026-04-11T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
          {
            at: "2026-06-14T10:40:00.000Z",
            by: "clinician",
            data: { from: "1 mg", to: "1.5 mg" },
            eventType: "dose_changed",
            reason: "Adjusted after trough level review.",
          },
        ],
      },
      {
        seedId: "priya_prednisolone",
        timeline: [
          {
            at: "2026-04-11T09:05:00.000Z",
            data: {
              dose: "5 mg",
              form: "tablet",
              frequency: "once daily",
              instructions: "Take with breakfast.",
              name: "Prednisolone",
              route: "oral",
              startAt: "2026-04-11T00:00:00.000Z",
              status: "active",
            },
            eventType: "created",
          },
        ],
      },
    ],
  },
];

async function lookupPatientActors(db: Db, patientIds: ObjectId[]) {
  const docs = await db
    .collection<PatientActorDoc>(COLLECTIONS.UsersPII)
    .find(
      { patientId: { $in: patientIds } },
      {
        projection: {
          _id: 0,
          firstName: 1,
          lastName: 1,
          patientId: 1,
          principalId: 1,
        },
      },
    )
    .toArray();

  const map = new Map<
    string,
    { displayName: string; principalId: string }
  >();

  for (const doc of docs) {
    const displayName =
      [doc.firstName, doc.lastName].filter(Boolean).join(" ").trim() ||
      "Portal demo patient";
    const principalId =
      doc.principalId?.trim() || `pr_missing_${doc.patientId.toHexString()}`;
    map.set(doc.patientId.toHexString(), { displayName, principalId });
  }

  return map;
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
    const patientIds = DEMO_SEED.map((patient) => patient.patientId);
    const actorMap = await lookupPatientActors(db, patientIds);

    const medicationIds = DEMO_SEED.flatMap((patient) =>
      patient.timelines.map((timeline) => toObjectId(timeline.seedId)),
    );

    await db
      .collection(COLLECTIONS.MedicationsCurrent)
      .deleteMany({ patientId: { $in: patientIds } });
    await db
      .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
      .deleteMany({
        $or: [
          { patientId: { $in: patientIds } },
          { medicationId: { $in: medicationIds } },
        ],
      });

    let eventCount = 0;

    for (const patient of DEMO_SEED) {
      const actor = actorMap.get(patient.patientId.toHexString()) ?? {
        displayName: "Portal demo patient",
        principalId: `pr_missing_${patient.patientId.toHexString()}`,
      };

      for (const medication of patient.timelines) {
        const medicationId = toObjectId(medication.seedId);
        const changedFields = findChangedFields(medication.timeline);

        const docs: MedicationEventDoc[] = medication.timeline.map((point) => ({
          _id: new ObjectId(),
          at: new Date(point.at),
          by:
            point.by === "clinician"
              ? "pr_portal_demo_clinician"
              : actor.principalId,
          data: point.data ?? {},
          eventType: point.eventType,
          medicationId,
          orgId: DEMO_ORG_ID,
          patientId: patient.patientId,
          ...(point.reason ? { reason: point.reason } : {}),
        }));

        if (docs.length > 0) {
          await db
            .collection<MedicationEventDoc>(COLLECTIONS.MedicationsLedger)
            .insertMany(docs);
          eventCount += docs.length;
          await rebuildAndUpsertMedicationCurrent(
            db,
            patient.patientId,
            medicationId,
          );
          console.log("[portal:medications] seeded timeline", {
            changedFields: Array.from(changedFields),
            medicationId: medicationId.toHexString(),
            medicationName:
              typeof docs[0]?.data?.name === "string"
                ? titleCase(docs[0].data.name)
                : medication.seedId,
            patient: actor.displayName,
          });
        }
      }
    }

    const currentCount = await db
      .collection(COLLECTIONS.MedicationsCurrent)
      .countDocuments({ patientId: { $in: patientIds } });

    console.log(
      `[portal:medications] seeded ${eventCount} ledger events and ${currentCount} current medication rows for ${patientIds.length} demo patients`,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error("[portal:medications] seed failed");
  console.error(error);
  process.exit(1);
});
