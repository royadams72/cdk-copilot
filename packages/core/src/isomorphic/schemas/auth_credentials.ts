import { z } from "zod";

import { objectIdHex } from "./common";

export const AlgoEnum = z.enum(["argon2id", "scrypt"]).default("argon2id");
export const AuthCredentialsStatusEnum = z
  .enum(["set", "needs_reset", "disabled", "compromised"])
  .default("set");

export const AuthCredentialsParams = z.object({
  m: z.number().int().min(1),
  t: z.number().int().min(1),
  p: z.number().int().min(1),
});

export const AuthCredentialsPasswordHistory = z.object({
  hash: z.string().min(10),
  changedAt: z.date(),
});

export const MfaSchema = z.object({
  totpEnabled: z.boolean(),
  totpSecretEnc: z.string().min(10).optional(), // encrypted only
  recoveryCodes: z.array(z.string().min(10)), // store hashes, not plaintext
});

export const AuthCredentialsSchema = z
  .object({
    _id: objectIdHex, // used as credentialId in auth_links
    provider: z.literal("password"),
    hash: z.string().min(20), // e.g., $argon2id$...
    algo: AlgoEnum,
    params: AuthCredentialsParams,
    passwordStatus: AuthCredentialsStatusEnum,
    passwordUpdatedAt: z.date(),
    passwordHistory: z.array(AuthCredentialsPasswordHistory).optional(),
    failedLoginCount: z.number().int().min(0).default(0),
    lockoutUntil: z.date().optional(),
    mfa: MfaSchema,
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: z.string().min(1), // principalId
    updatedBy: z.string().min(1), // principalId
  })
  .strict();

export type PasswordDoc = z.infer<typeof AuthCredentialsSchema>;
