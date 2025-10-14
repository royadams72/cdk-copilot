// lib/schemas/carePlans.ts
import { z } from "zod";
import { objectIdHex, dateAsISOString } from "./common";

export const CarePlanStatus = z.enum([
  "draft",
  "active",
  "completed",
  "archived",
]);
export const CarePlanSource = z.enum(["manual", "ai", "template"]);
export const TaskFreq = z.enum(["daily", "weekly", "once"]);
export const TaskStatus = z.enum(["open", "paused", "done"]);

export const CarePlanTask = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  freq: TaskFreq,
  dueRule: z.string().optional(), // RRULE if you use one
  instructions: z.string().optional(),
  status: TaskStatus.default("open"),
});

export const CarePlanGoal = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  target: z.record(z.string(), z.unknown()).optional(),
});

export const CarePlanDoc = z.object({
  orgId: z.string().min(1),
  patientId: objectIdHex,
  ownerUserId: z.string().min(1),
  title: z.string().min(1),
  goals: z.array(CarePlanGoal).default([]),
  tasks: z.array(CarePlanTask).default([]),
  status: CarePlanStatus.default("draft"),
  sources: z.array(CarePlanSource).default(["manual"]),
  notes: z.string().optional(),
  createdAt: dateAsISOString,
  updatedAt: dateAsISOString,
  activatedAt: dateAsISOString.optional(),
  completedAt: dateAsISOString.optional(),
});
export type CarePlanDoc = z.infer<typeof CarePlanDoc>;
