# weekly_nutrition_insights

**Purpose:** Stored weekly nutrition findings and swap suggestions generated from `nutrition_ledger`, targets, and `food_swap_rules`.

## Shape

- `patientId` · string
- `weekStart` · `YYYY-MM-DD`
- `weekEnd` · `YYYY-MM-DD`
- `goal` · primary effective goal from `patient_goals_current`
  - `weight_loss|weight_maintenance|weight_gain|reduce_phosphorus|reduce_potassium|reduce_sodium|increase_protein|improve_energy|better_meal_routine|general_health`
- `findings[]`
  - `type` · string (for example `high_phosphorus`, `low_protein`)
  - `severity` · `low|moderate|high`
  - `actual` · number
  - `target` · number
  - `topFoods[]` · top 2-3 contributors
  - `topContributors[]` · `{ food, nutrientAmount, contribution }`
- `suggestions[]`
  - `fromFood` · string
  - `reason` · `phosphorus|potassium|sodium|protein|calories`
  - `alternatives[]` · same-role lower-risk foods
- `humanMessage` · short user-facing summary
- `generatedAt` · Date
- `createdAt` · Date
- `updatedAt` · Date

## Generation flow

1. Read the last completed 7-day window from `nutrition_ledger`.
2. Compare weekly totals with mapped nutrition targets.
3. For breached metrics, compute each food contribution:
   `foodContribution = (nutrient_from_food / total_nutrient) * 100`
4. Keep the top 2-3 contributors.
5. Read each contributor's stored taxonomy.
6. Rank `primarySwapGroup` and `secondarySwapGroups` by nutrient relevance.
7. Map the best available `swapGroup + nutrientFocus` through `food_swap_rules`.
8. Suggest alternatives in the same food role.
9. Read primary goal context from `patient_goals_current`.
10. Use AI only to turn the already-determined findings into a short human-friendly message.

## Routes

- `POST /api/nutrition/weekly-summary/run`
  - Patient-authenticated: generate for the current patient.
  - Cron/internal: provide `x-cron-secret: $WEEKLY_NUTRITION_CRON_SECRET` and optionally `patientId`.
- `GET /api/nutrition/weekly-summary/latest`
  - Returns the latest stored summary for the signed-in patient.

## Background use

- Intended to run once per week after the week closes.
- The route accepts an optional `referenceDate` to support cron backfills or deterministic testing.
