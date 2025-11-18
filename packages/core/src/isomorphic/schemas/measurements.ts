import { z } from "zod";
import { objectIdHex, PrincipalId } from "./common";

const Source = z.enum(["patient", "device", "api", "provider"]);
const SleepQuality = z.enum(["poor", "fair", "good", "excellent"]);

const DeviceMeta = z
  .object({
    name: z.string().min(1).optional(),
    platform: z.string().min(1).optional(),
    externalId: z.string().min(1).optional(),
  })
  .strict();

const Base = z.object({
  kind: z.enum([
    "weight",
    "blood_pressure",
    "heart_rate",
    "steps",
    "exercise",
    "sleep",
  ]),
  patientId: objectIdHex,
  orgId: z.string().min(1),
  measuredAt: z.date(),
  receivedAt: z.date(),
  source: Source,
  device: DeviceMeta.optional(),
  notes: z.string().min(1).optional(),
  createdBy: PrincipalId,
  updatedBy: PrincipalId,
});

// per-kind payloads
const Weight = z.object({
  kind: z.literal("weight"),
  valueKg: z.number().finite().min(10).max(500),
});

const BloodPressure = z
  .object({
    kind: z.literal("blood_pressure"),
    systolicMmHg: z.number().int().min(40).max(300),
    diastolicMmHg: z.number().int().min(20).max(200),
    pulseBpm: z.number().int().min(20).max(240).optional(),
  })
  .refine((o) => o.systolicMmHg > o.diastolicMmHg, {
    message: "systolicMmHg must be greater than diastolicMmHg",
  });

const HeartRate = z.object({
  kind: z.literal("heart_rate"),
  bpm: z.number().int().min(10).max(250),
});
const Steps = z.object({
  kind: z.literal("steps"),
  count: z.number().int().min(0),
});
const Exercise = z.object({
  kind: z.literal("exercise"),
  durationMin: z.number().int().min(0),
});
const Sleep = z.object({
  kind: z.literal("sleep"),
  durationMin: z.number().int().min(0),
  quality: SleepQuality.optional(),
});

const KindUnion = z.discriminatedUnion("kind", [
  Weight,
  BloodPressure,
  HeartRate,
  Steps,
  Exercise,
  Sleep,
]);

export const Measurement = Base.and(KindUnion);

// Create schema: drop server-set fields BEFORE intersecting
const BaseCreate = Base.omit({
  receivedAt: true,
  createdBy: true,
  updatedBy: true,
});
export const MeasurementCreate = BaseCreate.and(KindUnion);
