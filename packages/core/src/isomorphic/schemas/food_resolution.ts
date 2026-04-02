import { z } from "zod";

export const FoodSource = z.enum(["open_food_facts", "cofid", "merged"]);
export const QueryKind = z.enum([
  "generic",
  "branded",
  "mixed",
  "meal_like",
  "unknown",
]);
export const MappingMethod = z.enum([
  "manual",
  "auto_rule",
  "auto_similarity",
  "direct_generic",
]);
export const MappingStatus = z.enum([
  "pending",
  "reviewed",
  "rejected",
  "not_needed",
]);
export const NutrientSource = z.enum([
  "open_food_facts_label",
  "cofid_reference",
  "merged",
  "unknown",
]);
export const ResolutionConfidence = z.enum(["high", "medium", "low"]);
export const ResolutionPath = z.enum([
  "off_only",
  "off_plus_cofid",
  "cofid_generic",
]);

export const FoodSearchHintsSchema = z
  .object({
    brand: z.string().trim().min(1).optional(),
    foodParts: z.array(z.string().trim().min(1)).optional(),
    grams: z.number().positive().max(5000).optional(),
    preparation: z.string().trim().min(1).optional(),
    servingText: z.string().trim().min(1).optional(),
  })
  .strict()
  .optional();

export const FoodSearchInputSchema = z
  .object({
    query: z.string().trim().min(1),
    normalizedText: z.string().trim().min(1),
    hints: FoodSearchHintsSchema,
  })
  .strict();

export const FoodNutrientsSchema = z
  .object({
    caloriesKcal: z.number().nonnegative().optional(),
    carbsG: z.number().nonnegative().optional(),
    fatG: z.number().nonnegative().optional(),
    fiberG: z.number().nonnegative().optional(),
    phosphorusMg: z.number().nonnegative().optional(),
    potassiumMg: z.number().nonnegative().optional(),
    proteinG: z.number().nonnegative().optional(),
    sodiumMg: z.number().nonnegative().optional(),
  })
  .strict();

export const OpenFoodFactsCandidateSchema = z
  .object({
    barcode: z.string().trim().min(1).nullable(),
    brand: z.string().trim().min(1).nullable(),
    categories: z.array(z.string()).default([]),
    countries: z.array(z.string()).default([]),
    imageUrl: z.string().url().nullable(),
    normalizedName: z.string().trim().min(1),
    nutrimentsQualityWarnings: z.array(z.string()).default([]),
    nutrientsPer100g: FoodNutrientsSchema,
    productName: z.string().trim().min(1),
    quantity: z.string().trim().min(1).nullable(),
    servingSize: z.string().trim().min(1).nullable(),
    source: z.literal("open_food_facts").default("open_food_facts"),
    ukMarketMatch: z.boolean().default(false),
  })
  .strict();

export const CofidNutrientProfileSchema = z
  .object({
    category: z.string().nullable().optional(),
    foodCode: z.string().trim().min(1),
    foodName: z.string().trim().min(1),
    keywords: z.array(z.string()).default([]),
    normalizedName: z.string().trim().min(1),
    nutrientsPer100g: FoodNutrientsSchema,
    source: z.literal("cofid").default("cofid"),
  })
  .strict();

export const FoodMappingRecordSchema = z
  .object({
    _id: z.any().optional(),
    barcode: z.string().trim().min(1).nullable(),
    brand: z.string().trim().min(1).nullable(),
    cofidMatch: z.object({
      foodCode: z.string().trim().min(1),
      foodName: z.string().trim().min(1),
    }),
    confidence: ResolutionConfidence,
    createdAt: z.coerce.date(),
    mappingMethod: MappingMethod,
    mappingStatus: MappingStatus,
    normalizedName: z.string().trim().min(1),
    productName: z.string().trim().min(1),
    source: z.literal("open_food_facts"),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const NutrientProvenanceEntrySchema = z
  .object({
    confidence: ResolutionConfidence,
    nutrient: z.string().trim().min(1),
    source: NutrientSource,
    value: z.number().nonnegative().nullable(),
  })
  .strict();

export const ResolvedFoodCandidateSchema = z
  .object({
    barcode: z.string().trim().min(1).nullable().optional(),
    brand: z.string().trim().min(1).nullable().optional(),
    displayName: z.string().trim().min(1),
    matchScore: z.number(),
    normalizedName: z.string().trim().min(1),
    nutrientsPer100g: FoodNutrientsSchema,
    source: FoodSource,
  })
  .strict();

export const ResolvedFoodResultSchema = z
  .object({
    alternatives: z.array(ResolvedFoodCandidateSchema),
    ambiguityFlags: z.array(z.string()).default([]),
    confidence: ResolutionConfidence,
    normalizedQuery: z.string().trim().min(1),
    nutrients: FoodNutrientsSchema,
    provenance: z.array(NutrientProvenanceEntrySchema),
    query: z.string().trim().min(1),
    queryKind: QueryKind,
    resolutionPath: ResolutionPath,
    selectedResult: ResolvedFoodCandidateSchema.extend({
      estimated: z.boolean().default(false),
      offBarcode: z.string().trim().min(1).nullable().optional(),
      resolutionNotes: z.array(z.string()).default([]),
    }),
  })
  .strict();

export const FoodSearchApiRequestSchema = FoodSearchInputSchema;

export const FoodSearchApiResponseSchema = z
  .object({
    requestId: z.string().trim().min(1),
    result: ResolvedFoodResultSchema,
  })
  .strict();

export type TFoodSearchInput = z.infer<typeof FoodSearchInputSchema>;
export type TFoodSearchHints = z.infer<typeof FoodSearchHintsSchema>;
export type TFoodNutrients = z.infer<typeof FoodNutrientsSchema>;
export type TOpenFoodFactsCandidate = z.infer<typeof OpenFoodFactsCandidateSchema>;
export type TCofidNutrientProfile = z.infer<typeof CofidNutrientProfileSchema>;
export type TFoodMappingRecord = z.infer<typeof FoodMappingRecordSchema>;
export type TNutrientProvenanceEntry = z.infer<typeof NutrientProvenanceEntrySchema>;
export type TResolvedFoodCandidate = z.infer<typeof ResolvedFoodCandidateSchema>;
export type TResolvedFoodResult = z.infer<typeof ResolvedFoodResultSchema>;
export type TFoodSearchApiRequest = z.infer<typeof FoodSearchApiRequestSchema>;
export type TFoodSearchApiResponse = z.infer<typeof FoodSearchApiResponseSchema>;
export type TFoodSource = z.infer<typeof FoodSource>;
export type TQueryKind = z.infer<typeof QueryKind>;
export type TMappingMethod = z.infer<typeof MappingMethod>;
export type TMappingStatus = z.infer<typeof MappingStatus>;
export type TNutrientSource = z.infer<typeof NutrientSource>;
export type TResolutionConfidence = z.infer<typeof ResolutionConfidence>;
export type TResolutionPath = z.infer<typeof ResolutionPath>;
