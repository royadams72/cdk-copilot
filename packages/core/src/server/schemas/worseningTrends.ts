import { z } from "zod";

import {
  PatientWorseningTrendCheckIn,
  WorseningEscalationLevel,
  WorseningTrendKey,
} from "../../isomorphic/constants/worseningTrends";

export const WorseningTrendStatus = z.enum(["active", "resolved"]);

export type WorseningTrendStatus = z.infer<typeof WorseningTrendStatus>;

export const WorseningTrendStateDocSchema = z.object({
  _id: z.any().optional(),
  body: z.string(),
  detail: z.string().nullable().default(null),
  episodeId: z.string().min(1),
  firstDetectedAt: z.date(),
  key: WorseningTrendKey,
  lastDetectedAt: z.date(),
  level: WorseningEscalationLevel,
  patientId: z.any(),
  portalEscalationEligible: z.boolean(),
  repeatAtLocalTime: z.string().nullable().default(null),
  repeatUntil: z.string().nullable().default(null),
  resolvedAt: z.date().nullable().optional(),
  screen: z.string().min(1),
  status: WorseningTrendStatus,
  title: z.string(),
  updatedAt: z.date(),
  viewedAt: z.date().nullable().optional(),
});

export type TWorseningTrendStateDoc = z.infer<
  typeof WorseningTrendStateDocSchema
>;

export const WorseningTrendCheckInDocSchema = PatientWorseningTrendCheckIn.omit(
  {
    createdAt: true,
    patientId: true,
    submittedAt: true,
    updatedAt: true,
  },
).extend({
  _id: z.any().optional(),
  createdAt: z.date(),
  patientId: z.any(),
  submittedAt: z.date(),
  updatedAt: z.date(),
});

export type TWorseningTrendCheckInDoc = z.infer<
  typeof WorseningTrendCheckInDocSchema
>;
