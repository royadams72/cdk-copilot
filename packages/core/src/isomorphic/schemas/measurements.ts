import { z } from "zod";
import { objectIdHex, PrincipalId } from "./common";

const Source = z.enum(["patient", "device", "api", "provider"]);
const SleepQuality = z.enum(["poor", "fair", "good", "excellent"]);

const DeviceMeta = z
  .object({
    externalId: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    platform: z.string().min(1).optional(),
  })
  .strict();

const Base = z.object({
  createdBy: PrincipalId,
  device: DeviceMeta.optional(),
  kind: z.enum([
    "weight",
    "blood_pressure",
    "heart_rate",
    "steps",
    "exercise",
    "sleep",
  ]),
  measuredAt: z.date(),
  notes: z.string().min(1).optional(),
  orgId: z.string().min(1),
  patientId: objectIdHex,
  receivedAt: z.date(),
  source: Source,
  updatedBy: PrincipalId,
});

// per-kind payloads
const Weight = z.object({
  kind: z.literal("weight"),
  valueKg: z.number().finite().min(10).max(500),
});

const BloodPressure = z
  .object({
    diastolicMmHg: z.number().int().min(20).max(200),
    kind: z.literal("blood_pressure"),
    pulseBpm: z.number().int().min(20).max(240).optional(),
    systolicMmHg: z.number().int().min(40).max(300),
  })
  .refine((o) => o.systolicMmHg > o.diastolicMmHg, {
    message: "systolicMmHg must be greater than diastolicMmHg",
  });

const HeartRate = z.object({
  bpm: z.number().int().min(10).max(250),
  kind: z.literal("heart_rate"),
});
const Steps = z.object({
  count: z.number().int().min(0),
  kind: z.literal("steps"),
});
const Exercise = z.object({
  durationMin: z.number().int().min(0),
  kind: z.literal("exercise"),
});
const Sleep = z.object({
  durationMin: z.number().int().min(0),
  kind: z.literal("sleep"),
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
  createdBy: true,
  receivedAt: true,
  updatedBy: true,
});
export const MeasurementCreate = BaseCreate.and(KindUnion);
