import { z } from "zod";
import { objectIdHex } from "./common";
import { InjuriesSchema } from "./injuries";
import { AboutYouSchema } from "./about_you";
import { PreferencesSchema } from "./preferences";
import { YourGoalsSchema } from "./yourGoals";

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
// { aboutYou, injuries, yourGoals, preferences}
const Form = z.object({
  aboutYou: AboutYouSchema,
  injuries: InjuriesSchema,
  yourGoals: YourGoalsSchema,
  preferences: PreferencesSchema,
});

export const FitnessPlanSchema = z.object({
  patientId: objectIdHex,
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
  form: Form,
});

export type TFitnessPlan = z.infer<typeof FitnessPlanSchema>;
