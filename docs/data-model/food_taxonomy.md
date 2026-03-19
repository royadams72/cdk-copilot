# food_taxonomy

**Purpose:** Stable taxonomy documents for logged foods. Used to classify foods, aggregate weekly nutrient contributors, and drive same-category substitution suggestions.

## Key design

- The collection is keyed by `taxonomyKey`, not by Mongo `_id` from CoFID.
- `taxonomyKey` is derived from:
  - `source`
  - `sourceFoodId`
  - `normalizedName`
- This keeps taxonomy stable across user logs, Edamam matches, and seeded foods.

## Shape

- `source` · string
- `sourceFoodId` · string
- `taxonomyKey` · string · unique
- `canonicalName` · string
- `normalizedName` · string
- `majorGroup` · `protein|dairy|grain|fruit_veg|drink|snack|condiment|mixed|dessert|other`
- `subGroup` · string|null
- `swapGroup` · string|null
- `tags[]` · string - These describe the food itself.
- `inferredFrom`
  - `override` · bool
  - `exactName` · bool
  - `keywordRules[]` · string
  - `categoryHint` · string|null
  - `nutrientTags[]` · string
- `createdAt` · Date
- `updatedAt` · Date

## Current `subGroup` list

These are the subgroup values currently produced by the runtime inference rules and fallback logic:

- `bread`
- `cheese`
- `dessert`
- `egg`
- `fish`
- `fruit`
- `mixed_dish`
- `pasta`
- `poultry`
- `processed_meat`
- `rice`
- `savoury_snack`
- `shellfish`
- `soft_cheese`
- `soft_drink`
- `sweet_food`
- `vegetable`
- `nuts_and_seeds`
- `spread`

Also possible:

- `null`
  Used when a food falls into `other` and no more specific subgroup was inferred.

## Notes on coverage

- The subgroup list is rule-driven, not a closed ontology yet.
- If a food type is important for swaps or weekly analysis, it should get an explicit subgroup and `swapGroup`.

## Current `swapGroup` list

These are the `swapGroup` values currently produced by the runtime inference rules and default subgroup mapping:

- `bacon`
- `bread`
- `cola_soft_drink`
- `crisps`
- `dessert`
- `egg`
- `fish`
- `fresh_fish`
- `fresh_poultry`
- `fruit`
- `hard_cheese`
- `mixed_meal`
- `pasta`
- `rice`
- `shellfish`
- `soft_cheese`
- `soft_drink`
- `vegetable`
- `nuts_and_seeds`
- `spread`

Also possible:

- `null`
  Used when no swap role has been inferred, which means the weekly swap pipeline cannot suggest an alternative for that food yet.

## Notes on swap coverage

- `swapGroup` is the operational key used by `food_swap_rules`.
- A food can have a valid `majorGroup` and `subGroup` but still be non-swappable if `swapGroup` is `null`.
- If a category should generate substitutions in weekly analysis, it needs an explicit `swapGroup` and a matching `food_swap_rules` entry.

## Runtime flow

1. User searches Edamam and picks a food.
2. The log-meal save or update route derives `taxonomyKey`.
3. If `food_taxonomy` already has that key, the existing document is reused.
4. If not, taxonomy is inferred from food name and nutrient rules, inserted, and returned.
5. A taxonomy snapshot is embedded onto the logged ledger item.

## Inference rules

- Exact and keyword rules cover common foods such as cheddar, cream cheese, ricotta, cottage cheese, bacon, sausage, prawns, chicken, turkey, salmon, tuna, cod, haddock, egg, pasta, bread, rice, cola, crisps, desserts, sandwiches, pizza, lasagne, and curry.
- Nutrient-driven tags are added from the logged portion:
  - `high_protein`
  - `phosphorus_dense`
  - `potassium_dense`
  - `high_sodium`

## Indexes

- Unique: `{ taxonomyKey: 1 }`
- Lookup: `{ source: 1, sourceFoodId: 1 }`
- Search/supporting: `{ normalizedName: 1 }`, `{ majorGroup: 1, subGroup: 1, swapGroup: 1 }`, `{ swapGroup: 1 }`, `{ tags: 1 }`
