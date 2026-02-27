# measurements_ledger (Measurement Ledger)

**Purpose:** Single, append-only timeline of observed measurements (vitals, activity) per patient.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** Patient (self), app server; clinicians if assigned. All access audited (who/when/which id).
**Model:** Ledger-only. There is no `measurements_current` collection.

## Shape (summary)

- `kind` · string (`weight|blood_pressure|heart_rate|steps|exercise|sleep`)
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `measuredAt` · Date (when measurement happened)
- `receivedAt` · Date (when app stored it)
- `source` · `patient|device|api|provider`
- `device?` · { `name?`, `platform?`, `externalId?` }
- `notes?` · string
- `createdBy` / `updatedBy` · string ref: `principalId`

Payload fields by `kind`:

- `weight` → `valueKg`
- `blood_pressure` → `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
- `heart_rate` → `bpm`
- `steps` → `count`
- `exercise` → `durationMin`
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

## Indexes (MongoDB shell)

```js
db.measurements_ledger.createIndex({ patientId: 1, kind: 1, measuredAt: -1 });
db.measurements_ledger.createIndex({ patientId: 1, measuredAt: -1 });
db.measurements_ledger.createIndex(
  { orgId: 1, patientId: 1, kind: 1, measuredAt: -1 },
);
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
