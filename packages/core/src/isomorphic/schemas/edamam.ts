import { z } from "zod";

const EdamamNutrientsSchema = z
  .object({
    ENERC_KCAL: z.number().optional(),
    PROCNT: z.number().optional(),
    FAT: z.number().optional(),
    CHOCDF: z.number().optional(),
    FIBTG: z.number().optional(),
  })
  .catchall(z.number());

const EdamamFoodSchema = z.object({
  foodId: z.string(),
  label: z.string(),
  knownAs: z.string().optional(),
  brand: z.string().optional(),
  category: z.string(),
  categoryLabel: z.string(),
  foodContentsLabel: z.string().optional(),
  image: z.url().optional(),
  nutrients: EdamamNutrientsSchema,
});

const EdamamQualifierSchema = z.object({
  uri: z.string(),
  label: z.string(),
});

const EdamamQualifiedMeasureSchema = z.object({
  qualifiers: z.array(EdamamQualifierSchema).min(1),
  weight: z.number(),
});

export const EdamamMeasureSchema = z.object({
  uri: z.string(),
  label: z.string(),
  weight: z.number(),
  qualified: z.array(EdamamQualifiedMeasureSchema).optional(),
});

export const EdamamFoodMeasureSchema = z.object({
  food: EdamamFoodSchema,
  measures: z.array(EdamamMeasureSchema),
});

export type TEdamamNutrients = z.infer<typeof EdamamNutrientsSchema>;
export type TEdamamFood = z.infer<typeof EdamamFoodSchema>;
export type TEdamamQualifier = z.infer<typeof EdamamQualifierSchema>;
export type TEdamamQualifiedMeasure = z.infer<
  typeof EdamamQualifiedMeasureSchema
>;
export type TEdamamMeasure = z.infer<typeof EdamamMeasureSchema>;
export type TEdamamFoodMeasure = z.infer<typeof EdamamFoodMeasureSchema>;
