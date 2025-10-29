import { z } from "zod";
import { objectIdHex } from "./common";

/** DNS-safe slug: a–z, 0–9, -, 3–63 chars, no leading/trailing hyphen, no double hyphens */
export const OrgSlug = z
  .string()
  .min(3)
  .max(63)
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/);

export const OrgStatus = z.enum(["active", "suspended"]);
export const PrincipalId = z.string().min(1); // or z.string().uuid()

// Aliases: array of valid slugs, unique within the array
export const OrgAliases = z
  .array(OrgSlug)
  .default([])
  .transform((a) => Array.from(new Set(a)));

export const Org_Base = z
  .object({
    _id: objectIdHex.optional(),
    slug: OrgSlug,
    aliases: OrgAliases, // must not contain slug
    name: z.string().min(1),
    status: OrgStatus,
    createdAt: z.date(),
    updatedAt: z.date(),
    createdBy: PrincipalId,
    updatedBy: PrincipalId,
  })
  .check((ctx) => {
    const v = ctx.value;
    if (v.aliases?.includes(v.slug)) {
      ctx.issues.push({
        code: "custom",
        path: ["aliases"],
        message: "aliases must not include slug",
        input: v.aliases,
      });
    }
  });

export const Org_Create = Org_Base.omit({
  _id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
  updatedBy: true,
});

export const Org_Update = z.object({
  // keep slug immutable by default; perform renames via a dedicated endpoint using the policy above
  name: z.string().min(1).optional(),
  status: OrgStatus.optional(),
  aliases: OrgAliases.optional().superRefine((aliases, ctx) => {
    // (optional) prevent duplicates here too, though transform already de-dupes
    if (aliases && new Set(aliases).size !== aliases.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "aliases must be unique",
      });
    }
  }),
});
