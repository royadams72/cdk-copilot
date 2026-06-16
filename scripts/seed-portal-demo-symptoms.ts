import path from "node:path";

import * as dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DEMO_ORG_ID = "org_ckd_portal_demo";

type ActorType = "patient" | "clinician" | "dietitian" | "admin" | "system";
type SymptomStatus = "active" | "improving" | "resolved";
type SymptomSource = ActorType;
type EventType = "created" | "updated" | "resolved" | "reopened";

type SymptomActor = {
  actorType: ActorType;
  displayName: string;
  principalId: string;
};

type SymptomEntryDoc = {
  _id: ObjectId;
  createdAt: Date;
  createdBy: SymptomActor;
  name: string;
  normalizedName: string;
  note: string | null;
  orgId: string | null;
  patientId: ObjectId;
  recordedAt: Date;
  resolvedAt: Date | null;
  severity: number;
  source: SymptomSource;
  startedAt: Date | null;
  status: SymptomStatus;
  symptomId: string;
  triggers: string[];
  updatedAt: Date;
  updatedBy: SymptomActor;
};

type SymptomLedgerEventDoc = {
  _id?: ObjectId;
  after: SymptomEntryDoc;
  before: SymptomEntryDoc | null;
  createdAt: Date;
  createdBy: SymptomActor;
  eventType: EventType;
  orgId: string | null;
  patientId: ObjectId;
  symptomId: string;
};

type SymptomTimelinePoint = {
  actorType?: ActorType;
  at: string;
  note: string | null;
  recordedAt?: string;
  severity: number;
  startedAt?: string | null;
  status: SymptomStatus;
  triggers?: string[];
};

type SymptomTimeline = {
  name: string;
  points: SymptomTimelinePoint[];
  symptomKey: string;
};

type DemoPatient = {
  displayName: string;
  patientId: ObjectId;
  principalId: string;
  symptomTimelines: SymptomTimeline[];
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

function normalizeSymptomName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function parseDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function makeActor(
  patientDisplayName: string,
  patientPrincipalId: string,
  actorType: ActorType,
): SymptomActor {
  if (actorType === "patient") {
    return {
      actorType,
      displayName: patientDisplayName,
      principalId: patientPrincipalId,
    };
  }

  return {
    actorType,
    displayName: "Portal demo clinician",
    principalId: "pr_portal_demo_clinician",
  };
}

function eventTypeForTransition(
  previous: SymptomStatus | null,
  next: SymptomStatus,
): EventType {
  if (!previous) return "created";
  if (previous === "resolved" && next !== "resolved") return "reopened";
  if (next === "resolved" && previous !== "resolved") return "resolved";
  return "updated";
}

function makeSymptomId(patientIndex: number, symptomKey: string) {
  return `sym_demo_p${patientIndex}_${symptomKey}`;
}

function makeEntry(args: {
  actor: SymptomActor;
  createdAt: Date;
  createdBy: SymptomActor;
  name: string;
  note: string | null;
  patientId: ObjectId;
  recordedAt: Date;
  severity: number;
  source: SymptomSource;
  startedAt: Date | null;
  status: SymptomStatus;
  symptomId: string;
  triggers: string[];
  updatedAt: Date;
}): SymptomEntryDoc {
  return {
    _id: new ObjectId(),
    createdAt: args.createdAt,
    createdBy: args.createdBy,
    name: args.name,
    normalizedName: normalizeSymptomName(args.name),
    note: args.note,
    orgId: DEMO_ORG_ID,
    patientId: args.patientId,
    recordedAt: args.recordedAt,
    resolvedAt: args.status === "resolved" ? args.recordedAt : null,
    severity: args.severity,
    source: args.source,
    startedAt: args.startedAt,
    status: args.status,
    symptomId: args.symptomId,
    triggers: args.triggers,
    updatedAt: args.updatedAt,
    updatedBy: args.actor,
  };
}

const DEMO_PATIENTS: DemoPatient[] = [
  {
    displayName: "Aisha Rahman",
    patientId: toDemoPatientId(0),
    principalId: "pr_portal_demo_patient_1",
    symptomTimelines: [
      {
        name: "Ankle swelling",
        symptomKey: "ankle_swelling",
        points: [
          {
            at: "2026-05-20T09:10:00.000Z",
            note: "Feet tight by the evening after standing.",
            severity: 3,
            startedAt: "2026-05-19T18:00:00.000Z",
            status: "active",
            triggers: ["long periods standing", "salty meal"],
          },
          {
            actorType: "clinician",
            at: "2026-06-01T14:40:00.000Z",
            note: "Worse after the weekend, advised to monitor fluid and salt.",
            severity: 4,
            status: "active",
            triggers: ["salty meal", "reduced leg elevation"],
          },
          {
            at: "2026-06-08T08:55:00.000Z",
            note: "Slightly better in the mornings, still swollen by tea time.",
            severity: 3,
            status: "improving",
            triggers: ["warm weather"],
          },
          {
            at: "2026-06-14T19:15:00.000Z",
            note: "Swelling came back after a family event meal.",
            severity: 4,
            status: "active",
            triggers: ["salty meal", "late meal"],
          },
        ],
      },
      {
        name: "Breathlessness",
        symptomKey: "breathlessness",
        points: [
          {
            at: "2026-06-05T07:50:00.000Z",
            note: "Short of breath climbing the stairs.",
            severity: 4,
            startedAt: "2026-06-04T17:00:00.000Z",
            status: "active",
            triggers: ["stairs", "walking uphill"],
          },
          {
            actorType: "clinician",
            at: "2026-06-12T11:20:00.000Z",
            note: "Still getting puffed walking to the shops.",
            severity: 5,
            status: "active",
            triggers: ["walking uphill", "carrying bags"],
          },
        ],
      },
      {
        name: "Nausea",
        symptomKey: "nausea",
        points: [
          {
            at: "2026-04-18T13:00:00.000Z",
            note: "Mild nausea after breakfast.",
            severity: 2,
            status: "active",
            triggers: ["large breakfast"],
          },
          {
            at: "2026-04-22T10:15:00.000Z",
            note: "Settled after a few days.",
            severity: 1,
            status: "resolved",
            triggers: [],
          },
        ],
      },
    ],
  },
  {
    displayName: "Michael Turner",
    patientId: toDemoPatientId(1),
    principalId: "pr_portal_demo_patient_2",
    symptomTimelines: [
      {
        name: "Dizziness",
        symptomKey: "dizziness",
        points: [
          {
            at: "2026-05-03T08:20:00.000Z",
            note: "Felt dizzy when standing up quickly.",
            severity: 3,
            status: "active",
            triggers: ["missed breakfast", "standing quickly"],
          },
          {
            at: "2026-05-15T09:05:00.000Z",
            note: "Less frequent after eating earlier in the day.",
            severity: 2,
            status: "improving",
            triggers: ["standing quickly"],
          },
          {
            at: "2026-06-10T12:30:00.000Z",
            note: "Dizzy again after skipping lunch.",
            severity: 4,
            status: "active",
            triggers: ["missed lunch", "hot weather"],
          },
        ],
      },
      {
        name: "Headache",
        symptomKey: "headache",
        points: [
          {
            at: "2026-06-02T17:40:00.000Z",
            note: "Low-grade headache in the afternoon.",
            severity: 2,
            status: "active",
            triggers: ["screen time"],
          },
          {
            at: "2026-06-04T18:25:00.000Z",
            note: "Worse after not drinking enough water.",
            severity: 3,
            status: "active",
            triggers: ["low fluids", "screen time"],
          },
          {
            at: "2026-06-11T16:55:00.000Z",
            note: "Better than last week but still noticeable.",
            severity: 2,
            status: "improving",
            triggers: ["screen time"],
          },
        ],
      },
    ],
  },
  {
    displayName: "Leanne Watkins",
    patientId: toDemoPatientId(2),
    principalId: "pr_portal_demo_patient_3",
    symptomTimelines: [
      {
        name: "Leg cramps",
        symptomKey: "leg_cramps",
        points: [
          {
            at: "2026-05-11T22:15:00.000Z",
            note: "Calf cramps overnight.",
            severity: 2,
            status: "active",
            triggers: ["overnight"],
          },
          {
            at: "2026-06-09T06:50:00.000Z",
            note: "More frequent this week after long walks.",
            severity: 3,
            status: "active",
            triggers: ["long walks", "overnight"],
          },
        ],
      },
      {
        name: "Poor sleep",
        symptomKey: "poor_sleep",
        points: [
          {
            at: "2026-06-01T07:15:00.000Z",
            note: "Taking a long time to get to sleep.",
            severity: 3,
            status: "active",
            triggers: ["stress"],
          },
          {
            at: "2026-06-13T07:00:00.000Z",
            note: "Sleeping a little better after adjusting routine.",
            severity: 2,
            status: "improving",
            triggers: ["stress"],
          },
        ],
      },
    ],
  },
  {
    displayName: "Graham Ellis",
    patientId: toDemoPatientId(3),
    principalId: "pr_portal_demo_patient_4",
    symptomTimelines: [
      {
        name: "Itching",
        symptomKey: "itching",
        points: [
          {
            at: "2026-05-09T20:05:00.000Z",
            note: "Generalised itching after dialysis.",
            severity: 4,
            status: "active",
            triggers: ["after dialysis"],
          },
          {
            at: "2026-05-28T20:45:00.000Z",
            note: "Worst on dialysis days, affecting sleep.",
            severity: 5,
            status: "active",
            triggers: ["after dialysis", "overnight"],
          },
          {
            actorType: "clinician",
            at: "2026-06-07T10:10:00.000Z",
            note: "Slight improvement after skin care advice, still troublesome.",
            severity: 4,
            status: "improving",
            triggers: ["after dialysis", "dry skin"],
          },
          {
            at: "2026-06-15T21:15:00.000Z",
            note: "Flared up again after the last session.",
            severity: 5,
            status: "active",
            triggers: ["after dialysis", "overnight"],
          },
        ],
      },
      {
        name: "Restless legs",
        symptomKey: "restless_legs",
        points: [
          {
            at: "2026-06-03T23:10:00.000Z",
            note: "Struggling to keep legs still at night.",
            severity: 3,
            status: "active",
            triggers: ["overnight"],
          },
          {
            at: "2026-06-10T23:25:00.000Z",
            note: "More noticeable after evening dialysis.",
            severity: 4,
            status: "active",
            triggers: ["evening dialysis", "overnight"],
          },
        ],
      },
      {
        name: "Nausea",
        symptomKey: "nausea",
        points: [
          {
            at: "2026-04-05T09:30:00.000Z",
            note: "Queasy before breakfast.",
            severity: 2,
            status: "active",
            triggers: ["empty stomach"],
          },
          {
            at: "2026-04-07T11:45:00.000Z",
            note: "Resolved after a smaller breakfast.",
            severity: 1,
            status: "resolved",
            triggers: [],
          },
        ],
      },
    ],
  },
  {
    displayName: "Priya Shah",
    patientId: toDemoPatientId(4),
    principalId: "pr_portal_demo_patient_5",
    symptomTimelines: [
      {
        name: "Fatigue",
        symptomKey: "fatigue",
        points: [
          {
            at: "2026-05-25T18:00:00.000Z",
            note: "More tired than usual in the afternoons.",
            severity: 2,
            status: "active",
            triggers: ["busy day"],
          },
          {
            at: "2026-06-04T18:30:00.000Z",
            note: "Needed to lie down after work this week.",
            severity: 3,
            status: "active",
            triggers: ["busy day", "poor sleep"],
          },
          {
            at: "2026-06-13T17:50:00.000Z",
            note: "Energy a bit better after resting more.",
            severity: 2,
            status: "improving",
            triggers: ["busy day"],
          },
        ],
      },
      {
        name: "Hand tremor",
        symptomKey: "hand_tremor",
        points: [
          {
            at: "2026-06-06T08:40:00.000Z",
            note: "Mild tremor before morning tablets.",
            severity: 2,
            status: "active",
            triggers: ["before morning tablets"],
          },
          {
            actorType: "clinician",
            at: "2026-06-14T10:20:00.000Z",
            note: "Tremor still noticeable, monitor around tacrolimus timing.",
            severity: 3,
            status: "active",
            triggers: ["before morning tablets", "after tacrolimus"],
          },
        ],
      },
    ],
  },
];

function buildPatientTimelineDocs(patient: DemoPatient, patientIndex: number) {
  const ledgerDocs: SymptomLedgerEventDoc[] = [];
  const currentDocs = new Map<string, SymptomEntryDoc>();

  for (const timeline of patient.symptomTimelines) {
    const symptomId = makeSymptomId(patientIndex + 1, timeline.symptomKey);
    let previousEntry: SymptomEntryDoc | null = null;
    let currentDocId = new ObjectId();

    for (const point of timeline.points) {
      const actor = makeActor(
        patient.displayName,
        patient.principalId,
        point.actorType ?? "patient",
      );
      const eventAt = new Date(point.at);
      const recordedAt = parseDate(point.recordedAt) ?? eventAt;
      const startedAt =
        point.startedAt === undefined
          ? previousEntry?.startedAt ?? null
          : parseDate(point.startedAt);
      const createdAt = previousEntry?.createdAt ?? eventAt;
      const createdBy = previousEntry?.createdBy ?? actor;
      const after = makeEntry({
        actor,
        createdAt,
        createdBy,
        name: timeline.name,
        note: point.note,
        patientId: patient.patientId,
        recordedAt,
        severity: point.severity,
        source: actor.actorType,
        startedAt,
        status: point.status,
        symptomId,
        triggers: point.triggers ?? previousEntry?.triggers ?? [],
        updatedAt: eventAt,
      });

      after._id = currentDocId;
      const before =
        previousEntry === null
          ? null
          : {
              ...previousEntry,
              _id: currentDocId,
            };

      ledgerDocs.push({
        _id: new ObjectId(),
        after,
        before,
        createdAt: eventAt,
        createdBy: actor,
        eventType: eventTypeForTransition(previousEntry?.status ?? null, after.status),
        orgId: DEMO_ORG_ID,
        patientId: patient.patientId,
        symptomId,
      });

      previousEntry = after;
      currentDocs.set(symptomId, after);
    }
  }

  return {
    currentDocs: Array.from(currentDocs.values()),
    ledgerDocs,
  };
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
    const patientIds = DEMO_PATIENTS.map((patient) => patient.patientId);
    const currentCollection = db.collection<SymptomEntryDoc>(
      COLLECTIONS.SymptomsCurrent,
    );
    const ledgerCollection = db.collection<SymptomLedgerEventDoc>(
      COLLECTIONS.SymptomsLedger,
    );

    await currentCollection.deleteMany({ patientId: { $in: patientIds } });
    await ledgerCollection.deleteMany({ patientId: { $in: patientIds } });

    const currentDocs: SymptomEntryDoc[] = [];
    const ledgerDocs: SymptomLedgerEventDoc[] = [];

    for (const [index, patient] of DEMO_PATIENTS.entries()) {
      const docs = buildPatientTimelineDocs(patient, index);
      currentDocs.push(...docs.currentDocs);
      ledgerDocs.push(...docs.ledgerDocs);
    }

    if (currentDocs.length > 0) {
      await currentCollection.insertMany(currentDocs);
    }
    if (ledgerDocs.length > 0) {
      await ledgerCollection.insertMany(ledgerDocs);
    }

    console.log(
      `[portal:symptoms] seeded ${currentDocs.length} current docs and ${ledgerDocs.length} ledger events for ${DEMO_PATIENTS.length} demo patients`,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error("[portal:symptoms] seed failed");
  console.error(error);
  process.exit(1);
});
