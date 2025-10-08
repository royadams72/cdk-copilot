// zod-schemas/aboutYou.ts
import { z } from "zod";

export const AboutYouSchema = z.object({
  experienceLevel: z.string(),
  alcoholConsumption: z.string(),
  gender: z.string(),
  age: z.string(), // keep as string if your form stores strings
  height: z.string(),
  weight: z.string(),
  bodyType: z.string(),
  stressLevel: z.string(),
  smoking: z.string(),
  activityLevel: z.string(),
});
export type TAboutYou = z.infer<typeof AboutYouSchema>;
