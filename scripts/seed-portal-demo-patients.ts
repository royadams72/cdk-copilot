import path from "node:path";
import * as dotenv from "dotenv";
import { createHash } from "node:crypto";

import { MongoClient, ObjectId } from "mongodb";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });
dotenv.config({ path: path.join(process.cwd(), ".env") });

const ORG_ID = "org_ckd_portal_demo";
const FACILITY_ID = "facility_newham_renal";
const CARE_TEAM_ID = "careteam_ckd_pilot";
const SEED_NAMESPACE = "portal_demo_seed";
const NOW = new Date();
const DAY_MS = 24 * 60 * 60 * 1000;

type DemoPatientConfig = {
  accessEndsInDays: number | null;
  acrCategory: "A1" | "A2" | "A3";
  allergies: string[];
  ckdStage: "3a" | "3b" | "4" | "5";
  dialysisStatus: "none" | "hemodialysis" | "peritoneal" | "post-transplant";
  disengaged: boolean;
  dob: string;
  egfrCurrent: number;
  email: string;
  facilityId: string;
  firstName: string;
  flags: string[];
  heightCm: number;
  lastContactDaysAgo: number;
  lastName: string;
  medications: Array<{ dose: string; frequency: string; name: string }>;
  notes: string;
  phoneE164: string;
  preferences: string[];
  reviewDue: boolean;
  sexAtBirth: "female" | "male";
  startingWeightKg: number;
  systolicBase: number;
  diastolicBase: number;
  adverseTrend: boolean;
};

const DEMO_PATIENTS: DemoPatientConfig[] = [
  {
    accessEndsInDays: 18,
    acrCategory: "A3",
    allergies: ["NSAIDs"],
    ckdStage: "4",
    dialysisStatus: "none",
    disengaged: false,
    dob: "1971-03-19T00:00:00.000Z",
    egfrCurrent: 24,
    email: "portal-demo-patient-1@eden-grafix.co.uk",
    facilityId: FACILITY_ID,
    firstName: "Aisha",
    flags: ["review-due", "access-ending-soon"],
    heightCm: 163,
    lastContactDaysAgo: 5,
    lastName: "Rahman",
    medications: [
      { dose: "10mg", frequency: "once daily", name: "Ramipril" },
      { dose: "40mg", frequency: "twice daily", name: "Furosemide" },
    ],
    notes: "Blood pressure drifting upward over the last month.",
    phoneE164: "+447700900101",
    preferences: ["low sodium", "renal friendly"],
    reviewDue: true,
    sexAtBirth: "female",
    startingWeightKg: 82.4,
    systolicBase: 148,
    diastolicBase: 92,
    adverseTrend: true,
  },
  {
    accessEndsInDays: null,
    acrCategory: "A2",
    allergies: [],
    ckdStage: "3b",
    dialysisStatus: "none",
    disengaged: true,
    dob: "1965-08-02T00:00:00.000Z",
    egfrCurrent: 34,
    email: "portal-demo-patient-2@eden-grafix.co.uk",
    facilityId: FACILITY_ID,
    firstName: "Michael",
    flags: ["disengaged", "missing-data"],
    heightCm: 175,
    lastContactDaysAgo: 20,
    lastName: "Turner",
    medications: [{ dose: "5mg", frequency: "once daily", name: "Amlodipine" }],
    notes: "Intermittent logging and reduced meal tracking.",
    phoneE164: "+447700900102",
    preferences: ["lower potassium"],
    reviewDue: false,
    sexAtBirth: "male",
    startingWeightKg: 91.2,
    systolicBase: 136,
    diastolicBase: 84,
    adverseTrend: false,
  },
  {
    accessEndsInDays: 11,
    acrCategory: "A1",
    allergies: ["Penicillin"],
    ckdStage: "3a",
    dialysisStatus: "none",
    disengaged: false,
    dob: "1980-11-27T00:00:00.000Z",
    egfrCurrent: 48,
    email: "portal-demo-patient-3@eden-grafix.co.uk",
    facilityId: FACILITY_ID,
    firstName: "Leanne",
    flags: ["access-ending-soon"],
    heightCm: 168,
    lastContactDaysAgo: 2,
    lastName: "Watkins",
    medications: [{ dose: "500mg", frequency: "twice daily", name: "Metformin" }],
    notes: "Stable measurements but pilot access expires soon.",
    phoneE164: "+447700900103",
    preferences: ["diabetes support"],
    reviewDue: false,
    sexAtBirth: "female",
    startingWeightKg: 74.8,
    systolicBase: 124,
    diastolicBase: 78,
    adverseTrend: false,
  },
  {
    accessEndsInDays: null,
    acrCategory: "A3",
    allergies: [],
    ckdStage: "5",
    dialysisStatus: "hemodialysis",
    disengaged: false,
    dob: "1959-01-15T00:00:00.000Z",
    egfrCurrent: 13,
    email: "portal-demo-patient-4@eden-grafix.co.uk",
    facilityId: FACILITY_ID,
    firstName: "Graham",
    flags: ["review-due"],
    heightCm: 179,
    lastContactDaysAgo: 6,
    lastName: "Ellis",
    medications: [
      { dose: "800mg", frequency: "three times daily", name: "Sevelamer" },
      { dose: "5mcg", frequency: "daily", name: "Alfacalcidol" },
    ],
    notes: "Care plan review overdue and phosphate trending high.",
    phoneE164: "+447700900104",
    preferences: ["high protein", "fluid guidance"],
    reviewDue: true,
    sexAtBirth: "male",
    startingWeightKg: 86.1,
    systolicBase: 152,
    diastolicBase: 88,
    adverseTrend: true,
  },
  {
    accessEndsInDays: null,
    acrCategory: "A2",
    allergies: ["Shellfish"],
    ckdStage: "4",
    dialysisStatus: "post-transplant",
    disengaged: false,
    dob: "1976-05-09T00:00:00.000Z",
    egfrCurrent: 29,
    email: "portal-demo-patient-5@eden-grafix.co.uk",
    facilityId: FACILITY_ID,
    firstName: "Priya",
    flags: [],
    heightCm: 160,
    lastContactDaysAgo: 3,
    lastName: "Shah",
    medications: [
      { dose: "1mg", frequency: "twice daily", name: "Tacrolimus" },
      { dose: "5mg", frequency: "once daily", name: "Prednisolone" },
    ],
    notes: "Generally stable transplant follow-up with consistent logging.",
    phoneE164: "+447700900105",
    preferences: ["balanced protein", "post transplant"],
    reviewDue: false,
    sexAtBirth: "female",
    startingWeightKg: 67.5,
    systolicBase: 130,
    diastolicBase: 82,
    adverseTrend: false,
  },
];

type FoodTemplate = {
  canonicalName: string;
  foodId: string;
  majorGroup: string;
  name: string;
  nutrients: {
    caloriesKcal: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    phosphorusMg: number;
    potassiumMg: number;
    proteinG: number;
    sodiumMg: number;
  };
  quantity: number;
  subGroup: string | null;
  swapGroup: string | null;
  tags: string[];
  unit: string;
};

const FOOD_LIBRARY: Record<string, FoodTemplate[]> = {
  breakfast: [
    {
      canonicalName: "Porridge oats",
      foodId: "seed_oats",
      majorGroup: "grains",
      name: "Porridge oats",
      nutrients: {
        caloriesKcal: 220,
        carbsG: 31,
        fatG: 4,
        fiberG: 5,
        phosphorusMg: 160,
        potassiumMg: 180,
        proteinG: 8,
        sodiumMg: 55,
      },
      quantity: 1,
      subGroup: "breakfast cereal",
      swapGroup: "oats",
      tags: ["breakfast", "wholegrain"],
      unit: "bowl",
    },
    {
      canonicalName: "Blueberries",
      foodId: "seed_blueberries",
      majorGroup: "fruit",
      name: "Blueberries",
      nutrients: {
        caloriesKcal: 45,
        carbsG: 11,
        fatG: 0,
        fiberG: 2,
        phosphorusMg: 12,
        potassiumMg: 65,
        proteinG: 1,
        sodiumMg: 1,
      },
      quantity: 1,
      subGroup: "berries",
      swapGroup: "berries",
      tags: ["fruit"],
      unit: "portion",
    },
  ],
  lunch: [
    {
      canonicalName: "Chicken wrap",
      foodId: "seed_chicken_wrap",
      majorGroup: "prepared meal",
      name: "Chicken wrap",
      nutrients: {
        caloriesKcal: 410,
        carbsG: 36,
        fatG: 14,
        fiberG: 4,
        phosphorusMg: 210,
        potassiumMg: 290,
        proteinG: 28,
        sodiumMg: 540,
      },
      quantity: 1,
      subGroup: "wrap",
      swapGroup: "sandwiches",
      tags: ["lunch", "protein"],
      unit: "wrap",
    },
    {
      canonicalName: "Apple",
      foodId: "seed_apple",
      majorGroup: "fruit",
      name: "Apple",
      nutrients: {
        caloriesKcal: 80,
        carbsG: 21,
        fatG: 0,
        fiberG: 4,
        phosphorusMg: 10,
        potassiumMg: 140,
        proteinG: 0,
        sodiumMg: 1,
      },
      quantity: 1,
      subGroup: "pome fruit",
      swapGroup: "fresh-fruit",
      tags: ["fruit"],
      unit: "medium",
    },
  ],
  dinner: [
    {
      canonicalName: "Grilled salmon",
      foodId: "seed_salmon",
      majorGroup: "protein",
      name: "Grilled salmon",
      nutrients: {
        caloriesKcal: 320,
        carbsG: 0,
        fatG: 20,
        fiberG: 0,
        phosphorusMg: 250,
        potassiumMg: 430,
        proteinG: 33,
        sodiumMg: 110,
      },
      quantity: 1,
      subGroup: "fish",
      swapGroup: "lean-protein",
      tags: ["protein", "omega3"],
      unit: "fillet",
    },
    {
      canonicalName: "Rice",
      foodId: "seed_rice",
      majorGroup: "grains",
      name: "Rice",
      nutrients: {
        caloriesKcal: 205,
        carbsG: 45,
        fatG: 1,
        fiberG: 1,
        phosphorusMg: 65,
        potassiumMg: 55,
        proteinG: 4,
        sodiumMg: 3,
      },
      quantity: 1,
      subGroup: "rice",
      swapGroup: "grains",
      tags: ["carb"],
      unit: "portion",
    },
    {
      canonicalName: "Green beans",
      foodId: "seed_green_beans",
      majorGroup: "vegetable",
      name: "Green beans",
      nutrients: {
        caloriesKcal: 35,
        carbsG: 7,
        fatG: 0,
        fiberG: 3,
        phosphorusMg: 28,
        potassiumMg: 170,
        proteinG: 2,
        sodiumMg: 4,
      },
      quantity: 1,
      subGroup: "green vegetables",
      swapGroup: "vegetables",
      tags: ["veg"],
      unit: "portion",
    },
  ],
  snack: [
    {
      canonicalName: "Unsalted crackers",
      foodId: "seed_crackers",
      majorGroup: "snack",
      name: "Unsalted crackers",
      nutrients: {
        caloriesKcal: 120,
        carbsG: 18,
        fatG: 4,
        fiberG: 1,
        phosphorusMg: 40,
        potassiumMg: 30,
        proteinG: 3,
        sodiumMg: 45,
      },
      quantity: 1,
      subGroup: "crackers",
      swapGroup: "snacks",
      tags: ["snack"],
      unit: "packet",
    },
  ],
};

function getMongoUri() {
  return process.env.MONGODB_URI_MIGRATIONS || process.env.MONGODB_URI_APP;
}

function getDbName() {
  return process.env.MONGODB_DB || process.env.DB_NAME || "ckd-copilot";
}

function makePrefixedId(prefix: string, value: string) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 24);
  return `${prefix}_${hex}`;
}

function makeLegacyPrefixedId(prefix: string, value: string) {
  const hex = Buffer.from(value).toString("hex").slice(0, 24).padEnd(24, "0");
  return `${prefix}_${hex}`;
}

function makeEmailLocal(config: DemoPatientConfig, index: number) {
  return `${SEED_NAMESPACE}_${index + 1}_${config.firstName.toLowerCase()}`;
}

function toObjectId(index: number) {
  return new ObjectId((index + 1).toString(16).padStart(24, "0"));
}

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function daysAhead(days: number) {
  return new Date(NOW.getTime() + days * DAY_MS);
}

function round(value: number, places = 1) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function buildAssignment(index: number, config: DemoPatientConfig) {
  const createdAt = daysAgo(60);
  return {
    assignmentId: makePrefixedId("asg", `${SEED_NAMESPACE}_${index + 1}`),
    careTeamId: CARE_TEAM_ID,
    consentStatus: "accepted",
    createdAt,
    endsAt:
      config.accessEndsInDays === null ? null : daysAhead(config.accessEndsInDays),
    facilityId: config.facilityId,
    orgId: ORG_ID,
    startsAt: createdAt,
    status: "active",
    updatedAt: NOW,
  };
}

function buildFoodEntry(
  patientId: ObjectId,
  dayOffset: number,
  mealType: "breakfast" | "lunch" | "dinner" | "snack",
  adverseTrend: boolean,
) {
  const eatenAt = new Date(daysAgo(dayOffset));
  eatenAt.setHours(
    mealType === "breakfast"
      ? 8
      : mealType === "lunch"
        ? 13
        : mealType === "dinner"
          ? 18
          : 16,
    0,
    0,
    0,
  );

  const multiplier = adverseTrend && dayOffset < 20 ? 1.18 : 1;

  const items = FOOD_LIBRARY[mealType].map((template, itemIndex) => {
    const nutrients = {
      ...template.nutrients,
      caloriesKcal: round(template.nutrients.caloriesKcal * multiplier, 0),
      phosphorusMg: round(template.nutrients.phosphorusMg * multiplier, 0),
      potassiumMg: round(template.nutrients.potassiumMg * multiplier, 0),
      proteinG: round(template.nutrients.proteinG * multiplier, 1),
      sodiumMg: round(template.nutrients.sodiumMg * multiplier, 0),
    };

    return {
      foodId: template.foodId,
      name: template.name,
      nutrients: {
        ...nutrients,
        phosphorus_protein_ratio:
          nutrients.proteinG > 0
            ? round(nutrients.phosphorusMg / nutrients.proteinG, 0)
            : 0,
      },
      quantity: template.quantity,
      source: "user",
      taxonomy: {
        canonicalName: template.canonicalName,
        inferredFrom: {
          categoryHint: template.majorGroup,
          exactName: true,
          keywordRules: [],
          nutrientTags: template.tags,
          override: false,
        },
        majorGroup: template.majorGroup,
        normalizedName: template.name.toLowerCase(),
        primarySwapGroup: template.swapGroup,
        secondarySwapGroups: [],
        source: "seed",
        sourceFoodId: template.foodId,
        subGroup: template.subGroup,
        swapGroup: template.swapGroup,
        tags: template.tags,
        taxonomyKey: `${template.majorGroup}:${template.foodId}`,
      },
      uid: `${patientId.toHexString()}_${mealType}_${dayOffset}_${itemIndex}`,
      unit: template.unit,
    };
  });

  const totals = items.reduce(
    (acc, item) => {
      acc.caloriesKcal += item.nutrients.caloriesKcal ?? 0;
      acc.carbsG += item.nutrients.carbsG ?? 0;
      acc.fatG += item.nutrients.fatG ?? 0;
      acc.fiberG += item.nutrients.fiberG ?? 0;
      acc.phosphorusMg += item.nutrients.phosphorusMg ?? 0;
      acc.potassiumMg += item.nutrients.potassiumMg ?? 0;
      acc.proteinG += item.nutrients.proteinG ?? 0;
      acc.sodiumMg += item.nutrients.sodiumMg ?? 0;
      return acc;
    },
    {
      caloriesKcal: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      phosphorusMg: 0,
      potassiumMg: 0,
      proteinG: 0,
      sodiumMg: 0,
    },
  );

  return {
    createdAt: eatenAt,
    eatenAt,
    items,
    mealType,
    notes: "Seeded portal demo nutrition entry",
    orgId: ORG_ID,
    patientId,
    photos: [],
    seedTag: SEED_NAMESPACE,
    status: "active",
    tags: ["portal-demo"],
    totals: {
      ...totals,
      phosphorus_protein_ratio:
        totals.proteinG > 0 ? round(totals.phosphorusMg / totals.proteinG, 0) : 0,
    },
    updatedAt: eatenAt,
  };
}

function buildWeightMeasurement(
  patientId: ObjectId,
  principalId: string,
  config: DemoPatientConfig,
  weekIndex: number,
) {
  const measuredAt = daysAgo(56 - weekIndex * 7);
  measuredAt.setHours(7, 30, 0, 0);
  const delta = config.adverseTrend ? weekIndex * 0.35 : weekIndex * -0.08;
  return {
    createdAt: measuredAt,
    createdBy: principalId,
    kind: "weight",
    measuredAt,
    orgId: ORG_ID,
    patientId,
    receivedAt: measuredAt,
    source: "patient",
    updatedAt: measuredAt,
    updatedBy: principalId,
    valueKg: round(config.startingWeightKg + delta, 1),
  };
}

function buildBloodPressureMeasurement(
  patientId: ObjectId,
  principalId: string,
  config: DemoPatientConfig,
  dayOffset: number,
) {
  const measuredAt = daysAgo(dayOffset);
  measuredAt.setHours(9, 15, 0, 0);
  const adverseTrendFactor = config.adverseTrend && dayOffset < 20 ? 8 : 0;
  return {
    createdAt: measuredAt,
    createdBy: principalId,
    diastolicMmHg: config.diastolicBase + (dayOffset % 3) + Math.round(adverseTrendFactor / 4),
    kind: "blood_pressure",
    measuredAt,
    orgId: ORG_ID,
    patientId,
    pulseBpm: 72 + (dayOffset % 6),
    receivedAt: measuredAt,
    source: "patient",
    systolicMmHg: config.systolicBase + (dayOffset % 5) + adverseTrendFactor,
    updatedAt: measuredAt,
    updatedBy: principalId,
  };
}

function buildStepsMeasurement(
  patientId: ObjectId,
  principalId: string,
  config: DemoPatientConfig,
  dayOffset: number,
) {
  const measuredAt = daysAgo(dayOffset);
  measuredAt.setHours(20, 0, 0, 0);
  const baseline = config.disengaged ? 3200 : 7200;
  const recentDrop = config.disengaged && dayOffset < 14 ? -1400 : 0;
  const count = baseline + ((dayOffset * 137) % 1800) + recentDrop;
  return {
    count: Math.max(1100, count),
    createdAt: measuredAt,
    createdBy: principalId,
    kind: "steps",
    measuredAt,
    orgId: ORG_ID,
    patientId,
    receivedAt: measuredAt,
    source: "patient",
    steps: {
      averageSpeedKph: config.disengaged ? 3.4 : 4.2,
      caloriesKcal: round(Math.max(120, count / 28), 0),
      distanceMeters: round(count * 0.72, 0),
    },
    updatedAt: measuredAt,
    updatedBy: principalId,
  };
}

async function run() {
  const uri = getMongoUri();
  if (!uri) {
    throw new Error("Missing MONGODB_URI_MIGRATIONS or MONGODB_URI_APP");
  }

  const client = new MongoClient(uri);
  await client.connect();

  try {
    const db = client.db(getDbName());

    const patients = db.collection("patients");
    const accounts = db.collection("users_accounts");
    const pii = db.collection("users_pii");
    const clinical = db.collection("users_clinical");
    const measurements = db.collection("measurements_ledger");
    const nutrition = db.collection("nutrition_ledger");

    const seededPatientIds = DEMO_PATIENTS.map((_, index) => toObjectId(index));
    const seededPrincipalIds = DEMO_PATIENTS.map((config, index) =>
      makePrefixedId("pr", makeEmailLocal(config, index)),
    );
    const legacySeededPrincipalIds = DEMO_PATIENTS.map((config, index) =>
      makeLegacyPrefixedId("pr", makeEmailLocal(config, index)),
    );
    const seededEmails = DEMO_PATIENTS.map((config) => config.email.toLowerCase());

    await Promise.all([
      nutrition.deleteMany({ patientId: { $in: seededPatientIds }, seedTag: SEED_NAMESPACE }),
      measurements.deleteMany({ patientId: { $in: seededPatientIds } }),
      clinical.deleteMany({ patientId: { $in: seededPatientIds }, orgId: ORG_ID }),
      pii.deleteMany({ patientId: { $in: seededPatientIds } }),
      accounts.deleteMany({
        principalId: { $in: [...seededPrincipalIds, ...legacySeededPrincipalIds] },
      }),
      patients.deleteMany({ _id: { $in: seededPatientIds } }),
      patients.deleteMany({
        principalId: { $in: [...seededPrincipalIds, ...legacySeededPrincipalIds] },
      }),
      pii.deleteMany({ email: { $in: seededEmails } }),
      pii.deleteMany({
        principalId: { $in: [...seededPrincipalIds, ...legacySeededPrincipalIds] },
      }),
      accounts.deleteMany({ email: { $in: seededEmails } }),
    ]);

    for (const [index, config] of DEMO_PATIENTS.entries()) {
      const patientId = toObjectId(index);
      const principalId = makePrefixedId("pr", makeEmailLocal(config, index));
      const pseudonymId = makePrefixedId("ps", makeEmailLocal(config, index));
      const assignment = buildAssignment(index, config);
      const createdAt = daysAgo(60);
      const lastContactAt = daysAgo(config.lastContactDaysAgo);

      await patients.insertOne({
        _id: patientId,
        assignments: [assignment],
        createdAt,
        flags: config.flags,
        orgId: ORG_ID,
        principalId,
        stage: config.ckdStage,
        summary: {
          dietitianAssigned: true,
          lastContactAt,
        },
        updatedAt: NOW,
      });

      await accounts.insertOne({
        allowedPatientIds: [],
        careTeamIds: [],
        createdAt,
        createdBy: SEED_NAMESPACE,
        email: config.email.toLowerCase(),
        facilityIds: [],
        isActive: true,
        orgId: ORG_ID,
        principalId,
        role: "patient",
        scopes: [],
        updatedAt: NOW,
        updatedBy: SEED_NAMESPACE,
      });

      await pii.insertOne({
        consentAppTosAt: createdAt,
        consentPrivacyAt: createdAt,
        country: "GB",
        createdAt,
        createdBy: SEED_NAMESPACE,
        dataSharingScope: "standard",
        dateOfBirth: new Date(config.dob),
        devices: [],
        email: config.email.toLowerCase(),
        emailVerifiedAt: createdAt,
        ethnicity: "Not stated",
        firstName: config.firstName,
        genderIdentity: null,
        integrations: {},
        language: "en-GB",
        lastActiveAt: lastContactAt,
        lastName: config.lastName,
        notificationPrefs: { email: true, push: true, sms: false },
        onboardingCompleted: true,
        onboardingSteps: ["create_account", "pii", "clinical"],
        orgId: ORG_ID,
        patientId,
        phoneE164: config.phoneE164,
        principalId,
        pseudonymId,
        sexAtBirth: config.sexAtBirth,
        status: "active",
        timeZone: "Europe/London",
        units: "metric",
        updatedAt: NOW,
      });

      await clinical.insertOne({
        acrCategory: config.acrCategory,
        allergies: config.allergies,
        careTeam: [
          {
            contact: "renal.team@bartshealth.nhs.uk",
            name: "CKD Portal Pilot Team",
            org: "Barts Health NHS Trust",
            role: "renal service",
          },
        ],
        ckdStage: config.ckdStage,
        contraindications: config.adverseTrend ? ["Monitor sodium intake"] : [],
        createdAt,
        createdBy: SEED_NAMESPACE,
        diagnoses: [
          { code: "ckd", label: `CKD stage ${config.ckdStage}` },
          { code: "hypertension", label: "Hypertension" },
        ],
        dialysisStatus: config.dialysisStatus,
        dietaryPreferences: config.preferences,
        egfrCurrent: config.egfrCurrent,
        heightCm: config.heightCm,
        lastClinicalUpdateAt: lastContactAt,
        medications: config.medications.map((medication) => ({
          ...medication,
          startedAt: createdAt,
        })),
        notes: config.notes,
        orgId: ORG_ID,
        patientId,
        updatedAt: NOW,
        updatedBy: SEED_NAMESPACE,
        weightKg: config.startingWeightKg,
      });

      const nutritionDocs = [];
      for (let dayOffset = 0; dayOffset < 60; dayOffset += 3) {
        const mealType =
          dayOffset % 12 === 0
            ? "breakfast"
            : dayOffset % 9 === 0
              ? "lunch"
              : dayOffset % 5 === 0
                ? "snack"
                : "dinner";
        nutritionDocs.push(
          buildFoodEntry(patientId, dayOffset, mealType, config.adverseTrend),
        );
      }
      if (nutritionDocs.length > 0) {
        await nutrition.insertMany(nutritionDocs);
      }

      const measurementDocs = [];
      for (let weekIndex = 0; weekIndex < 9; weekIndex += 1) {
        measurementDocs.push(
          buildWeightMeasurement(patientId, principalId, config, weekIndex),
        );
      }
      for (let dayOffset = 0; dayOffset < 60; dayOffset += 4) {
        measurementDocs.push(
          buildBloodPressureMeasurement(patientId, principalId, config, dayOffset),
        );
      }
      for (let dayOffset = 0; dayOffset < 60; dayOffset += 1) {
        measurementDocs.push(
          buildStepsMeasurement(patientId, principalId, config, dayOffset),
        );
      }
      await measurements.insertMany(measurementDocs);
    }

    console.log(
      `Seeded ${DEMO_PATIENTS.length} portal demo patients with 60 days of nutrition and measurement data into ${getDbName()}.`,
    );
  } finally {
    await client.close();
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
