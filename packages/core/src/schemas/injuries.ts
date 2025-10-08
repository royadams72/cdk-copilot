// zod-schemas/injuries.ts
import { z } from "zod";

export const InjuriesSchema = z.object({
  upperBody: z.string(),
  lowerBody: z.string(),
  generalConditions: z.string(),
  medicalRestrictions: z.string(),
  foodAllergies: z.string(),
  otherSensitivities: z.string(),
});
export type TInjuries = z.infer<typeof InjuriesSchema>;
