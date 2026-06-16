import { z } from "zod";
import { objectIdHex, PrincipalId } from "./common";

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
  dueRule: z.string().optional(), // consider .regex(/^RRULE:/i)
  instructions: z.string().max(2000).optional(),
  status: TaskStatus.default("open"),
});

export const CarePlanGoal = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  target: z.record(z.string(), z.unknown()).optional(),
});

export const CarePlanDiagnosis = z.object({
  code: z.string().min(1).optional(),
  key: z.string().min(1),
  label: z.string().min(1),
});

export const CarePlanDoc = z.object({
  orgId: z.string().min(1),
  patientId: objectIdHex, // convert to ObjectId before insert
  title: z.string().min(1),
  diagnoses: z.array(CarePlanDiagnosis).default([]),
  goals: z.array(CarePlanGoal).default([]),
  ownerLabels: z.array(z.string().min(1)).default([]),
  reviewLabel: z.string().min(1).optional(),
  tasks: z.array(CarePlanTask).default([]),
  status: CarePlanStatus.default("draft"),
  sources: z.array(CarePlanSource).default(["manual"]),
  notes: z.string().max(4000).optional(),

  // UUID actor IDs
  createdBy: PrincipalId,
  updatedBy: PrincipalId,

  // store as Date in Mongo; coerce inputs
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  activatedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});
export type CarePlanDoc = z.infer<typeof CarePlanDoc>;
