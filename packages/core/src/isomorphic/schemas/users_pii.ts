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
      message: "Research consent requires privacy consent",
      path: ["consentResearchAt"],
    });
  }
});

export const UserPII_Create = UserPII_Base.pick({
  createdAt: true,
  email: true,
  emailVerifiedAt: true,
  lastActiveAt: true,
  onboardingCompleted: true,
  onboardingSteps: true,
  patientId: true,
  principalId: true,
  pseudonymId: true,
  status: true,
  updatedAt: true,
});

export const UserPII_Update = UserPII_Base.partial();

export const UserPII_Public = UserPII_Base.pick({
  country: true,
  devices: true,
  email: true,
  firstName: true,
  integrations: true,
  language: true,
  lastName: true,
  nhsNumber: true,
  notificationPrefs: true,
  onboardingCompleted: true,
  onboardingSteps: true,
  patientId: true,
  status: true,
  timeZone: true,
  units: true,
});
// --- Form ---
const E164_RE = /^\+[1-9]\d{7,14}$/; // strict E.164
const TimeZone_RE = /^(?:[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?)$/; // basic IANA tz format check

export const PiiForm = z.object({
  dateOfBirth: z
    .string()
    .transform((v) => (v ? new Date(v) : null))
    .refine((v) => v instanceof Date, { message: "Invalid date" })
    .nullable()
    .refine((v) => v !== null, { message: "Please select your date of birth" }),
  ethnicity: z
    .string()
    .nullable()
    .refine((v) => v !== null, { message: "Please select your ethnicity" }),
  firstName: z.string().min(2, "Please enter your firstName"),
  genderIdentity: z.string().nullable(),
  lastName: z.string().min(2, "Please enter your lastName"),
  nhsNumber: z
    .string()
    .transform((value) => value.replace(/\s+/g, ""))
    .nullable()
    .refine((value) => value === null || /^\d{10}$/.test(value), {
      message: "Use a 10 digit NHS number",
    }),
  notificationPrefs: z.object({
    email: z.boolean(),
    push: z.boolean(),
    sms: z.boolean(),
  }),
  phoneE164: z
    .string()
    .regex(E164_RE, "Use a UK number omitting the zero i.e 7911123456")
    .nullable()
    .refine((v) => v !== null, { message: "Please enter a phone number" }),
  sexAtBirth: z
    .enum(["female", "male", "intersex", "unknown", ""])
    .refine((v) => v !== "", { message: "Please select your sex at birth" })
    .transform((v) => v as "female" | "male" | "intersex" | "unknown"),

  units: z.enum(["metric", "imperial"]),
});
export type TPiiInput = z.infer<typeof PiiForm>;
export type TUserPII = z.infer<typeof UserPII_Base>;
export type TUserPIICreate = z.infer<typeof UserPII_Create>;
export type TUserPIIUpdate = z.infer<typeof UserPII_Update>;
export type TUserPIIPublic = z.infer<typeof UserPII_Public>;

export const UserPIIFields = UserPII_Base.keyof().enum;
// Type-safe union of field names
export type UserPIIField = keyof z.infer<typeof UserPII_Common>;
// or: export type UserPIIField = keyof typeof UserPIIFields;
