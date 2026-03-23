# food_swap_rules

**Purpose:** Rule table that maps a food taxonomy `swapGroup` plus a nutrient focus to clinically safer alternatives in the same food role.

## Why this exists

- Weekly nutrition analysis should not invent substitutions with AI.
- The app first identifies high contributors from logged foods.
- Each logged food already carries taxonomy, including `swapGroup`.
- Mixed dishes can carry `primarySwapGroup` and `secondarySwapGroups`, with `swapGroup` kept as a compatibility alias of the primary role.
- `food_swap_rules` tells the system which alternative groups are valid for a given nutrient problem.

Example:

- `cheddar cheese` -> `swapGroup: "hard_cheese"`
- nutrient issue -> `phosphorus`
- rule lookup -> `hard_cheese + phosphorus`
- result -> `["soft_cheese", "cream_cheese_spread"]`

That is how the system can say:

- `Cheddar cheese contributed 28% of your phosphorus intake`
- `Try swapping it for cream cheese or ricotta`

## Shape

- `swapGroup` · string
- `nutrientFocus` · `phosphorus|potassium|sodium|protein|calories`
- `candidateSwapGroups[]` · string[] · one or more allowed destination groups
- `strategy` · `lower_nutrient_same_role|increase_nutrient_same_role|lower_density_same_role|higher_protein_same_role|lower_calorie_same_role`
- `preferredFoodIds` · ObjectId[]|null
- `excludedFoodIds` · ObjectId[]|null
- `preferredTaxonomyKeys` · string[]|null
- `excludedTaxonomyKeys` · string[]|null
- `minSimilarityScore` · number|null
- `notes` · string|null
- `tags[]` · string[]|null - These describe the purpose/context of the rule.
- `isActive` · boolean
- `createdAt` · Date
- `updatedAt` · Date

## Core lookup key

The primary rule identity is:

- `swapGroup`
- `nutrientFocus`

There should usually be one active rule per combination.

## Example document

```json
{
  "swapGroup": "hard_cheese",
  "nutrientFocus": "phosphorus",
  "candidateSwapGroups": ["soft_cheese", "cream_cheese_spread"],
  "strategy": "lower_nutrient_same_role",
  "minSimilarityScore": 0.7,
  "notes": "Prefer spreadable or softer cheese-type alternatives with lower phosphorus.",
  "tags": ["dairy", "phosphorus"],
  "isActive": true,
  "createdAt": { "$date": "2026-03-19T00:00:00Z" },
  "updatedAt": { "$date": "2026-03-19T00:00:00Z" }
}
```

## How weekly analysis uses it

1. Read the patient's logged foods for the completed week.
2. Find top contributors for a nutrient such as phosphorus or sodium.
3. Read each food's stored taxonomy.
4. Rank the food's available swap groups:
   - `primarySwapGroup`
   - `secondarySwapGroups`
5. Query `food_swap_rules` with the most nutrient-relevant matching `swapGroup`:
   - `swapGroup`
   - `nutrientFocus`
   - `isActive: true`
6. Use `candidateSwapGroups` to find alternative taxonomy groups.
7. Suggest foods from those groups.

## Important behavior

- Rules are deterministic and authored by you.
- AI should only rephrase the final summary for the patient.
- AI should not decide:
  - whether a nutrient is high or low
  - which foods were the top contributors
  - which swap groups apply
  - whether a substitution is clinically appropriate

## Notes on `other`

- Foods with taxonomy `majorGroup: "other"` and `swapGroup: null` will not resolve through `food_swap_rules`.
- If you want a food category to be swappable, it needs a meaningful taxonomy `swapGroup`.

## Typical swap group pairs

- `hard_cheese + phosphorus` -> `soft_cheese`
- `hard_cheese + sodium` -> `soft_cheese`
- `pasta + phosphorus` -> `plain_pasta`, `rice`
- `pasta + sodium` -> `plain_pasta`, `rice`
- `processed_meat + sodium` -> `fresh_poultry`, `egg`, `fresh_fish`
- `bacon + sodium` -> `egg`, `fresh_poultry`
- `cola_soft_drink + phosphorus` -> `water`, `water_flavoured`, `low_phosphate_soft_drink`
- `soft_drink + calories` -> `water`, `water_flavoured`
- `crisps + sodium` -> `unsalted_snack`, `plain_crackers`

## Indexes

- Unique: `{ swapGroup: 1, nutrientFocus: 1 }`
- Supporting:
  - `{ swapGroup: 1, isActive: 1 }`
  - `{ nutrientFocus: 1, isActive: 1 }`
  - `{ candidateSwapGroups: 1 }`
  - `{ updatedAt: -1 }`
