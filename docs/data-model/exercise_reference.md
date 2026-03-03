# exercise_reference (Exercise Reference)

**Purpose:** Reference list of exercise/activity types with standardized intensity values (MET (Metabolic Equivalent of Task)) for estimating energy expenditure (calories burned).
**Contains PII (Personally Identifiable Information):** No.
**Access:** App server + clients (read-only). Admin-only writes. Changes audited.
**Model:** Reference data (versioned/curated). Can be used to compute calories for `measurements_ledger.kind="exercise"`.

## What this is used for

- Provide a searchable list of activities for users (walking, cycling, rowing, etc.).
- Provide MET values per activity so the app can estimate calories.
- Optionally store the chosen activity type alongside an exercise measurement event.

Source of truth for MET assignments: the Compendium of Physical Activities (2024 Adult Compendium). [oai_citation:0‡Compendium of Physical Activities](https://pacompendium.com/adult-compendium/?utm_source=chatgpt.com)
Background paper describing the 2024 update and scope. [oai_citation:1‡PubMed](https://pubmed.ncbi.nlm.nih.gov/38242596/?utm_source=chatgpt.com)

## Calories calculation (recommended)

When you have:

- user weight in kilograms (`weightKg`)
- duration in minutes (`durationMin`)
- activity MET (`met`)

Use:

caloriesKcal = met × weightKg × (durationMin / 60)

Notes:

- This is an estimate. Device-reported calories (if available) can be stored separately, but a computed value is useful for consistency.

## Shape (summary)

- `exerciseId` · string (stable slug; primary identifier for app usage)
- `name` · string (display name)
- `category` · string (e.g., `walking|running|cycling|strength|conditioning|sports|swimming|flexibility`)
- `intensity` · string (`light|moderate|vigorous`)
- `met` · number (MET (Metabolic Equivalent of Task) value)
- `compendiumCode?` · string (activity code from the Compendium, when available)
- `notes?` · string
- `source` · { `compendium`: string, `url`: string, `activityCode?`: string }
- `updatedAt` · Date

## Example document

```json
{
  "exerciseId": "cycling_12_13_9_mph",
  "name": "Cycling, 12–13.9 mph (moderate effort)",
  "category": "cycling",
  "intensity": "vigorous",
  "met": 8.0,
  "compendiumCode": "01030",
  "notes": "Leisure cycling at moderate effort.",
  "source": {
    "compendium": "Compendium of Physical Activities (2024 Adult Compendium)",
    "url": "https://pacompendium.com/",
    "activityCode": "01030"
  },
  "updatedAt": "2026-03-02T00:00:00.000Z"
}
```

## Indexes (MongoDB shell)

```js
db.exercise_reference.createIndex({ exerciseId: 1 }, { unique: true });
db.exercise_reference.createIndex({ category: 1, intensity: 1 });
db.exercise_reference.createIndex({ name: "text", notes: "text" });
```

# Notes / integration

- If a user logs an exercise event, store the chosen exerciseId (from this collection) alongside the exercise measurement so you can explain “where the calories came from”.
- Recommended pattern:
- exercise_reference supplies met
- app computes caloriesKcal at write time
- measurements_ledger stores { durationMin, caloriesKcal } (and optionally exerciseId)
