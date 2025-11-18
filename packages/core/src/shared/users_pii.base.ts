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
const IsoCountry2 = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase());
const IanaTz = z
  .string()
  .refine((s) => s.includes("/"), "Use IANA tz like Europe/London");
const LangTag = z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/);

const Device = z.object({
  platform: Platform,
  pushToken: z.string().optional(),
  lastSeenAt: z.coerce.date().optional(),
});

const Integrations = z.object({
  appleHealth: z
    .object({ linked: z.boolean(), lastSyncAt: z.coerce.date().optional() })
    .optional(),
  googleFit: z
    .object({ linked: z.boolean(), lastSyncAt: z.coerce.date().optional() })
    .optional(),
  withings: z
    .object({ linked: z.boolean(), lastSyncAt: z.coerce.date().optional() })
    .optional(),
});

export const UserPII_Common = z.object({
  email: EmailLower,
  orgId: z.string().optional(),
  emailVerifiedAt: z.coerce.date().nullable().optional(),
  phoneE164: E164.nullable().optional(),
  principalId: PrincipalId,

  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.coerce.date().nullable().optional(),
  sexAtBirth: SexAtBirth.optional(),
  genderIdentity: z.string().nullable().optional(),
  ethnicity: z.string().nullable().optional(),

  country: IsoCountry2.default("GB"),
  timeZone: IanaTz.default("Europe/London"),
  units: Units.default("metric"),
  language: LangTag.default("en-GB"),

  onboardingCompleted: z.boolean().default(false),
  onboardingSteps: z.array(z.string()).default([]),

  notificationPrefs: z
    .object({
      email: z.boolean().default(true),
      push: z.boolean().default(true),
      sms: z.boolean().default(false),
    })
    .default({ email: true, push: true, sms: false }),

  integrations: Integrations.default({}),
  devices: z.array(Device).default([]),

  consentAppTosAt: z.coerce.date(),
  consentPrivacyAt: z.coerce.date(),
  consentResearchAt: z.coerce.date().nullable().optional(),

  pseudonymId: PseudonymId,
  dataSharingScope: DataSharingScope.default("standard"),

  lastActiveAt: z.coerce.date().nullable().optional(),
  status: UserStatus.default("active"),
  createdAt: z.coerce.date().optional(),
  createdBy: z.string().optional(),
  requestId: z.string().optional(),
  updatedAt: z.coerce.date().optional(),
});
