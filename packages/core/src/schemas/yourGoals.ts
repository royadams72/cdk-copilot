import { z } from "zod";

export const YourGoalsSchema = z
  .object({
    primaryGoal: z.string(),
    secondaryGoal: z.string(),
    motivationLevel: z.string(),
    targetTimeline: z.string(),
  })
  .strict();

export type TYourGoals = z.infer<typeof YourGoalsSchema>;
