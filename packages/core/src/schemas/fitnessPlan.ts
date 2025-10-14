// zod-schemas/fitnessPlan.ts
import { z } from "zod";

const Exercise = z.object({
  exercise: z.string(),
  action: z.string(),
  video: z.url().optional(),
});

const Day = z.object({
  day: z.string(), // e.g. "Monday"
  title: z.string(),
  exercises: z.array(Exercise),
});

const TextSection = z.object({
  title: z.string(),
  copy: z.string(),
});

const WeeklySchedule = z.object({
  title: z.string(),
  days: z.array(Day).min(1),
});

export const FitnessPlanSchema = z.object({
  overview: TextSection,
  weeklySchedule: WeeklySchedule,
  nutritionLifestyleTips: z.object({
    title: z.string(),
    tips: z.array(
      z.object({
        tip: z.string(),
        action: z.string(),
      })
    ),
  }),
  conclusion: TextSection,
});

export type TFitnessPlan = z.infer<typeof FitnessPlanSchema>;
