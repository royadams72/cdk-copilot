// lib/schemas/common.ts
import { z } from "zod";

export const objectIdHex = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ObjectId");

export const dateAsISOString = z.string().datetime(); // prefer ISO strings over JS Date at API boundary
export const PrincipalId = z.uuid();
