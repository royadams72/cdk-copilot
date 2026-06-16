import path from "node:path";
import { createHash } from "node:crypto";

import * as dotenv from "dotenv";
import { MongoClient, ObjectId } from "mongodb";

import { COLLECTIONS } from "../packages/core/src/server/constants/collections";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const DEMO_ORG_ID = "org_ckd_portal_demo";
const DEMO_CLINICIAN_PRINCIPAL_ID = "pr_portal_demo_clinician";

type CarePlanStatus = "draft" | "active" | "completed" | "archived";
type CarePlanSource = "manual" | "ai" | "template";
type TaskFreq = "daily" | "weekly" | "once";
type TaskStatus = "open" | "paused" | "done";

type CarePlanGoal = {
  key: string;
  label: string;
  target?: Record<string, unknown>;
};

type CarePlanTask = {
  dueRule?: string;
  freq: TaskFreq;
  instructions?: string;
  key: string;
  label: string;
  status: TaskStatus;
};

type CarePlanDoc = {
  _id: ObjectId;
  activatedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  createdBy: string;
  goals: CarePlanGoal[];
  notes?: string;
  orgId: string;
  patientId: ObjectId;
  sources: CarePlanSource[];
  status: CarePlanStatus;
  tasks: CarePlanTask[];
  title: string;
  updatedAt: Date;
  updatedBy: string;
};

type DemoPlan = {
  activatedAt?: string;
  completedAt?: string;
  createdAt: string;
  goals: CarePlanGoal[];
  notes?: string;
  sources?: CarePlanSource[];
  status: CarePlanStatus;
  tasks: CarePlanTask[];
  title: string;
  updatedAt: string;
};

type DemoPatientPlans = {
  patientId: ObjectId;
  plans: DemoPlan[];
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
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 24);
  return new ObjectId(hex);
}

const DEMO_SEED: DemoPatientPlans[] = [
  {
    patientId: toDemoPatientId(0),
    plans: [
      {
        activatedAt: "2026-04-12T09:00:00.000Z",
        createdAt: "2026-04-10T09:00:00.000Z",
        goals: [
          { key: "fluid_balance", label: "Improve fluid balance" },
          {
            key: "blood_pressure",
            label: "Reduce home blood pressure readings",
            target: { systolicMmHg: 130, diastolicMmHg: 80 },
          },
        ],
        notes: "Focus on ankle swelling and morning blood pressure routine.",
        status: "active",
        tasks: [
          {
            freq: "daily",
            instructions: "Record morning and evening readings.",
            key: "bp_log",
            label: "Log blood pressure twice daily",
            status: "open",
          },
          {
            freq: "daily",
            instructions: "Aim for lower salt evening meals.",
            key: "salt_review",
            label: "Follow lower sodium evening meal plan",
            status: "open",
          },
        ],
        title: "Improve swelling and blood pressure control",
        updatedAt: "2026-05-06T09:30:00.000Z",
      },
      {
        createdAt: "2026-06-08T10:00:00.000Z",
        goals: [{ key: "activity", label: "Increase daily walking tolerance" }],
        notes: "Draft plan pending discussion at next review.",
        status: "draft",
        tasks: [
          {
            freq: "weekly",
            instructions: "Agree walking target with clinician.",
            key: "walk_target",
            label: "Set weekly walking target",
            status: "open",
          },
        ],
        title: "Walking tolerance draft plan",
        updatedAt: "2026-06-10T10:00:00.000Z",
      },
    ],
  },
  {
    patientId: toDemoPatientId(1),
    plans: [
      {
        activatedAt: "2026-04-07T12:00:00.000Z",
        createdAt: "2026-04-05T12:00:00.000Z",
        goals: [
          { key: "dizziness", label: "Reduce dizziness episodes" },
          { key: "hydration", label: "Keep hydration consistent" },
        ],
        notes: "Monitor symptoms while antihypertensive regimen settles.",
        status: "active",
        tasks: [
          {
            freq: "daily",
            instructions: "Write down any dizzy spells and when they happen.",
            key: "symptom_log",
            label: "Track dizziness symptoms",
            status: "open",
          },
          {
            freq: "once",
            instructions: "Review medication timing with renal nurse.",
            key: "med_review",
            label: "Medication timing review",
            status: "done",
          },
        ],
        title: "Stabilise dizziness and daily routine",
        updatedAt: "2026-06-11T16:15:00.000Z",
      },
    ],
  },
  {
    patientId: toDemoPatientId(2),
    plans: [
      {
        activatedAt: "2026-03-24T08:30:00.000Z",
        createdAt: "2026-03-22T08:30:00.000Z",
        completedAt: "2026-05-20T13:00:00.000Z",
        goals: [
          { key: "meal_routine", label: "Build regular meal timing" },
          { key: "gi_symptoms", label: "Reduce stomach upset" },
        ],
        notes: "Completed after symptoms improved and eating pattern settled.",
        status: "completed",
        tasks: [
          {
            freq: "daily",
            instructions: "Take metformin with meals.",
            key: "meal_pairing",
            label: "Pair medication with meals",
            status: "done",
          },
        ],
        title: "Meal timing and GI symptom plan",
        updatedAt: "2026-05-20T13:00:00.000Z",
      },
    ],
  },
  {
    patientId: toDemoPatientId(3),
    plans: [
      {
        activatedAt: "2026-04-06T11:00:00.000Z",
        createdAt: "2026-04-04T11:00:00.000Z",
        goals: [
          { key: "phosphate", label: "Lower phosphate burden" },
          { key: "meal_adherence", label: "Take binders consistently with meals" },
        ],
        notes: "Review due because phosphate remains above target.",
        status: "active",
        tasks: [
          {
            freq: "daily",
            instructions: "Take binders with lunch and dinner.",
            key: "binders",
            label: "Take phosphate binders with meals",
            status: "open",
          },
          {
            freq: "weekly",
            instructions: "Review high-phosphate convenience foods.",
            key: "food_review",
            label: "Review phosphate-heavy food choices",
            status: "paused",
          },
        ],
        title: "Bring phosphate levels down",
        updatedAt: "2026-05-01T10:15:00.000Z",
      },
      {
        activatedAt: "2026-05-29T09:00:00.000Z",
        createdAt: "2026-05-28T09:00:00.000Z",
        completedAt: "2026-06-06T09:00:00.000Z",
        goals: [{ key: "alfacalcidol_review", label: "Complete vitamin D review" }],
        status: "completed",
        tasks: [
          {
            freq: "once",
            instructions: "Confirm completion after specialist review.",
            key: "vitd_complete",
            label: "Close vitamin D treatment plan",
            status: "done",
          },
        ],
        title: "Vitamin D treatment review",
        updatedAt: "2026-06-06T09:00:00.000Z",
      },
    ],
  },
  {
    patientId: toDemoPatientId(4),
    plans: [
      {
        activatedAt: "2026-04-12T09:15:00.000Z",
        createdAt: "2026-04-10T09:15:00.000Z",
        goals: [
          { key: "transplant_meds", label: "Maintain transplant medication adherence" },
          { key: "monitoring", label: "Keep monitoring bloods and symptoms current" },
        ],
        notes: "Plan remains active while tacrolimus dose is being titrated.",
        status: "active",
        tasks: [
          {
            freq: "daily",
            instructions: "Take tacrolimus 12 hours apart without missing doses.",
            key: "tacrolimus",
            label: "Follow tacrolimus schedule",
            status: "open",
          },
          {
            freq: "weekly",
            instructions: "Confirm latest blood results have been reviewed.",
            key: "weekly_review",
            label: "Weekly transplant blood review",
            status: "open",
          },
        ],
        title: "Transplant medication monitoring",
        updatedAt: "2026-06-14T10:45:00.000Z",
      },
    ],
  },
];

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
    const patientIds = DEMO_SEED.map((item) => item.patientId);

    await db
      .collection(COLLECTIONS.CarePlans)
      .deleteMany({ patientId: { $in: patientIds } });

    const docs: CarePlanDoc[] = DEMO_SEED.flatMap((patient, patientIndex) =>
      patient.plans.map((plan, planIndex) => ({
        _id: toObjectId(`care_plan_${patientIndex}_${planIndex}_${plan.title}`),
        ...(plan.activatedAt ? { activatedAt: new Date(plan.activatedAt) } : {}),
        ...(plan.completedAt ? { completedAt: new Date(plan.completedAt) } : {}),
        createdAt: new Date(plan.createdAt),
        createdBy: DEMO_CLINICIAN_PRINCIPAL_ID,
        goals: plan.goals,
        ...(plan.notes ? { notes: plan.notes } : {}),
        orgId: DEMO_ORG_ID,
        patientId: patient.patientId,
        sources: plan.sources ?? ["manual"],
        status: plan.status,
        tasks: plan.tasks,
        title: plan.title,
        updatedAt: new Date(plan.updatedAt),
        updatedBy: DEMO_CLINICIAN_PRINCIPAL_ID,
      })),
    );

    if (docs.length > 0) {
      await db.collection<CarePlanDoc>(COLLECTIONS.CarePlans).insertMany(docs);
    }

    console.log(
      `[portal:care-plans] seeded ${docs.length} care plans for ${patientIds.length} demo patients`,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error("[portal:care-plans] seed failed");
  console.error(error);
  process.exit(1);
});
