// lib/schemas/appErrorLogs.ts
import { z } from "zod";
import { dateAsISOString, objectIdHex } from "./common";

export const AppErrorLog = z.object({
  at: dateAsISOString,
  level: z.enum(["error", "warn", "info"]),
  service: z.string().min(1),
  env: z.enum(["local", "dev", "staging", "prod"]),
  orgId: z.string().optional(),
  actorAuthId: z.string().optional(),
  route: z.string().optional(),
  code: z.string().optional(),
  message: z.string().min(1),
  stack: z.string().optional(),
  context: z.record(z.any(), z.unknown()).default({}),
  requestId: z.string().optional(),
  resolvedAt: dateAsISOString.optional(),
  tags: z.array(z.string()).optional(),
});
export type AppErrorLog = z.infer<typeof AppErrorLog>;
