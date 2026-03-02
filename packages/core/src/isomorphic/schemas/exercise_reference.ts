import { z } from "zod";

export const ExerciseIntensity = z.enum(["light", "moderate", "vigorous"]);

export const ExerciseReference = z
  .object({
    activityCode: z.string().optional(),
    category: z.string().min(1),
    compendiumCode: z.string().min(1),
    exerciseId: z.string().min(1),
    intensity: ExerciseIntensity,
    met: z.number().positive(),
    name: z.string().min(1),
    notes: z.string().optional(),
    source: z
      .object({
        activityCode: z.string().optional(),
        compendium: z.string().min(1),
        url: z.string().url(),
      })
      .strict(),
    units: z
      .object({
        met: z.string().min(1),
      })
      .strict()
      .optional(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export type TExerciseReference = z.infer<typeof ExerciseReference>;
