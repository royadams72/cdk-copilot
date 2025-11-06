import { z } from "zod";

/** Token types your service issues. Add more as needed. */
export const AuthTokenType = z.enum([
  "oauth_code",
  "email_verify",
  "password_reset",
  "exchange", // optional, if you use this state
]);
export type AuthTokenType = z.infer<typeof AuthTokenType>;

/** Base64url (no padding) helper: id is 16–32 random bytes => 22–43 chars. */
const b64urlRegex = /^[A-Za-z0-9\-_]+$/;
/** Standard Base64 for secretHash; allow = padding. */
const b64Regex =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Scopes are simple strings; adjust if you have a registry. */
const Scope = z.string().min(1);

/** Zod schema (server-side only). */
export const AuthTokenZ = z.object({
  _id: z.any().optional(), // ObjectId at runtime
  type: AuthTokenType,
  /** Public lookup key (base64url, no padding). */
  id: z.string().regex(b64urlRegex).min(22).max(43),
  /** HMAC(pepper, secret) as Base64 (fixed 32 bytes -> 44 chars incl. padding). */
  secretHash: z.string().regex(b64Regex).min(43).max(88),

  /** Subject binding */
  patientId: z.any(), // ObjectId
  principalId: z.string().min(1).optional(), // include if you snapshot issuance
  orgId: z.string().min(1).optional().nullable(),

  /** Flow-specific fields */
  email: z.string().email().optional(),
  clientId: z.string().min(1).optional().nullable(),
  redirectUri: z.string().url().optional().nullable(),
  grantedScopes: z.array(Scope).optional(), // if you snapshot scopes at issuance

  /** Lifecycle */
  createdAt: z.date(),
  expiresAt: z.date(),
  usedAt: z.date().nullable().optional(),
});
export type AuthToken = z.infer<typeof AuthTokenZ>;
