// If you want Zod validation:
import { z, ZodType } from "zod";

export const NutrientsPer100gSchema = z.object({
  energyKcal: z.number().nullable().optional(),
  protein_g: z.number().nullable().optional(),
  fat_g: z.number().nullable().optional(),
  carbs_g: z.number().nullable().optional(),
  potassium_mg: z.number().nullable().optional(),
  phosphorus_mg: z.number().nullable().optional(),
  sodium_mg: z.number().nullable().optional(),
});
export const NutirentCodesSchema = z.object({
  energyKcal: z.string().nullable().optional(),
  protein_g: z.string().nullable().optional(),
  fat_g: z.string().nullable().optional(),
  carbs_g: z.string().nullable().optional(),
  potassium_mg: z.string().nullable().optional(),
  phosphorus_mg: z.string().nullable().optional(),
  sodium_mg: z.string().nullable().optional(),
});

export const BaseFoodSchema = z.object({
  source: z.enum(["cofid", "usda"]),
  sourceFoodCode: z.string(),
  description: z.string().min(1),
  category: z.string().nullable().optional(),
  searchName: z.string().min(1),
  keywords: z.array(z.string().min(1)),
  nutrientsPer100g: NutrientsPer100gSchema,
  nutirentCodes: NutirentCodesSchema,
});
export type TBaseFoodSchema = z.infer<typeof BaseFoodSchema>;
export type TNutrientsPer100gSchema = z.infer<typeof NutrientsPer100gSchema>;
export type TNutirentCodesSchema = z.infer<typeof NutirentCodesSchema>;
