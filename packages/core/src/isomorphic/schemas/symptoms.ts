import { z } from "zod";

import { objectIdHex } from "./common";

export const SymptomSource = z.enum([
  "patient",
  "clinician",
  "dietitian",
  "admin",
  "system",
]);

export const SymptomActor = z
  .object({
    actorType: SymptomSource,
    displayName: z.string().nullable().optional(),
    principalId: z.string().min(1),
  })
  .strict();

export const SymptomStatus = z.enum(["active", "improving", "resolved"]);

export const SymptomTrendDirection = z.enum(["up", "down", "flat", "unknown"]);

const SymptomName = z.string().trim().min(1).max(120);
const SymptomNormalizedName = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9\s/-]*$/);
const SymptomTriggers = z.array(z.string().trim().min(1).max(80)).max(10);

export const SymptomEntry = z
  .object({
    _id: objectIdHex.optional(),
    createdAt: z.coerce.date(),
    createdBy: SymptomActor,
    name: SymptomName,
    normalizedName: SymptomNormalizedName,
    note: z.string().trim().max(1000).nullable().optional(),
    orgId: z.string().min(1).nullable().optional(),
    patientId: objectIdHex,
    recordedAt: z.coerce.date(),
    resolvedAt: z.coerce.date().nullable().optional(),
    severity: z.number().int().min(1).max(5),
    source: SymptomSource,
    startedAt: z.coerce.date().nullable().optional(),
    status: SymptomStatus,
    symptomId: z.string().min(1),
    triggers: SymptomTriggers.default([]),
    updatedAt: z.coerce.date(),
    updatedBy: SymptomActor,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startedAt &&
      value.recordedAt.getTime() < value.startedAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recordedAt must be later than or equal to startedAt",
        path: ["recordedAt"],
      });
    }

    if (value.status === "resolved") {
      if (!value.resolvedAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "resolved symptoms must include resolvedAt",
          path: ["resolvedAt"],
        });
      }
      if (
        value.resolvedAt &&
        value.resolvedAt.getTime() < value.recordedAt.getTime()
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "resolvedAt must be later than or equal to recordedAt",
          path: ["resolvedAt"],
        });
      }
    }

    if (value.status !== "resolved" && value.resolvedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolvedAt can only be set when status is resolved",
        path: ["resolvedAt"],
      });
    }
  });

export const SymptomsCurrent = SymptomEntry;

export const SymptomLedgerEventType = z.enum([
  "created",
  "updated",
  "resolved",
  "reopened",
]);

export const SymptomLedgerEvent = z
  .object({
    _id: objectIdHex.optional(),
    after: SymptomEntry,
    before: SymptomEntry.nullable(),
    createdAt: z.coerce.date(),
    createdBy: SymptomActor,
    eventType: SymptomLedgerEventType,
    orgId: z.string().min(1).nullable().optional(),
    patientId: objectIdHex,
    symptomId: z.string().min(1),
  })
  .strict();

export const CreateSymptomRequest = z
  .object({
    name: SymptomName,
    note: z.string().trim().max(1000).nullable().optional(),
    recordedAt: z.coerce.date().optional(),
    severity: z.number().int().min(1).max(5),
    startedAt: z.coerce.date().nullable().optional(),
    status: SymptomStatus.default("active"),
    triggers: SymptomTriggers.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.startedAt &&
      value.recordedAt &&
      value.recordedAt.getTime() < value.startedAt.getTime()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "recordedAt must be later than or equal to startedAt",
        path: ["recordedAt"],
      });
    }
  });

export const UpdateSymptomRequest = z
  .object({
    note: z.string().trim().max(1000).nullable().optional(),
    recordedAt: z.coerce.date().optional(),
    severity: z.number().int().min(1).max(5).optional(),
    startedAt: z.coerce.date().nullable().optional(),
    status: SymptomStatus.optional(),
    triggers: SymptomTriggers.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be supplied",
  });

export const SymptomHistoryGroup = z
  .object({
    entries: z.array(SymptomEntry).default([]),
    last30dCount: z.number().int().min(0),
    last7dCount: z.number().int().min(0),
    latestNote: z.string().nullable(),
    latestSeverity: z.number().int().min(1).max(5).nullable(),
    name: SymptomName,
    normalizedName: SymptomNormalizedName,
    symptomIds: z.array(z.string().min(1)).default([]),
    trendDirection: SymptomTrendDirection,
  })
  .strict();

export const SymptomLatestNote = z
  .object({
    name: SymptomName,
    note: z.string().nullable(),
    normalizedName: SymptomNormalizedName,
    recordedAt: z.coerce.date().nullable(),
    symptomId: z.string().min(1),
  })
  .strict();

export const ListSymptomsResponse = z
  .object({
    activeSymptoms: z.array(SymptomsCurrent).default([]),
    current: z.array(SymptomsCurrent).default([]),
    history: z.array(SymptomLedgerEvent).default([]),
    recentlyResolvedSymptoms: z.array(SymptomsCurrent).default([]),
  })
  .strict();

export const SymptomClinicianResponse = z
  .object({
    activeSymptoms: z.array(SymptomsCurrent).default([]),
    groupedHistory: z.array(SymptomHistoryGroup).default([]),
    history: z.array(SymptomLedgerEvent).default([]),
    latestNotes: z.array(SymptomLatestNote).default([]),
    patientId: objectIdHex,
    recentlyResolvedSymptoms: z.array(SymptomsCurrent).default([]),
  })
  .strict();

export type TSymptomSource = z.infer<typeof SymptomSource>;
export type TSymptomActor = z.infer<typeof SymptomActor>;
export type TSymptomStatus = z.infer<typeof SymptomStatus>;
export type TSymptomTrendDirection = z.infer<typeof SymptomTrendDirection>;
export type TSymptomEntry = z.infer<typeof SymptomEntry>;
export type TSymptomsCurrent = z.infer<typeof SymptomsCurrent>;
export type TSymptomLedgerEventType = z.infer<typeof SymptomLedgerEventType>;
export type TSymptomLedgerEvent = z.infer<typeof SymptomLedgerEvent>;
export type TSymptomCreateRequest = z.infer<typeof CreateSymptomRequest>;
export type TSymptomUpdateRequest = z.infer<typeof UpdateSymptomRequest>;
export type TSymptomHistoryGroup = z.infer<typeof SymptomHistoryGroup>;
export type TSymptomLatestNote = z.infer<typeof SymptomLatestNote>;
export type TSymptomListResponse = z.infer<typeof ListSymptomsResponse>;
export type TSymptomClinicianResponse = z.infer<
  typeof SymptomClinicianResponse
>;
