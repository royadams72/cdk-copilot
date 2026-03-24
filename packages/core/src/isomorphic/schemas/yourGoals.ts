import { z } from "zod";
import { PatientGoalCode } from "./patient_goals";

export const YourGoalsSchema = z
  .object({
    selectedGoals: z.array(PatientGoalCode).default([]),
    motivationLevel: z.string(),
    targetTimeline: z.string(),
  })
  .strict();

export type TYourGoals = z.infer<typeof YourGoalsSchema>;
