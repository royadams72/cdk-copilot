import { z } from "zod";

/** Enums */
export const SexAtBirth = z.enum(["female", "male", "intersex", "unknown"]);
export const Units = z.enum(["metric", "imperial"]);
export const AuthProvider = z.enum([
  "password",
  "google",
  "apple",
  "auth0",
  "github",
]);
export const DataSharingScope = z.enum(["minimal", "standard", "broad"]);
export const Platform = z.enum(["ios", "android", "web"]);
export const UserStatus = z.enum(["active", "suspended", "deleted"]);

/** Helpers */
const EmailLower = z
  .string()
  .email()
  .transform((e) => e.toLowerCase());
const E164 = z
  .string()
  .regex(/^\+?[1-9]\d{1,14}$/, "Use E.164 format, e.g. +447911123456");
const IsoCountry2 = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase());
const IanaTz = z
  .string()
  .refine((s) => s.includes("/"), "Use IANA timezone, e.g. Europe/London");
const LangTag = z
  .string()
  .regex(/^[a-z]{2}(-[A-Z]{2})?$/, "Use BCP-47 tag, e.g. en or en-GB");

/** Sub-schemas */
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

/** Base */
export const UserPII_Base = z
  .object({
    id: z.string().optional(), // internal Primary Key (PK) (server-generated)
    email: EmailLower,
    orgId: z.string().optional(),
    emailVerifiedAt: z.coerce.date().nullable().optional(),
    passwordHash: z.string().min(10).optional(), // required if authProvider = password
    authProvider: AuthProvider,
    authProviderId: z.string().nullable().optional(),
    phoneE164: E164.nullable().optional(),

    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.coerce.date().nullable().optional(),
    sexAtBirth: SexAtBirth.optional(),
    genderIdentity: z.string().nullable().optional(),
    ethnicity: z.string().nullable().optional(), // collect only with explicit opt-in

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

    // Consent & research
    consentAppTosAt: z.coerce.date(), // TOS = Terms of Service
    consentPrivacyAt: z.coerce.date(),
    consentResearchAt: z.coerce.date().nullable().optional(),
    pseudonymId: z.string().min(10), // pseudonymous analytics/research ID
    dataSharingScope: DataSharingScope.default("standard"),

    // System
    lastActiveAt: z.coerce.date().nullable().optional(),
    status: UserStatus.default("active"),
    createdAt: z.coerce.date().optional(),
    createdBy: z.string().optional(),
    requestId: z.string().optional(),
    updatedAt: z.coerce.date().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.authProvider === "password" && !val.passwordHash) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["passwordHash"],
        message: "passwordHash required for password auth",
      });
    }
    if (val.consentResearchAt && !val.consentPrivacyAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consentResearchAt"],
        message: "Research consent requires privacy consent",
      });
    }
  });

/** Variants */
export const UserPII_Create = UserPII_Base.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const UserPII_Update = UserPII_Base.partial();
export const UserPII_Public = UserPII_Base.pick({
  id: true,
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

export type TUserPII = z.infer<typeof UserPII_Base>;
export type TUserPIICreate = z.infer<typeof UserPII_Create>;
export type TUserPIIUpdate = z.infer<typeof UserPII_Update>;
export type TUserPIIPublic = z.infer<typeof UserPII_Public>;
