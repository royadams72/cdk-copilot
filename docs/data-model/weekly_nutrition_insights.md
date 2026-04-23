# weekly_nutrition_insights

**Purpose:** Stored weekly nutrition findings and swap suggestions generated from `nutrition_ledger`, targets, and `food_swap_rules`.

## Shape

- `patientId` · string
- `weekStart` · `YYYY-MM-DD`
- `weekEnd` · `YYYY-MM-DD`
- `goal` · primary effective goal from `patient_goals_current`
  - `weight_loss|weight_maintenance|weight_gain|reduce_phosphorus|reduce_potassium|reduce_sodium|increase_protein|improve_energy|better_meal_routine|general_health`
- `analysisMode` · `weekly_average|logged_day_average|insufficient_data`
- `loggedDays` · number of distinct logged days in the 7-day window
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
2. Count distinct logged days in the 7-day window.
3. Choose analysis mode:
   - `weekly_average` when logging coverage is strong
   - `logged_day_average` when the week is only partially logged
   - `insufficient_data` when there are too few logged days for a reliable nutrient interpretation
4. Compare intake with mapped nutrition targets using the chosen mode.
5. For breached metrics, compute each food contribution:
   `foodContribution = (nutrient_from_food / total_nutrient) * 100`
6. Keep the top 2-3 contributors.
7. Read each contributor's stored taxonomy.
8. Rank `primarySwapGroup` and `secondarySwapGroups` by nutrient relevance.
9. Map the best available `swapGroup + nutrientFocus` through `food_swap_rules`.
10. Suggest alternatives in the same food role.
11. Read primary goal context from `patient_goals_current`.
12. Use AI only to turn the already-determined findings into a short human-friendly message.

## Sparse logging behavior

- If the patient logs meals on fewer than 3 days in the week, the insight stores `analysisMode: "insufficient_data"` and should not give nutrient advice such as "increase protein".
- If the patient logs meals on 3-4 days, the insight stores `analysisMode: "logged_day_average"` and the message should make clear the interpretation is based on logged days only.

## Routes

- `POST /api/nutrition/weekly-summary/run`
  - Patient-authenticated: generate for the current patient.
- `GET /api/nutrition/weekly-summary/run`
  - Cron/internal: Vercel cron invokes the route with `GET`.
  - Secure it with `Authorization: Bearer $CRON_SECRET` and optionally pass `patientId` / `referenceDate` as query params.
- `GET /api/nutrition/weekly-summary/latest`
  - Returns the latest stored summary for the signed-in patient.

## Background use

- Intended to run once per week after the week closes.
- The route accepts an optional `referenceDate` to support cron backfills or deterministic testing.
