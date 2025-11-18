// packages/core/src/isomorphic/schemas/users_pii.ts
import { z } from "zod";
import { ObjectIdString } from "../../shared/common";
import { UserPII_Common } from "../../shared/users_pii.base";

export const UserPII_Base = UserPII_Common.extend({
  patientId: ObjectIdString, // 24-hex string ONLY
}).superRefine((val, ctx) => {
  if (val.consentResearchAt && !val.consentPrivacyAt) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["consentResearchAt"],
      message: "Research consent requires privacy consent",
    });
  }
});

export const UserPII_Create = UserPII_Base.pick({
  patientId: true,
  email: true,
  onboardingCompleted: true,
  onboardingSteps: true,
  emailVerifiedAt: true,
  lastActiveAt: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  pseudonymId: true,
  principalId: true,
});

export const UserPII_Update = UserPII_Base.partial();

export const UserPII_Public = UserPII_Base.pick({
  patientId: true,
  email: true,
  firstName: true,
  lastName: true,
  country: true,
  timeZone: true,
  units: true,
  language: true,
  onboardingCompleted: true,
  onboardingSteps: true,
  notificationPrefs: true,
  integrations: true,
  devices: true,
  status: true,
});
// --- Form ---
const E164_RE = /^\+[1-9]\d{7,14}$/; // strict E.164
const TimeZone_RE = /^(?:[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/; // basic IANA tz format check

export const PiiForm = z.object({
  phoneE164: z
    .string()
    .regex(E164_RE, "Use E.164, e.g. +447911123456")
    .nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  dateOfBirth: z
    .string()
    .transform((v) => (v ? new Date(v) : null))
    .refine((v) => v === null || v instanceof Date, { message: "Invalid date" })
    .nullable(),
  sexAtBirth: z.enum(["female", "male", "intersex", "unknown"]),
  genderIdentity: z.string().nullable(),
  ethnicity: z.string().nullable(),
  units: z.enum(["metric", "imperial"]),

  notificationPrefs: z.object({
    email: z.boolean(),
    push: z.boolean(),
    sms: z.boolean(),
  }),
});
export type TPiiInput = z.infer<typeof PiiForm>;
export type TUserPII = z.infer<typeof UserPII_Base>;
export type TUserPIICreate = z.infer<typeof UserPII_Create>;
export type TUserPIIUpdate = z.infer<typeof UserPII_Update>;
export type TUserPIIPublic = z.infer<typeof UserPII_Public>;
