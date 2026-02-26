# measurements_current (Measurement Current)

**Purpose:** Fast “latest value” read model for measurements per patient and kind (latest effective reading).
**Source of truth:** Derived from `measurements_ledger`.
**Contains PII (Personally Identifiable Information):** No direct PII; linked via `patientId`.
**Access:** Patient (self), app server; clinicians if assigned. All access **audited** (who/when/which id).
**Notes:** One row per `(patientId, kind)`.

## Relationship to measurements_ledger

- `measurements_ledger` is append-only and records every write as an event.
- `measurements_current` is updated (upserted) when a new ledger event is accepted.
- `measurements_current.latestLedgerId` points to the ledger row that produced the current state.
- For deletes, `measurements_current.isDeleted=true` (and payload fields may be removed or nulled).

## Shape (summary)

- `_id` · ObjectId
- `patientId` · ObjectId (ref: patients)
- `orgId` · string
- `kind` · string (same kind list as ledger)

- `latestLedgerId` · ObjectId · ref: `measurements_ledger`
- `measuredAt` · Date · when the measurement happened (copied from latest ledger row)
- `receivedAt` · Date · when stored (copied from latest ledger row)
- `source` · `patient|device|api|provider`
- `device?` · { name?, platform?, externalId? }
- `notes?` · string?

- `isDeleted` · boolean
- `deletedAt?` · Date
- `deletedBy?` · string ref: `principalId`

- `createdAt` / `createdBy`
- `updatedAt` / `updatedBy` · string ref: `principalId`

- **Payload fields per kind (same as ledger, stored on the current row for fast reads):**
  - **blood_pressure:** `systolicMmHg`, `diastolicMmHg`, `pulseBpm?`
  - **heart_rate:** `bpm`
  - **steps:** `count`
  - **exercise:** `durationMin`
  - **sleep:** `durationMin`, `quality?` (`poor|fair|good|excellent`)
  - **weight:** `valueKg`

## Example document

```json
{
  "_id": { "$oid": "66f1b900c2ab4a0c9f3a1e99" },
  "patientId": { "$oid": "66f1b7e9c2ab4a0c9f3a1e21" },
  "orgId": "org_rf_london",
  "kind": "weight",

  "latestLedgerId": { "$oid": "66f1b8f6c2ab4a0c9f3a1e88" },
  "measuredAt": "2025-09-25T07:31:00Z",
  "receivedAt": "2025-09-25T07:31:05Z",
  "source": "device",
  "device": {
    "name": "Withings Body+",
    "platform": "ios",
    "externalId": "withings:abc123"
  },

  "updatedAt": "2025-09-25T07:31:05Z",
  "updatedBy": "bdea23a9-405b-4abd-b51e-d996047cf063",

  "valueKg": 98.5,
  "isDeleted": false
}
```

## Indexes (MongoDB shell)

```js
db.measurements_current.createIndex(
  { patientId: 1, kind: 1 },
  { unique: true, name: "uniq_patient_kind" },
);
db.measurements_current.createIndex(
  { patientId: 1, updatedAt: -1 },
  { name: "current_by_patient_updated" },
);
```

## Privacy & retention

    •	Treat as Clinical: restrict by role, audit all reads/writes; no payloads in logs.
    •	measurements_current can be rebuilt from measurements_ledger if needed; retention rules mainly apply to the ledger.
