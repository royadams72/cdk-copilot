# Food Resolver

## Summary

This resolver is UK-first and deterministic.

- Open Food Facts is the primary discovery and search layer.
- CoFID is the reference truth layer for generic foods and missing nutrients.
- OFF-first does **not** mean OFF-only.

The resolver always starts from the AI-normalised input provided upstream. It does not parse meal text itself.

## Why OFF-first was chosen

- Users often mean a retail product even when they type a generic-looking phrase such as `basmati rice`.
- OFF is stronger for branded and packaged discovery, barcode-backed records, and UK retail availability.
- Searching OFF first avoids prematurely collapsing user intent into a generic food.

## Why OFF-first is not OFF-only

OFF product data can still be weak or ambiguous:

- dry vs cooked
- plain vs flavoured
- microwave pouch vs bagged rice
- duplicate or low-quality listings
- missing potassium or phosphorus

The resolver scores and filters OFF candidates before trusting them. If the best OFF result is not decisive enough, it falls back to CoFID.

## Decision tree

1. Normalise and lightly clean the AI-provided `normalizedText`.
2. Classify the query with deterministic heuristics:
   - `generic`
   - `branded`
   - `mixed`
   - `meal_like`
   - `unknown`
3. Search OFF first.
4. Score OFF candidates using:
   - token overlap and phrase closeness
   - brand match bonus
   - UK relevance
   - packaged-product signals
   - plain vs flavoured penalties
   - nutrient completeness
   - low-quality penalties
5. Decide if the top OFF result is good enough using:
   - minimum score threshold
   - gap to the next candidate
   - mismatch flags such as cooked-state conflicts
6. If OFF is strong:
   - use OFF
   - enrich missing nutrients from CoFID when needed
7. If OFF is weak or ambiguous:
   - resolve a generic CoFID food directly

## OFF scoring model

The scoring model is practical rather than fuzzy-heavy.

- Positive signals:
  - token coverage
  - exact phrase inclusion
  - explicit brand match
  - UK relevance
  - clear packaged-product evidence
  - plain/natural wording for generic queries
- Negative signals:
  - flavoured or seasoned variants when the query is generic
  - cooked-state mismatch for staple foods like rice
  - poor nutrient completeness
  - suspicious or low-quality listing text

## CoFID enrichment

CoFID enrichment only fills gaps.

- OFF label values are kept when present.
- CoFID is used mainly for missing generic reference nutrients.
- CKD-critical nutrients such as potassium and phosphorus are the main enrichment target.
- Enriched values are marked in provenance.

## Provenance model

Each nutrient has:

- `value`
- `source`
- `confidence`

Sources:

- `open_food_facts_label`
- `cofid_reference`
- `merged`
- `unknown`

Typical result:

- sodium from OFF label
- potassium from CoFID
- phosphorus from CoFID

## API route

`POST /api/food/search`

Request body:

```json
{
  "query": "Birds Eye chicken burger",
  "normalizedText": "birds eye chicken burger",
  "hints": {
    "grams": 100
  }
}
```

Response body includes:

- `query`
- `normalizedQuery`
- `queryKind`
- `selectedResult`
- `alternatives`
- `resolutionPath`
- `confidence`
- `ambiguityFlags`
- `nutrients`
- `provenance`

The route validates input with Zod and degrades safely to CoFID fallback if OFF search fails.

## UI behavior

The mobile log-meal flow consumes the resolver directly.

- search input stays in the mobile meal logging screen
- best result appears first with alternatives behind the same result group
- source, confidence, resolution path, and estimated-status are shown in the mobile result card/detail flow
- provenance is shown on the mobile food details screen
