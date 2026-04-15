# measurements_ledger (Measurement Ledger)

**Purpose:** Single timeline of observed measurements (vitals, activity) per patient.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** Patient (self), app server; clinicians if assigned. All access audited (who/when/which id).
**Model:** Ledger-style source of truth. Point-in-time manual readings are appended; provider daily summaries may be idempotently updated by `externalRecordId` so repeated syncs do not create duplicate rows. A `measurements_current` collection may be added later as a read-optimized projection, but `measurements_ledger` remains the source of truth.

## Shape (summary)

- `kind` · string (`weight|blood_pressure|heart_rate|steps|exercise|sleep`)
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `measuredAt` · Date (when measurement happened)
- `receivedAt` · Date (when app stored it)
- `source` · `patient|device|api|provider`
- `provider?` · { `packageName`, `displayName?` } for platform brokers or upstream apps (for example Health Connect data origins)
- `externalRecordId?` · stable upstream or app-generated sync key for deduping imported/provider records
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
- `sleepFromAt?` · Date (sleep start timestamp; required for `kind="sleep"`)
- `sleepToAt?` · Date (sleep end timestamp; required for `kind="sleep"`)
- `createdBy` / `updatedBy` · string ref: `principalId`

Payload fields by `kind`:

- `weight` → `valueKg`
- `blood_pressure` → `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
- `heart_rate` → `bpm`
- `steps` → `count`
- `exercise` → `exercise.exerciseId`, `exercise.title`, `exercise.name`, `exercise.category`, `exercise.intensity`, `exercise.met`, `exercise.durationMin`, `exercise.caloriesKcal`
- `sleep` → `sleepFromAt`, `sleepToAt`, `durationMin`, `quality?` (`poor|fair|good|excellent`)

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

### Example: Health Connect steps summary

```json
{
  "kind": "steps",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "measuredAt": "2026-04-15T12:47:00Z",
  "receivedAt": "2026-04-15T12:47:03Z",
  "source": "provider",
  "provider": {
    "packageName": "com.sec.android.app.shealth",
    "displayName": "shealth"
  },
  "externalRecordId": "health-connect:com.sec.android.app.shealth:steps:2026-04-15",
  "count": 7088,
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

### Example: sleep

```json
{
  "kind": "sleep",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "measuredAt": "2025-09-26T07:10:00Z",
  "receivedAt": "2025-09-26T07:10:12Z",
  "source": "patient",
  "sleepFromAt": "2025-09-25T23:15:00Z",
  "sleepToAt": "2025-09-26T07:10:00Z",
  "durationMin": 475,
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
db.measurements_ledger.createIndex(
  {
    orgId: 1,
    patientId: 1,
    kind: 1,
    "provider.packageName": 1,
    externalRecordId: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      "provider.packageName": { $exists: true },
      externalRecordId: { $exists: true },
    },
  },
);
```

## Notes

- `measurements_ledger` is the source of truth for observed activity/vitals.
- Manual user-entered readings use `source="patient"` and can coexist with provider-synced readings for the same day.
- Health Connect is treated as a provider broker. `provider.packageName` records the contributing app/package selected by the sync logic, not a hard dependency on Samsung Health, Google Fit, or any one phone vendor.
- For daily summary syncs, `externalRecordId` is generated by the app as a deterministic key (`health-connect:{packageName}:steps:{YYYY-MM-DD}`) because the saved row represents a daily aggregate rather than one raw upstream record.
- For watch/exercise/sleep/heart-rate/blood-pressure imports, prefer the upstream record/session id when available; otherwise generate a deterministic key from provider, kind, and the measured interval.
- Manual entries and provider imports are both allowed for exercise, sleep, heart rate, and blood pressure. Provider imports upsert by `externalRecordId`; manual entries remain point-in-time user records.
- “Latest” views should be derived at read time using aggregation (`$sort` + `$group` by `kind`).
- For `kind="exercise"`, store a computed `exercise.caloriesKcal` (derived from MET (Metabolic Equivalent of Task), duration, and weight) so historical values remain stable even if reference tables change.
- For `kind="exercise"`, persist `exercise.title` so display labels remain stable even if exercise reference names are updated later.
