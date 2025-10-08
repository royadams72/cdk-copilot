// zod-schemas/measurements.ts
import { z } from "zod";

const Source = z.enum(["user", "device", "api", "provider"]); // where it came from

const Base = z.object({
  id: z.string().optional(), // DB id if you attach one client-side
  userId: z.string().min(1), // FK (Foreign Key) → UserPII.id
  measuredAt: z.coerce.date(), // when it actually happened (sample time)
  receivedAt: z.coerce.date().default(() => new Date()), // when we stored it
  source: Source,
  device: z
    .object({
      name: z.string().optional(), // e.g., "Apple Watch S7"
      platform: z.string().optional(), // "iOS", "Android", "Withings"
      externalId: z.string().optional(), // vendor event id to dedupe
    })
    .optional(),
  notes: z.string().optional(),
});

// ---- Vitals / activity ----
const MWeight = Base.extend({
  kind: z.literal("weight"),
  valueKg: z.number().positive().max(500),
});

const MBloodPressure = Base.extend({
  kind: z.literal("blood_pressure"),
  systolicMmHg: z.number().int().min(60).max(260),
  diastolicMmHg: z.number().int().min(30).max(160),
  pulseBpm: z.number().int().min(20).max(250).optional(),
});

const MHeartRate = Base.extend({
  kind: z.literal("heart_rate"),
  bpm: z.number().int().min(20).max(250),
});

const MSteps = Base.extend({
  kind: z.literal("steps"),
  count: z.number().int().min(0).max(200_000),
});

const MSleep = Base.extend({
  kind: z.literal("sleep"),
  durationMin: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  quality: z.enum(["poor", "fair", "good", "excellent"]).optional(),
});

// ---- Labs (keep flexible with units) ----
const MEgfr = Base.extend({
  kind: z.literal("egfr"),
  value: z.number().positive().max(200), // mL/min/1.73m²
  method: z.enum(["CKD-EPI-2009", "CKD-EPI-2021"]).optional(),
  units: z.literal("mL/min/1.73m²").default("mL/min/1.73m²"),
  lab: z
    .object({
      name: z.string().optional(),
      referenceRange: z.string().optional(),
    })
    .optional(),
});

const MCreatinine = Base.extend({
  kind: z.literal("creatinine"),
  value: z.number().positive().max(3000),
  units: z.enum(["µmol/L", "mg/dL"]).default("µmol/L"),
  lab: z
    .object({
      name: z.string().optional(),
      referenceRange: z.string().optional(),
    })
    .optional(),
});

const MACR = Base.extend({
  kind: z.literal("acr"), // Albumin-to-Creatinine Ratio
  value: z.number().positive().max(5000),
  units: z.enum(["mg/g", "mg/mmol"]).default("mg/mmol"),
  category: z.enum(["A1", "A2", "A3"]).optional(),
  lab: z
    .object({
      name: z.string().optional(),
      referenceRange: z.string().optional(),
    })
    .optional(),
});

export const Measurement = z.discriminatedUnion("kind", [
  MWeight,
  MBloodPressure,
  MHeartRate,
  MSteps,
  MSleep,
  MEgfr,
  MCreatinine,
  MACR,
]);

export type TMeasurement = z.infer<typeof Measurement>;
