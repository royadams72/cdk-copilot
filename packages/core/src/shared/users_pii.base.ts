// packages/core/src/shared/users_pii.base.ts
import { z } from "zod";
import {
  EmailLower,
  PrincipalId, // e.g. pr_<24hex> (your prefixed-hex validator)
  PseudonymId,
} from "./common"; // ensure this file has NO node/mongo deps

export const SexAtBirth = z.enum(["female", "male", "intersex", "unknown"]);
export const Units = z.enum(["metric", "imperial"]);
export const DataSharingScope = z.enum(["minimal", "standard", "broad"]);
export const Platform = z.enum(["ios", "android", "web"]);
export const UserStatus = z.enum(["active", "suspended", "deleted"]);

const E164 = z.string().regex(/^\+?[1-9]\d{1,14}$/, "Use E.164 format");
const NhsNumber = z.string().regex(/^\d{10}$/, "Use a 10 digit NHS number");
const IsoCountry2 = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase());
const IanaTz = z
  .string()
  .refine((s) => s.includes("/"), "Use IANA tz like Europe/London");
const LangTag = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);

const Device = z.object({
  lastSeenAt: z.coerce.date().optional(),
  platform: Platform,
  pushToken: z.string().optional(),
});

const Integrations = z.object({
  appleHealth: z
    .object({ lastSyncAt: z.coerce.date().optional(), linked: z.boolean() })
    .optional(),
  googleFit: z
    .object({ lastSyncAt: z.coerce.date().optional(), linked: z.boolean() })
    .optional(),
  withings: z
    .object({ lastSyncAt: z.coerce.date().optional(), linked: z.boolean() })
    .optional(),
});

export const UserPII_Common = z.object({
  consentAppTosAt: z.coerce.date(),
  consentPrivacyAt: z.coerce.date(),
  consentResearchAt: z.coerce.date().nullable().optional(),
  country: IsoCountry2.default("GB"),
  createdAt: z.coerce.date().optional(),

  createdBy: z.string().optional(),
  dataSharingScope: DataSharingScope.default("standard"),
  dateOfBirth: z.coerce.date().nullable().optional(),
  devices: z.array(Device).default([]),
  email: EmailLower,
  emailVerifiedAt: z.coerce.date().nullable().optional(),

  ethnicity: z.string().nullable().optional(),
  firstName: z.string().optional(),
  genderIdentity: z.string().nullable().optional(),
  integrations: Integrations.default({}),

  language: LangTag.default("en-GB"),
  lastActiveAt: z.coerce.date().nullable().optional(),

  lastName: z.string().optional(),
  nhsNumber: NhsNumber.nullable().optional(),

  notificationPrefs: z
    .object({
      email: z.boolean().default(true),
      push: z.boolean().default(true),
      sms: z.boolean().default(false),
    })
    .default({ email: true, push: true, sms: false }),
  onboardingCompleted: z.boolean().default(false),

  onboardingSteps: z.array(z.string()).default([]),
  orgId: z.string().optional(),
  phoneE164: E164.nullable().optional(),

  principalId: PrincipalId,
  pseudonymId: PseudonymId,

  requestId: z.string().optional(),
  sexAtBirth: SexAtBirth.optional(),
  status: UserStatus.default("active"),
  timeZone: IanaTz.default("Europe/London"),
  units: Units.default("metric"),
  updatedAt: z.coerce.date().optional(),
});
