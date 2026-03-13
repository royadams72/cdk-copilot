# Log Meal Favourites Scope

## Goal

Scope the changes for the log meal flow so the user can:

- Land on the log meal screen with a fixed search area at the top.
- Switch between `Foods` and `Meals` directly under search.
- See favourites first when available.
- Add foods from the list with a plus button that becomes a tick once added.
- Edit an added food by opening its detail screen.
- Use a fixed footer for save/update actions.
- Automatically promote repeated foods/meals into favourites, using the last entered amounts.

This document is intentionally a scope and design note only. No implementation work is included.

## Current State

### Mobile UI

Current log meal screen: [LogMeal.tsx](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/apps/mobile/src/screens/log-meal/LogMeal.tsx)

- The screen is food-first already.
- Search input and search button are not fixed.
- There is no `Foods` / `Meals` segmented control.
- The main list is the current meal items summary, not a browsable favourites/results list.
- Save/update actions are rendered inside the scroll content, not fixed to the bottom.
- Each item card currently supports `Remove`, not `Add`.

Current generic card: [food-card.tsx](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/apps/mobile/src/components/food-card.tsx)

- Reusable for both foods and meals.
- Already used by the nutrition edit modal.

Saved meal edit cards today: [NutritionDetails.tsx](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/apps/mobile/src/screens/nutrition/NutritionDetails.tsx#L530)

- Saved-meal edit cards already use `FoodCard`.
- That is the right baseline for favourite meal cards.

Food details flow: [FoodDetails.tsx](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/apps/mobile/src/screens/log-meal/FoodDetails.tsx)

- Food editing happens on the detail screen.
- The add/update action lives there now.

### Backend and persistence

Meal save route: [route.ts](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/apps/api/app/api/food/save/route.ts)

- Each saved meal becomes one `nutrition_ledger` document.
- Each document stores `mealType`, `eatenAt`, `items[]`, `totals`, and metadata.

Meal update route: [route.ts](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/apps/api/app/api/food/update/route.ts)

- Updates replace the entry items/totals on the existing ledger document.

Shared nutrition schema: [nutrition.ts](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/packages/core/src/isomorphic/schemas/nutrition.ts)

- `TNutritionEntry` does not currently have any favourite fields.

Mongo validator: [nutrition_ledger.json](/Users/royadams/Library/CloudStorage/GoogleDrive-adamsroy2211@gmail.com/My%20Drive/_Sites/ckd-copilot/scripts/mongo-validators/nutrition_ledger.json)

- Validator also has no favourite fields yet.

## Requested UX Changes

## 1. Fixed top area

The following should remain fixed at the top of the log meal screen:

- Search input
- Search button
- `Foods` / `Meals` toggle buttons
- Favourites area, if the intended behavior is that favourites stay visible while the content beneath scrolls

Important UX decision:

- If favourites can be long, they should probably scroll within the main content rather than be fully fixed.
- Recommended interpretation: fix the search row and the `Foods` / `Meals` toggle; keep the favourites section at the top of the scroll content, immediately below them.

Reason:

- A fully fixed favourites block can consume too much vertical space on smaller phones.

## 2. Foods / Meals segmented control

On entry to log meal:

- `Foods` is selected by default.
- `Meals` sits beside it.
- The selected tab is visually highlighted.

Behavior:

- `Foods` shows food favourites first, then food search results or available foods.
- `Meals` shows favourite meals and/or saved meals.
- Switching tabs should animate horizontally if feasible.

Recommended implementation:

- Start with a simple stateful tab switch.
- Add slide animation only if it does not complicate gesture and fixed-header layout behavior.

## 3. Favourite ordering

When favourites exist:

- Show them initially below the search/tabs.
- Show favourites for both meals and individual foods in their respective tabs.

Recommended ordering:

1. Favourites
2. Recent items
3. Search-driven content

This gives a stable first-load experience without requiring search.

## 4. Food cards in the `Foods` tab

Requested behavior:

- Cards should be similar to current food cards.
- Instead of only a remove action, they need an add control.
- The add control is a green circular button with a white plus.
- Once added, it changes to a tick.
- To edit the food, the user taps the card and goes to the detail screen.

Recommended behavior details:

- Tapping the card opens food details.
- Tapping the green plus adds the current default quantity/unit immediately.
- After add, show a tick state for that same card while the item is present in the current meal.
- If the item is already in the current meal, tapping the card still opens edit.

## 5. Meal cards in the `Meals` tab

Requested behavior:

- Use the same card pattern as the edit meal modal.

Recommended card content:

- Meal title
- Last used time or meal type
- Food summary line
- Primary action: `Add`
- Optional secondary action later: `Edit template` if meal templates become separately editable

Important distinction:

- A logged meal entry is not the same thing as a reusable saved meal template.
- If the `Meals` tab is intended to show reusable favourite meals, those should behave like templates copied into the current editing state, not like direct edits on historical ledger entries.

## 6. Fixed footer

Requested behavior:

- Fixed footer should always be present.
- It should contain:
  - `Add Meal` for create mode, or
  - `Edit` and `Update Meal` side by side for edit mode

Recommended refinement:

- Create mode: one primary CTA, `Add Meal`
- Edit mode: `Delete Meal` and `Update Meal`, or `Cancel` and `Update Meal`

Reason:

- `Edit` is ambiguous when already on the edit screen.
- Current code already has update/delete semantics, not edit/update semantics.

If you want strict adherence to the requested label set, that is possible, but the wording is slightly confusing.

## Data Model Options For Favourites

## Option A: Add `isFavourite` to `nutrition_ledger`

Example:

- Add `isFavourite?: boolean` on meal entries.

Pros:

- Very small schema change.
- Easy to query favourite meals only.

Cons:

- Only solves favourite meals, not favourite individual foods.
- A ledger entry is a historical event, not a reusable preference record.
- If the same meal is logged five times, which ledger row is the favourite source of truth?
- Last-used quantities are hard to maintain cleanly across duplicates.
- Detecting "added twice" by scanning ledger rows on each save will get more expensive as data grows unless we add dedicated indexes and aggregation logic.

Conclusion:

- Acceptable only if favourites are meal-only and loosely defined.
- Not a good fit for favourite foods.

## Option B: Derive favourites from `nutrition_ledger` each time

Behavior:

- Query ledger entries/items.
- Aggregate occurrences at read time.
- Treat count >= 2 as favourite.

Pros:

- No extra write path.
- Ledger remains source of truth.

Cons:

- Read path gets more expensive.
- Food-level aggregation is non-trivial because the same food may arrive with different names, units, source IDs, or measures.
- Harder to guarantee fast initial load on mobile.

Conclusion:

- Good for reporting or backfill.
- Not ideal for the primary UX path.

## Option C: New derived `nutrition_favourites` collection

Recommended.

Shape concept:

- `_id`
- `patientId`
- `kind`: `food | meal`
- `signature`: normalized identity key
- `label`
- `mealType` optional
- `timesUsed`
- `lastUsedAt`
- `isFavourite`
- `snapshot`
- `createdAt`
- `updatedAt`

For foods, `snapshot` would hold:

- `foodId`
- `name`
- `quantity`
- `unit`
- nutrients if needed for card display

For meals, `snapshot` would hold:

- meal title/label
- `items[]`
- `totals`
- optional default `mealType`

How it works:

- On meal save/update, derive item signatures and a meal signature.
- Increment counts.
- When count reaches 2, mark `isFavourite = true`.
- Replace `snapshot` with the latest entered quantity/unit so the last-used amounts are preserved.

Pros:

- Fast initial read path.
- Clean separation between historical ledger and reusable favourites.
- Works for both meals and foods.
- Easy to change favourite rules later.

Cons:

- More implementation work.
- Requires write-side sync logic.
- Needs a clear signature strategy.

Conclusion:

- Best fit for the requested feature set.

## Recommended Favourite Identity Rules

## Foods

Use a normalized food signature, preferably:

- `patientId + normalized foodId`

Fallback when `foodId` is unstable:

- `patientId + normalized name + normalized unit`

Important:

- Quantity should not be part of the signature.
- Quantity/unit should live in the stored snapshot so the latest amount can overwrite the previous default.

This matches the requirement that repeated foods become favourites with the amounts that were input last.

## Meals

Use a normalized meal signature based on item composition:

- ordered or sorted list of normalized food signatures
- plus normalized quantities/units if you want "same meal with materially different amounts" treated as different meals

Recommended first pass:

- Sort foods by signature
- Include rounded quantity + unit in the signature

Reason:

- Meal favourites should preserve last used amounts.
- If quantities differ a lot, users will usually expect those to be distinct favourite meal variants.

## Recommended Architecture

## Phase 1 scope

1. Restructure log meal screen into:
   - fixed top header
   - segmented control
   - scrollable tab content
   - fixed footer
2. Add two list modes:
   - foods
   - meals
3. Introduce favourite query endpoints for:
   - favourite foods
   - favourite meals
4. Introduce derived favourite persistence on meal save/update.
5. Reuse `FoodCard` for favourite meals and adapt food card actions for add/tick state.

## Recommended backend changes

- Keep `nutrition_ledger` as the historical log.
- Do not rely on `isFavourite` on `nutrition_ledger` alone.
- Add a new derived collection, likely `nutrition_favourites`.
- Update favourite records on:
  - save meal
  - update meal
- Optionally backfill favourites from old ledger data with a script later.

## Recommended frontend changes

- Add tab state to the log meal screen.
- Split current list rendering into:
  - current meal summary
  - favourite foods list
  - favourite meals list
- Move save/update controls into a sticky footer.
- Add visual selected state for foods already added.
- Keep food editing in the existing detail screen.

## Open Questions

These should be resolved before implementation:

1. Should favourites be shown only when the search field is empty, or always pinned above search results?
2. In create mode, should the fixed footer show only `Add Meal`, or also a secondary action such as `Cancel`?
3. In edit mode, should the left footer button be `Delete Meal`, `Cancel`, or literally `Edit`?
4. For favourite meals, should selecting one:
   - append its items into the current meal, or
   - replace the current meal draft?
5. Should favourite foods/meals be scoped by meal type, or available across all meal types?
6. Should users be able to manually unfavourite something, or is favourite status fully automatic?
7. Should old historical data be backfilled so favourites exist immediately for existing users?

## Recommendation Summary

Recommended path:

- Build the UI around fixed search + tabs + fixed footer.
- Keep `Foods` as the default tab.
- Reuse current `FoodCard` styling for meals.
- Add plus/tick interaction for foods.
- Keep food edits in the detail screen.
- Store favourites in a new derived collection instead of only adding `isFavourite` to `nutrition_ledger`.

Why:

- It cleanly supports both favourite meals and favourite foods.
- It avoids expensive ledger scans on every initial load.
- It keeps historical logging separate from reusable favourites.

## Minimal Alternative

If you want the lightest possible first version:

- Add `isFavourite` only for meals in `nutrition_ledger`
- Do not support automatic favourite foods yet
- Build the UI tabs and footer first
- Add food favourites in a second pass

This is cheaper, but it does not meet the full request cleanly.
