import { z } from "zod";
import { dateAsISOString } from "./common";

export const DrugRefDoc = z.object({
  dmplusdCode: z.string().min(1),
  snomedCode: z.string().optional(),
  rxnormCode: z.string().optional(),
  name: z.string().min(1),
  form: z.string().optional(),
  strength: z.string().optional(),
  route: z.string().optional(),
  isBlacklisted: z.boolean().optional(),
  synonyms: z.array(z.string()).default([]),
  atcCode: z.string().optional(),
  sourceVersion: z.string().min(1),
  updatedAt: dateAsISOString,
});
export type DrugRefDoc = z.infer<typeof DrugRefDoc>;
