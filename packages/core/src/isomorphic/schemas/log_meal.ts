import { z } from "zod";
import { EdamamFoodMeasureSchema } from "./edamam";

export const LogMealItemSchema = z.object({
  original: z.string(),
  normalised: z.string(),
  quantity: z.number(),
  unit: z.string().nullable(),
  food: z.string(),
});

export const LogMealNormalisedSchema = z.object({
  mealText: z.string(),
  items: z.array(LogMealItemSchema).min(1),
});

export const LogMealResponseItemSchema = z.object({
  item: LogMealItemSchema,
  matches: z.array(EdamamFoodMeasureSchema).nullable(),
});

export const LogMealEdamamResponseSchema = z.object({
  items: z.array(LogMealResponseItemSchema),
  requestId: z.string(),
});

export type TLogMealItem = z.infer<typeof LogMealItemSchema>;
export type TLogMealNormalised = z.infer<typeof LogMealNormalisedSchema>;
export type TLogMealResponseItem = z.infer<typeof LogMealResponseItemSchema>;
export type TLogMealEdamamResponse = z.infer<typeof LogMealEdamamResponseSchema>;
