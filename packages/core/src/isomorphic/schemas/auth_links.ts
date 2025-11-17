import { z } from "zod";
import { objectIdHex } from "./common";

/**
 * Providers you support today.
 * Add new ones here and in the Mongo validator when you expand.
 */
export const AuthLinkProvider = z.enum([
  "password",
  "apple",
  "google",
  "nhs",
  "azuread",
  "magic",
]);

/**
 * Very light email check; keep server-side normalization (lowercase/trim).
 */
export const EmailString = z.email().transform((s) => s.trim().toLowerCase());

/**
 * Core schema for an auth link (credential ↔ principal mapping).
 * Use at API boundary.
 */
export const AuthLinkBase = z.object({
  provider: AuthLinkProvider,
  credentialId: z.uuid(), // goes into JWT `sub`
  principalId: z.uuid(), // stable person id (acc_… / pat_…)
  email: EmailString.optional(),
  providerSubject: z.string().min(1).optional(),
  active: z.boolean().default(true),
  createdAt: z.coerce.date(),
  deactivatedAt: z.coerce.date().optional(),
});

/**
 * Create payload (server will set createdAt if omitted).
 */
export const AuthLinkCreate = AuthLinkBase.partial({
  createdAt: true,
}).strict();

/**
 * Update payload: only allow limited fields to change.
 * Typically you’ll toggle active and set deactivatedAt, or update email.
 */
export const AuthLinkUpdate = z
  .object({
    email: EmailString.optional(),
    // rotation / revoke
    active: z.boolean().optional(),
    deactivatedAt: z.coerce.date().optional(),
  })
  .strict();

/**
 * Full DB shape including _id (when reading from Mongo).
 */
export const AuthLinkDb = AuthLinkBase.extend({
  _id: objectIdHex, // ObjectId; use a branded type in your codebase if you have one
});

export type TAuthLinkProvider = z.infer<typeof AuthLinkProvider>;
export type TAuthLinkBase = z.infer<typeof AuthLinkBase>;
export type TAuthLinkCreate = z.infer<typeof AuthLinkCreate>;
export type TAuthLinkUpdate = z.infer<typeof AuthLinkUpdate>;
export type TAuthLinkDb = z.infer<typeof AuthLinkDb>;
