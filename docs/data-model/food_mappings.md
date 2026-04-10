# food_mappings

**Purpose:** Reviewed bridge records that map an Open Food Facts barcode product to a specific Edamam food candidate, so barcode-based nutrient lookups can resolve deterministically.

## Why this exists

- Open Food Facts products are barcode-first packaged foods.
- The nutrient lookup pipeline ultimately needs an Edamam `foodId` to call the Edamam nutrients endpoint.
- Free-text matching is noisy for branded products.
- `food_mappings` stores a reviewed mapping from:
  - OFF product identity
  - to an approved Edamam match

This lets the barcode flow stay deterministic once a product has been reviewed.

## Current runtime usage

Today the collection is read in the barcode nutrient flow:

1. A food lookup arrives with `source: "barcode"`.
2. The API reads `food_mappings` for:
   - `barcode`
   - `mappingStatus: "reviewed"`
   - `source: "open_food_facts"`
3. If a reviewed record exists, the stored `edamamMatch.foodId` is used to resolve the Edamam ingredient lookup.
4. If no reviewed mapping exists, the barcode path currently returns `null` from the resolver and falls back to the broader error/fallback flow.

Code reference: [apps/api/app/api/food/nutrients/route.ts](/Users/royadams/Sites/ckd-copilot/apps/api/app/api/food/nutrients/route.ts)

## Shape

- `source` · `"open_food_facts"`
- `barcode` · string|null
- `brand` · string|null
- `productName` · string
- `normalizedName` · string
- `edamamMatch`
  - `foodId` · string
  - `foodLabel` · string
- `confidence` · `high|medium|low`
- `mappingMethod` · `manual|auto_rule|auto_similarity|direct_generic`
- `mappingStatus` · `pending|reviewed|rejected|not_needed`
- `createdAt` · Date
- `updatedAt` · Date

## Example document

```json
{
  "source": "open_food_facts",
  "barcode": "5000112548167",
  "brand": "Heinz",
  "productName": "Baked Beans in Tomato Sauce",
  "normalizedName": "heinz baked beans in tomato sauce",
  "edamamMatch": {
    "foodId": "food_baked_beans_example",
    "foodLabel": "Baked Beans"
  },
  "confidence": "high",
  "mappingMethod": "manual",
  "mappingStatus": "reviewed",
  "createdAt": { "$date": "2026-04-10T00:00:00Z" },
  "updatedAt": { "$date": "2026-04-10T00:00:00Z" }
}
```

## Field logic

### `source`

- Currently fixed to `"open_food_facts"`.
- This makes the collection a provider-specific mapping table, not a general-purpose food identity registry.

### `barcode`

- Usually the OFF product code.
- Nullable because some imported or manually staged rows may be name-based review candidates before a barcode is confirmed.
- Runtime barcode resolution only works when this field is a real string.

### `normalizedName`

- Lower-noise review key for product matching and deduping.
- Intended for case/spacing/punctuation-normalized product names.

### `edamamMatch`

- The target identity used by the nutrients pipeline.
- `foodId` is the important operational field.
- `foodLabel` is a human-readable audit trail and a fallback search hint when the API tries to rehydrate a fresh Edamam hint.

### `confidence`

- Reviewer or matching-system confidence in the stored mapping.
- This is advisory metadata, not the enforcement gate.
- The enforcement gate is `mappingStatus`.

### `mappingMethod`

- `manual`: a human explicitly chose the match.
- `auto_rule`: a deterministic rule picked it.
- `auto_similarity`: a fuzzy/name similarity process picked it.
- `direct_generic`: mapped to a generic Edamam food rather than a brand-specific product.

### `mappingStatus`

- `pending`: candidate exists but is not approved for production use.
- `reviewed`: approved for runtime barcode resolution.
- `rejected`: candidate was reviewed and deemed wrong.
- `not_needed`: packaged product does not need a stored mapping, usually because another path should be used.

Only `reviewed` records are currently used by the API runtime.

## Operational rules

- Treat one barcode as having at most one active reviewed mapping per source.
- Do not use `confidence` alone to decide runtime eligibility.
- Keep `productName` as the original review-facing label.
- Keep `normalizedName` stable so review tooling can search and dedupe consistently.
- If an Edamam match changes, update the same document and bump `updatedAt` rather than creating silent duplicates for the same barcode.

## Indexes

- Unique partial: `{ source: 1, barcode: 1 }` where `barcode` is a string
- Runtime lookup: `{ barcode: 1, mappingStatus: 1, source: 1 }`
- Review queue: `{ mappingStatus: 1, updatedAt: -1 }`
- Search/supporting: `{ normalizedName: 1, brand: 1 }`, `{ "edamamMatch.foodId": 1 }`
