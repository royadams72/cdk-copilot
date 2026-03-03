# measurements_ledger (Measurement Ledger)

**Purpose:** Single, append-only timeline of observed measurements (vitals, activity) per patient.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** Patient (self), app server; clinicians if assigned. All access audited (who/when/which id).
**Model:** Ledger-only. A `measurements_current` collection may be added later as a read-optimized projection, but `measurements_ledger` remains the source of truth.

## Shape (summary)

- `kind` · string (`weight|blood_pressure|heart_rate|steps|exercise|sleep`)
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `measuredAt` · Date (when measurement happened)
- `receivedAt` · Date (when app stored it)
- `source` · `patient|device|api|provider`
- `device?` · { `name?`, `platform?`, `externalId?` }
- `notes?` · string
- `exercise?` · {
  `exerciseId`: string,
  `title`: string,
  `name`: string (legacy alias),
  `category`: string,
  `intensity`: `light|moderate|vigorous`,
  `met`: number,
  `durationMin`: number,
  `caloriesKcal`: number
  } (only when `kind="exercise"`)
- `createdBy` / `updatedBy` · string ref: `principalId`

Payload fields by `kind`:

- `weight` → `valueKg`
- `blood_pressure` → `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
- `heart_rate` → `bpm`
- `steps` → `count`
- `exercise` → `exercise.exerciseId`, `exercise.title`, `exercise.name`, `exercise.category`, `exercise.intensity`, `exercise.met`, `exercise.durationMin`, `exercise.caloriesKcal`
- `sleep` → `durationMin`, `quality?` (`poor|fair|good|excellent`)

## Example

```json
{
  "kind": "weight",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "measuredAt": "2025-09-25T07:31:00Z",
  "receivedAt": "2025-09-25T07:31:05Z",
  "source": "device",
  "device": { "name": "Withings Body+" },
  "valueKg": 98.5,
  "createdBy": "pr_66f1b7e9c2ab4a0c9f3a1e21",
  "updatedBy": "pr_66f1b7e9c2ab4a0c9f3a1e21"
}
```

### Example: exercise

```json
{
  "kind": "exercise",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "measuredAt": "2025-09-25T18:10:00Z",
  "receivedAt": "2025-09-25T18:10:10Z",
  "source": "patient",
  "exercise": {
    "exerciseId": "cycling_12_13_9_mph",
    "title": "Cycling, 12–13.9 mph (moderate effort)",
    "name": "Cycling, 12–13.9 mph (moderate effort)",
    "category": "cycling",
    "intensity": "vigorous",
    "met": 8,
    "durationMin": 35,
    "caloriesKcal": 320
  },
  "createdBy": "pr_66f1b7e9c2ab4a0c9f3a1e21",
  "updatedBy": "pr_66f1b7e9c2ab4a0c9f3a1e21"
}
```

## Indexes (MongoDB shell)

```js
db.measurements_ledger.createIndex({ patientId: 1, kind: 1, measuredAt: -1 });
db.measurements_ledger.createIndex({ patientId: 1, measuredAt: -1 });
db.measurements_ledger.createIndex({
  orgId: 1,
  patientId: 1,
  kind: 1,
  measuredAt: -1,
});
db.measurements_ledger.createIndex(
  { "device.externalId": 1, kind: 1, measuredAt: 1 },
  {
    unique: true,
    partialFilterExpression: { "device.externalId": { $exists: true } },
  },
);
```

## Notes

- `measurements_ledger` is the source of truth for observed activity/vitals.
- “Latest” views should be derived at read time using aggregation (`$sort` + `$group` by `kind`).
- For `kind="exercise"`, store a computed `exercise.caloriesKcal` (derived from MET (Metabolic Equivalent of Task), duration, and weight) so historical values remain stable even if reference tables change.
- For `kind="exercise"`, persist `exercise.title` so display labels remain stable even if exercise reference names are updated later.
