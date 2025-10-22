# measurements_ledger (Measurement Ledger)

**Purpose:** Single, append-only timeline of measurements (vitals, activity, labs) per user.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** User (self), app server; clinicians if assigned. All access **audited** (who/when/which id).
**Notes:** Store both **`measuredAt`** (when taken) and **`receivedAt`** (ingest time) to handle out‑of‑order device syncs.

## Shape (summary)

- `kind`: string (see list below)
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `measuredAt` · Date · when the measurement happened
- `receivedAt` · Date · when the app stored it
- `source` · `user|device|api|provider`
- `device?` · { name?, platform?, externalId? }
- `notes?` · string?
- `createdBy` / `updatedBy` · string ref: `principalId` from patients or users_accounts

- **Fields per kind:**

  - **weight:** `kg/lbs`
  - **blood_pressure:** `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
  - **heart_rate:** `bpm`
  - **steps:** `count`
  - **exercise:** `durationMin`
  - **sleep:** `durationMin`, `quality?` (`poor|fair|good|excellent`)
  - **weight:** `valueKg` (kg) - all weight stored as kg, for simplicity and converted by the UI

## Example documents

```json
{
  "kind": "weight",
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "measuredAt": "2025-09-25T07:31:00Z",
  "receivedAt": "2025-09-25T07:31:05Z",
  "source": "device",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063",
  "device": { "name": "Withings Body+" },
  "valueKg": 98.5
}
```

## Indexes (MongoDB shell)

```js
db.measurements_ledger.createIndex({ patientId: 1, kind: 1, measuredAt: -1 }); // latest-by-kind
db.measurements_ledger.createIndex({ patientId: 1, measuredAt: -1 }); // timelines
db.measurements_ledger.createIndex(
  { "device.externalId": 1 },
  { sparse: true, unique: true }
); // dedupe
```

## Privacy & retention

- Treat as **Clinical**: restrict by role, audit all reads/writes; no payloads in logs.
- Keep forever unless policy dictates otherwise; you can summarise or downsample old activity data.
