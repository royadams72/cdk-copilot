# food_mappings

**Purpose:** Stable 1:1 bridge between an Open Food Facts product and the CoFID reference food used for enrichment. This makes enrichment repeatable, reviewable, and less dependent on recalculating fuzzy matches on every search.

## Why this exists

- OFF is the primary discovery layer, but not the only nutrition truth source.
- CoFID is the reference layer for generic foods and CKD-critical nutrient fill-in.
- Once a product-to-reference match is known, it should be reused consistently.

## Shape

- `source` · `open_food_facts`
- `barcode` · string|null
- `brand` · string|null
- `productName` · string
- `normalizedName` · string
- `cofidMatch.foodCode` · string
- `cofidMatch.foodName` · string
- `confidence` · `high|medium|low`
- `mappingMethod` · `manual|auto_rule|auto_similarity|direct_generic`
- `mappingStatus` · `pending|reviewed|rejected|not_needed`
- `createdAt` · Date
- `updatedAt` · Date

## Runtime usage

1. Resolver selects an OFF product.
2. Resolver checks `food_mappings` by `source + barcode`.
3. If a reviewed mapping exists, it is reused directly.
4. If no reviewed mapping exists, generic CoFID matching runs.
5. If a reasonable CoFID match is found, a pending mapping is upserted for later review.

## Indexes

- Unique partial: `{ source: 1, barcode: 1 }` when `barcode` is a string
- Lookup: `{ normalizedName: 1 }`
- Review queues: `{ mappingStatus: 1, confidence: 1 }`
