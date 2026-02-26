# measurements_ledger (Measurement Ledger)

**Purpose:** Single, append-only timeline of observed measurements (vitals, activity) per patient.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** Patient (self), app server; clinicians if assigned. All access **audited** (who/when/which id).
**Notes:** Store both **`measuredAt`** (when taken) and **`receivedAt`** (ingest time) to handle out-of-order device syncs.

**Boundary:** This collection stores observed facts only. Targets/goals belong in
`targets_current`/`targets_ledger`.

**Read model:** Pair this append-only ledger with `measurements_current` (materialized latest view per `(patientId, kind)`). The ledger is the source of truth; the current collection is derived from it.

## Relationship to measurements_current

- `measurements_ledger` is append-only. Each write creates a new event row.
- `measurements_current` holds the latest _effective_ measurement per `(patientId, kind)` for fast reads.
- Each ledger row references the current row via `currentId`.
- Each current row stores pointers back to the ledger via `latestLedgerId` (and optionally `latestMeasuredAt` / `latestReceivedAt`).

Typical flow:

1. Insert a new ledger row (idempotent via `idemKey`).
2. Upsert the matching current row for `(patientId, kind)`, setting `latestLedgerId` to the new ledger `_id` and copying the latest fields used by the UI.

## Shape (summary)

- `_id` · ObjectId
- `idemKey` · string · idempotency key to dedupe retries (unique per patient)
- `eventType` · `upsert|delete|correct`
- `currentId` · ObjectId · ref: `measurements_current` (the row this event updates)

- `kind` · string (see list below)
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `measuredAt` · Date · when the measurement happened
- `receivedAt` · Date · when the app stored it
- `source` · `patient|device|api|provider`
- `device?` · { name?, platform?, externalId? }
- `notes?` · string?

- `createdAt` / `createdBy`
- `updatedAt` / `updatedBy` · string ref: `principalId` (patients/users_accounts)

- `correctionOf?` · ObjectId · ref: `measurements_ledger` (when `eventType=correct`)
- `supersedes?` · ObjectId · ref: `measurements_ledger` (previous latest ledger row for this `currentId`)

- **Payload fields per kind (stored on the ledger row):**
  - **blood_pressure:** `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
  - **heart_rate:** `bpm`
  - **steps:** `count`
  - **exercise:** `durationMin`
  - **sleep:** `durationMin`, `quality?` (`poor|fair|good|excellent`)
  - **weight:** `valueKg` (kg) — all weight stored as kg (UI converts for display)

## eventType (plain English)

- **upsert**: “set the latest reading for this kind” (normal create/update). The value on this row becomes the current value.
- **delete**: “remove the current value for this kind” (e.g., user deletes a mistaken entry). The ledger keeps the history; the current row is cleared/marked deleted.
- **correct**: “replace a previous ledger row because it was wrong.” Use `correctionOf` to point to the row being corrected. The corrected row becomes the latest effective value in `measurements_current`.

Rule of thumb: the app should choose `eventType` automatically in most cases; only expose it in admin/clinician tooling.

## Example documents

```json
// measurements_ledger (event)
{
  "_id": { "$oid": "66f1b8f6c2ab4a0c9f3a1e88" },
  "idemKey": "w:66f1b7e9c2ab4a0c9f3a1e21:2025-09-25T07:31:00Z:withings:weight",
  "eventType": "upsert",
  "currentId": { "$oid": "66f1b900c2ab4a0c9f3a1e99" },

  "kind": "weight",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "measuredAt": "2025-09-25T07:31:00Z",
  "receivedAt": "2025-09-25T07:31:05Z",
  "source": "device",
  "device": { "name": "Withings Body+", "platform": "ios", "externalId": "withings:abc123" },

  "createdAt": "2025-09-25T07:31:05Z",
  "createdBy": "bdea23a9-405b-4abd-b51e-d996047cf063",
  "updatedAt": "2025-09-25T07:31:05Z",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063",

  "valueKg": 98.5
}

// measurements_current (latest)
{
  "_id": { "$oid": "66f1b900c2ab4a0c9f3a1e99" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "kind": "weight",

  "latestLedgerId": { "$oid": "66f1b8f6c2ab4a0c9f3a1e88" },
  "measuredAt": "2025-09-25T07:31:00Z",
  "receivedAt": "2025-09-25T07:31:05Z",
  "source": "device",
  "device": { "name": "Withings Body+", "platform": "ios", "externalId": "withings:abc123" },

  "updatedAt": "2025-09-25T07:31:05Z",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063",

  "valueKg": 98.5,
  "isDeleted": false
}
```

## Indexes (MongoDB shell)

```js
// measurements_current
db.measurements_current.createIndex(
  { patientId: 1, kind: 1 },
  { unique: true, name: "uniq_patient_kind" },
);
db.measurements_current.createIndex(
  { patientId: 1, updatedAt: -1 },
  { name: "current_by_patient_updated" },
);

// measurements_ledger
db.measurements_ledger.createIndex(
  { currentId: 1, measuredAt: -1 },
  { name: "timeline_by_current" },
);
db.measurements_ledger.createIndex(
  { patientId: 1, kind: 1, measuredAt: -1 },
  { name: "timeline_by_kind" },
);
// Idempotency: unique within a patient (or within org+patient) so retries don't double-write
db.measurements_ledger.createIndex(
  { patientId: 1, idemKey: 1 },
  { unique: true, name: "uniq_patient_idemKey" },
);
// Optional device-level dedupe (only when externalId exists)
db.measurements_ledger.createIndex(
  { "device.externalId": 1, kind: 1, measuredAt: 1 },
  {
    unique: true,
    name: "uniq_device_kind_measuredAt",
    partialFilterExpression: { "device.externalId": { $type: "string" } },
  },
);
```
