# Nutrition Monthly Summary

## Purpose

Support a `current month detail, historical summary only` model for nutrition.

Detailed meal entries can remain in `nutrition_ledger` for the active month, while
historical clinician and patient monthly views read from a derived monthly summary
collection.

## Collection

Use:

```text
nutrition_monthly_patient_summary
```

## Proposed document shape

```json
{
  "patientId": "ObjectId or string id",
  "month": "2026-06",
  "daysLogged": 18,
  "totals": {
    "phosphorusMg": 9860,
    "potassiumMg": 15420,
    "sodiumMg": 12410,
    "proteinG": 694,
    "caloriesKcal": 32280
  },
  "dailyAverages": {
    "phosphorusMg": 547.8,
    "potassiumMg": 856.7,
    "sodiumMg": 689.4,
    "proteinG": 38.6,
    "caloriesKcal": 1793.3
  },
  "targetSnapshot": {
    "phosphorusMg": 800,
    "potassiumMg": 2000,
    "sodiumMg": 2000,
    "proteinG": 56,
    "caloriesKcal": 2100
  },
  "topFoods": {
    "phosphorusMg": [
      {
        "food": "Rice",
        "timesLogged": 18,
        "totalAmount": 2100,
        "averageAmount": 116.7,
        "previousMonthAmount": 1640,
        "trend": "increased",
        "levelLabel": "Medium-high"
      }
    ]
  },
  "sourceVersion": 1,
  "generatedAt": "2026-07-01T00:05:00.000Z",
  "updatedAt": "2026-07-01T00:05:00.000Z"
}
```

## Notes

- `patientId` should tolerate legacy `ObjectId` and string storage during migration.
- `month` uses `YYYY-MM`.
- `targetSnapshot` is intentionally duplicated into the summary so historical
  months can retain the target context that was true when the month closed.
- `topFoods` is keyed by nutrient so the clinician portal can switch filters
  without recomputing food rankings from raw ledger data.

## Update strategy

1. Keep current-month detail in `nutrition_ledger`.
2. On month close, aggregate the completed month into
   `nutrition_monthly_patient_summary`.
3. Historical portal views prefer the summary collection.
4. Raw ledger remains fallback until the backfill is complete.

## Portal behavior

- Current route:
  `apps/api/app/api/portal/patients/[patientId]/nutrition/route.ts`
- Preferred read path:
  `nutrition_monthly_patient_summary`
- Fallback read path:
  `nutrition_ledger`

This allows migration without breaking the existing portal screen.
