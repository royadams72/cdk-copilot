import { z } from "zod";
import { objectIdHex } from "./common";

export const CarePlanStatus = z.enum([
  "draft",
  "active",
  "completed",
  "archived",
]);
export const CarePlanSource = z.enum(["manual", "ai", "template"]);
export const TaskFreq = z.enum(["daily", "weekly", "once"]);
export const TaskStatus = z.enum(["open", "paused", "done"]);

const uuid = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Must be a UUID"
  );

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

export const CarePlanDoc = z.object({
  orgId: z.string().min(1),
  patientId: objectIdHex, // convert to ObjectId before insert
  title: z.string().min(1),
  goals: z.array(CarePlanGoal).default([]),
  tasks: z.array(CarePlanTask).default([]),
  status: CarePlanStatus.default("draft"),
  sources: z.array(CarePlanSource).default(["manual"]),
  notes: z.string().max(4000).optional(),

  // UUID actor IDs
  createdBy: uuid,
  updatedBy: uuid,

  // store as Date in Mongo; coerce inputs
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  activatedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
});
export type CarePlanDoc = z.infer<typeof CarePlanDoc>;
