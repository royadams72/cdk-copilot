import { z } from "zod";

export const TaxonomyMajorGroup = z.enum([
  "protein",
  "dairy",
  "grain",
  "fruit_veg",
  "drink",
  "snack",
  "condiment",
  "mixed",
  "dessert",
  "other",
]);

export const FoodTaxonomySource = z.enum([
  "edamam",
  "user",
  "barcode",
  "image_ai",
  "manual",
  "system",
  "unknown",
]);

export const FoodTaxonomyInferredFrom = z
  .object({
    override: z.boolean().default(false),
    exactName: z.boolean().default(false),
    keywordRules: z.array(z.string()).default([]),
    categoryHint: z.string().nullable().default(null),
    nutrientTags: z.array(z.string()).default([]),
  })
  .strict();

export const FoodTaxonomySnapshot = z
  .object({
    source: FoodTaxonomySource,
    sourceFoodId: z.string().min(1),
    taxonomyKey: z.string().min(1),
    canonicalName: z.string().min(1),
    normalizedName: z.string().min(1),
    majorGroup: TaxonomyMajorGroup,
    subGroup: z.string().nullable().default(null),
    swapGroup: z.string().nullable().default(null),
    primarySwapGroup: z.string().nullable().default(null),
    secondarySwapGroups: z.array(z.string()).default([]),
    tags: z.array(z.string()).default([]),
    inferredFrom: FoodTaxonomyInferredFrom,
  })
  .strict();

export const FoodTaxonomyDocument = FoodTaxonomySnapshot.extend({
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
}).strict();

export type TTaxonomyMajorGroup = z.infer<typeof TaxonomyMajorGroup>;
export type TFoodTaxonomySource = z.infer<typeof FoodTaxonomySource>;
export type TFoodTaxonomyInferredFrom = z.infer<
  typeof FoodTaxonomyInferredFrom
>;
export type TFoodTaxonomySnapshot = z.infer<typeof FoodTaxonomySnapshot>;
export type TFoodTaxonomyDocument = z.infer<typeof FoodTaxonomyDocument>;
