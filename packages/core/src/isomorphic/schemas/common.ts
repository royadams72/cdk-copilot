// lib/schemas/common.ts
import { z } from "zod";

export const objectIdHex = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

export const dateAsISOString = z.iso.datetime(); // prefer ISO strings over JS Date at API boundary

const HEX24 = /^[a-f0-9]{24}$/i;

export const ObjectIdString = z.string().regex(HEX24, "Expected 24-char hex");

export const makePrefixedHexId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[a-f0-9]{24}$`, "i"));

export const PrincipalId = makePrefixedHexId("pr"); // pr_<24hex>
export const CredentialId = makePrefixedHexId("cred"); // cred_<24hex>
export const PseudonymId = makePrefixedHexId("ps"); // ps_<24hex>

export const EmailLower = z.email().transform((e) => e.toLowerCase());
